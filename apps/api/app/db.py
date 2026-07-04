"""Supabase 데이터 계층 (service_role).

백엔드는 service_role 키로 접근해 RLS를 우회하고, 스코프(fridge 소유·user_id)는
앱단에서 명시적으로 강제한다. 클라이언트는 동기 API이며 BackgroundTasks(스레드풀)와
요청 핸들러 양쪽에서 그대로 쓴다.
"""

from __future__ import annotations

from functools import lru_cache

from supabase import Client, create_client

from .config import get_settings
from .normalize import Normalized, alias_key


@lru_cache
def get_client() -> Client:
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured")
    return create_client(s.supabase_url, s.supabase_service_role_key)


# ── 냉장고 ────────────────────────────────────────────────────────────────
def get_or_create_personal_fridge(user_id: str) -> str:
    """사용자의 개인 냉장고 id. 없으면 생성(개인 냉장고 = 멤버 1명인 fridge)."""
    c = get_client()
    rows = (
        c.table("fridges")
        .select("id")
        .eq("owner_user_id", user_id)
        .order("created_at")
        .limit(1)
        .execute()
    )
    if rows.data:
        return rows.data[0]["id"]
    created = c.table("fridges").insert({"owner_user_id": user_id}).execute()
    return created.data[0]["id"]


# ── 정규화 사전 ───────────────────────────────────────────────────────────
def load_aliases(
    user_id: str,
) -> tuple[dict[str, tuple[str, str | None]], dict[str, tuple[str, str | None]]]:
    """1차 정규화용 (user 사전, global 사전) 로드. key = alias_key(raw_text)."""
    c = get_client()
    rows = (
        c.table("item_aliases")
        .select("raw_text, normalized_name, category, scope, user_id")
        .or_(f"scope.eq.global,and(scope.eq.user,user_id.eq.{user_id})")
        .execute()
    )
    user_d: dict[str, tuple[str, str | None]] = {}
    global_d: dict[str, tuple[str, str | None]] = {}
    for r in rows.data or []:
        entry = (r["normalized_name"], r.get("category"))
        target = user_d if r["scope"] == "user" else global_d
        target[r["raw_text"]] = entry
    return user_d, global_d


def upsert_user_alias(
    user_id: str, raw_text: str, name: str, category: str | None
) -> None:
    """3차 학습: 사용자 보정을 개인 사전에 반영(SD-3의 승격 후보). hit_count 증가."""
    c = get_client()
    key = alias_key(raw_text)
    existing = (
        c.table("item_aliases")
        .select("id, hit_count")
        .eq("scope", "user")
        .eq("user_id", user_id)
        .eq("raw_text", key)
        .limit(1)
        .execute()
    )
    if existing.data:
        row = existing.data[0]
        c.table("item_aliases").update(
            {"normalized_name": name, "category": category, "hit_count": row["hit_count"] + 1}
        ).eq("id", row["id"]).execute()
    else:
        c.table("item_aliases").insert(
            {
                "scope": "user",
                "user_id": user_id,
                "raw_text": key,
                "normalized_name": name,
                "category": category,
            }
        ).execute()


# ── 영수증 작업 ───────────────────────────────────────────────────────────
def create_job(user_id: str, fridge_id: str, image_path: str | None) -> str:
    c = get_client()
    res = (
        c.table("receipt_jobs")
        .insert(
            {
                "user_id": user_id,
                "fridge_id": fridge_id,
                "image_path": image_path,
                "status": "processing",
            }
        )
        .execute()
    )
    return res.data[0]["id"]


def get_job(job_id: str, user_id: str) -> dict | None:
    c = get_client()
    res = (
        c.table("receipt_jobs")
        .select("id, status, parsed, error")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def finish_job_done(job_id: str, parsed: list[dict]) -> None:
    _update_job(job_id, {"status": "done", "parsed": parsed})


def finish_job_failed(job_id: str, error: str) -> None:
    _update_job(job_id, {"status": "failed", "error": error[:500]})


def _update_job(job_id: str, fields: dict) -> None:
    from datetime import datetime, timezone

    fields = {**fields, "updated_at": datetime.now(timezone.utc).isoformat()}
    get_client().table("receipt_jobs").update(fields).eq("id", job_id).execute()


# ── 재고 ──────────────────────────────────────────────────────────────────
def insert_inventory(fridge_id: str, items: list[dict]) -> list[dict]:
    """확정된 품목을 재고에 적재. expire_at은 S2(소비기한)에서 채운다."""
    c = get_client()
    payload = [
        {
            "fridge_id": fridge_id,
            "name": it["name"],
            "category": it.get("category", "기타"),
            "qty": it.get("qty", 1),
            "unit": it.get("unit", "개"),
            "source": "receipt",
        }
        for it in items
    ]
    res = c.table("inventory_items").insert(payload).execute()
    return res.data or []


def normalized_to_parsed(n: Normalized) -> dict:
    """정규화 결과 → API/보정 UI용 ParsedItem(camelCase, packages/shared 계약)."""
    return {
        "rawText": n.raw_text,
        "name": n.name,
        "qty": n.qty,
        "unit": n.unit,
        "category": n.category,
    }
