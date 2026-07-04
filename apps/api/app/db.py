"""Supabase 데이터 계층 (service_role).

백엔드는 service_role 키로 접근해 RLS를 우회하고, 스코프(fridge 소유·user_id)는
앱단에서 명시적으로 강제한다. 클라이언트는 동기 API이며 BackgroundTasks(스레드풀)와
요청 핸들러 양쪽에서 그대로 쓴다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from functools import lru_cache

from supabase import Client, create_client

from . import expiry
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


# ── 소비기한 기준표·오버라이드 (S2) ───────────────────────────────────────
def load_consumption_reference() -> tuple[dict[str, int], dict[str, int]]:
    """기준표를 (item_days, category_days)로 로드.

    item_days:     name 규칙 행 { 표준명: 일수 }
    category_days: name NULL(카테고리 기본값) 행 { 카테고리: 일수 }
    """
    c = get_client()
    rows = (
        c.table("consumption_reference")
        .select("name, category, default_days")
        .execute()
    )
    item_days: dict[str, int] = {}
    category_days: dict[str, int] = {}
    for r in rows.data or []:
        if r.get("name"):
            item_days[r["name"]] = r["default_days"]
        else:
            category_days[r["category"]] = r["default_days"]
    return item_days, category_days


def load_user_overrides(user_id: str) -> dict[str, int]:
    """사용자 개인화 오버라이드 { 품목명: custom_days }."""
    c = get_client()
    rows = (
        c.table("user_overrides")
        .select("item_name, custom_days")
        .eq("user_id", user_id)
        .execute()
    )
    return {r["item_name"]: r["custom_days"] for r in (rows.data or [])}


def upsert_user_override(user_id: str, item_name: str, custom_days: int) -> None:
    """오버라이드 저장(품목당 1개). 존재 시 갱신."""
    c = get_client()
    existing = (
        c.table("user_overrides")
        .select("id")
        .eq("user_id", user_id)
        .eq("item_name", item_name)
        .limit(1)
        .execute()
    )
    if existing.data:
        c.table("user_overrides").update(
            {
                "custom_days": custom_days,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", existing.data[0]["id"]).execute()
    else:
        c.table("user_overrides").insert(
            {"user_id": user_id, "item_name": item_name, "custom_days": custom_days}
        ).execute()


def recompute_expiry_for_name(
    fridge_id: str, item_name: str, custom_days: int
) -> int:
    """오버라이드 반영: 해당 냉장고의 활성 품목 중 이름이 같은 항목의
    expire_at = purchased_at + custom_days 로 즉시 재계산한다. 갱신 건수 반환."""
    c = get_client()
    rows = (
        c.table("inventory_items")
        .select("id, purchased_at")
        .eq("fridge_id", fridge_id)
        .eq("name", item_name)
        .eq("status", "active")
        .execute()
    )
    for r in rows.data or []:
        purchased = date.fromisoformat(r["purchased_at"])
        new_expire = (purchased + timedelta(days=custom_days)).isoformat()
        c.table("inventory_items").update({"expire_at": new_expire}).eq(
            "id", r["id"]
        ).execute()
    return len(rows.data or [])


# ── 재고 ──────────────────────────────────────────────────────────────────
def insert_inventory(user_id: str, fridge_id: str, items: list[dict]) -> list[dict]:
    """확정된 품목을 재고에 적재. 소비기한 기준표로 expire_at을 채운다(S2)."""
    c = get_client()
    item_days, category_days = load_consumption_reference()
    overrides = load_user_overrides(user_id)
    today = date.today()
    payload = [
        {
            "fridge_id": fridge_id,
            "name": it["name"],
            "category": it.get("category", "기타"),
            "qty": it.get("qty", 1),
            "unit": it.get("unit", "개"),
            "source": "receipt",
            "expire_at": expiry.compute_expire_at(
                it["name"],
                it.get("category", "기타"),
                today,
                item_days,
                category_days,
                overrides,
            ).isoformat(),
        }
        for it in items
    ]
    res = c.table("inventory_items").insert(payload).execute()
    return res.data or []


def list_inventory(fridge_id: str) -> list[dict]:
    """활성 재고를 임박 순(expire_at 오름차순)으로 반환. NULL 만료는 뒤로."""
    c = get_client()
    res = (
        c.table("inventory_items")
        .select(
            "id, fridge_id, name, category, qty, unit, "
            "purchased_at, expire_at, source, status"
        )
        .eq("fridge_id", fridge_id)
        .eq("status", "active")
        .order("expire_at", desc=False, nullsfirst=False)
        .execute()
    )
    return res.data or []


# ── 푸시 구독·알림 (S3) ────────────────────────────────────────────────────
def upsert_push_subscription(
    user_id: str, endpoint: str, p256dh: str, auth: str
) -> None:
    """Web Push 구독 저장. endpoint 유니크 → 재구독 시 소유자·키 갱신."""
    c = get_client()
    c.table("push_subscriptions").upsert(
        {"user_id": user_id, "endpoint": endpoint, "p256dh": p256dh, "auth": auth},
        on_conflict="endpoint",
    ).execute()


def delete_push_subscription(endpoint: str) -> None:
    """만료/해지된 구독 정리(푸시 404·410 또는 사용자 구독 해제)."""
    get_client().table("push_subscriptions").delete().eq(
        "endpoint", endpoint
    ).execute()


def list_push_subscriptions(user_id: str) -> list[dict]:
    """유저의 모든 기기 구독을 pywebpush 입력 형태로 반환."""
    c = get_client()
    rows = (
        c.table("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", user_id)
        .execute()
    )
    return [
        {"endpoint": r["endpoint"], "keys": {"p256dh": r["p256dh"], "auth": r["auth"]}}
        for r in (rows.data or [])
    ]


def insert_notification(
    user_id: str, title: str, body: str, item_ids: list[str]
) -> str:
    """인앱 알림함에 알림 1건 적재. id 반환."""
    c = get_client()
    res = (
        c.table("notifications")
        .insert(
            {"user_id": user_id, "type": "expiring", "title": title, "body": body,
             "item_ids": item_ids}
        )
        .execute()
    )
    return res.data[0]["id"]


def list_notifications(user_id: str, limit: int = 30) -> tuple[list[dict], int]:
    """최근 알림 목록과 미읽음 수 반환."""
    c = get_client()
    rows = (
        c.table("notifications")
        .select("id, type, title, body, item_ids, read_at, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    data = rows.data or []
    unread = sum(1 for r in data if not r.get("read_at"))
    return data, unread


def mark_notification_read(user_id: str, notif_id: str) -> bool:
    """알림 읽음 처리(본인 것만). 갱신 여부 반환."""
    c = get_client()
    res = (
        c.table("notifications")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", notif_id)
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .execute()
    )
    return bool(res.data)


def load_expiring_by_user(today: date, threshold_days: int) -> dict[str, list[dict]]:
    """임박(threshold 이내) + 미발송(오늘 아직) 활성 품목을 유저별로 그룹핑.

    inventory_items → fridges(owner_user_id) 임베드로 소유자를 얻는다.
    반환: { user_id: [ {id, name, expire_at(date)} ] }
    """
    c = get_client()
    cutoff = (today + timedelta(days=threshold_days)).isoformat()
    rows = (
        c.table("inventory_items")
        .select("id, name, expire_at, notified_at, fridges(owner_user_id)")
        .eq("status", "active")
        .not_.is_("expire_at", "null")
        .lte("expire_at", cutoff)
        .execute()
    )
    grouped: dict[str, list[dict]] = {}
    today_iso = today.isoformat()
    for r in rows.data or []:
        if r.get("notified_at") and r["notified_at"] >= today_iso:
            continue  # 오늘 이미 발송함(cron 재실행 중복 방지)
        fridge = r.get("fridges") or {}
        owner = fridge.get("owner_user_id")
        if not owner:
            continue
        grouped.setdefault(owner, []).append(
            {"id": r["id"], "name": r["name"],
             "expire_at": date.fromisoformat(r["expire_at"])}
        )
    return grouped


def mark_items_notified(item_ids: list[str], today: date) -> None:
    """발송한 품목에 notified_at=today 기록(중복 발송 가드)."""
    if not item_ids:
        return
    get_client().table("inventory_items").update(
        {"notified_at": today.isoformat()}
    ).in_("id", item_ids).execute()


# ── 레시피 추천 캐시·소비 처리 (S4) ───────────────────────────────────────
def get_recipe_cache(fridge_id: str, snapshot_hash: str) -> list[dict] | None:
    """스냅샷 해시로 캐시된 추천 결과 조회. 없으면 None(재고 상태 변경 = 캐시 미스)."""
    c = get_client()
    rows = (
        c.table("recipe_cache")
        .select("recipes")
        .eq("fridge_id", fridge_id)
        .eq("snapshot_hash", snapshot_hash)
        .limit(1)
        .execute()
    )
    return rows.data[0]["recipes"] if rows.data else None


def set_recipe_cache(
    fridge_id: str, snapshot_hash: str, recipes: list[dict]
) -> None:
    """추천 결과를 (fridge, 스냅샷) 키로 캐싱. 동일 키면 갱신(upsert)."""
    get_client().table("recipe_cache").upsert(
        {"fridge_id": fridge_id, "snapshot_hash": snapshot_hash, "recipes": recipes},
        on_conflict="fridge_id,snapshot_hash",
    ).execute()


def consume_inventory_items(
    user_id: str, fridge_id: str, item_ids: list[str], action: str
) -> int:
    """활성 품목을 소비/폐기 처리(F5).

    - status 전이(active→consumed|discarded) + consumed_at 기록.
    - waste_logs에 이벤트 적재(S6 리포트 원천). 폐기·소비 모두 남겨 소진율 계산에 쓴다.
    스코프 강제: 본인 냉장고의 active 항목만 대상. 갱신 건수 반환.
    """
    if not item_ids or action not in ("consumed", "discarded"):
        return 0
    c = get_client()
    rows = (
        c.table("inventory_items")
        .select("id, name, category, qty, unit")
        .eq("fridge_id", fridge_id)
        .eq("status", "active")
        .in_("id", item_ids)
        .execute()
    )
    targets = rows.data or []
    if not targets:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    ids = [r["id"] for r in targets]
    c.table("inventory_items").update(
        {"status": action, "consumed_at": now}
    ).in_("id", ids).execute()

    c.table("waste_logs").insert(
        [
            {
                "fridge_id": fridge_id,
                "user_id": user_id,
                "item_id": r["id"],
                "name": r["name"],
                "category": r.get("category", "기타"),
                "qty": r.get("qty", 1),
                "unit": r.get("unit", "개"),
                "action": action,
            }
            for r in targets
        ]
    ).execute()
    return len(targets)


def normalized_to_parsed(n: Normalized) -> dict:
    """정규화 결과 → API/보정 UI용 ParsedItem(camelCase, packages/shared 계약)."""
    return {
        "rawText": n.raw_text,
        "name": n.name,
        "qty": n.qty,
        "unit": n.unit,
        "category": n.category,
    }
