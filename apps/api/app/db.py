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
    fridge_id = created.data[0]["id"]
    # 개인 냉장고 = owner 1명이 member로도 등록된 fridge (S5 공유 냉장고 정합성).
    c.table("fridge_members").upsert(
        {"fridge_id": fridge_id, "user_id": user_id, "role": "owner"},
        on_conflict="fridge_id,user_id",
    ).execute()
    return fridge_id


# ── 공유 냉장고: 멤버십·초대·변경로그 (S5) ─────────────────────────────────
def list_user_fridges(user_id: str) -> list[dict]:
    """사용자가 속한 모든 냉장고를 role·name과 함께 반환(fridge 스위처용)."""
    c = get_client()
    rows = (
        c.table("fridge_members")
        .select("role, fridge_id, fridges(id, name, owner_user_id)")
        .eq("user_id", user_id)
        .order("joined_at")
        .execute()
    )
    out: list[dict] = []
    for r in rows.data or []:
        f = r.get("fridges") or {}
        if not f:
            continue
        out.append(
            {
                "id": f["id"],
                "name": f.get("name", "내 냉장고"),
                "role": r["role"],
                "isOwner": f.get("owner_user_id") == user_id,
            }
        )
    return out


def get_member_role(user_id: str, fridge_id: str) -> str | None:
    """멤버십 역할(owner|member). 멤버가 아니면 None."""
    c = get_client()
    rows = (
        c.table("fridge_members")
        .select("role")
        .eq("fridge_id", fridge_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return rows.data[0]["role"] if rows.data else None


def resolve_fridge(user_id: str, fridge_id: str | None) -> tuple[str, str]:
    """요청의 대상 냉장고를 확정한다.

    fridge_id 미지정 → 개인 냉장고(자동 생성). 지정 시 멤버십 검증.
    반환: (fridge_id, role). 비멤버면 PermissionError.
    """
    if not fridge_id:
        fid = get_or_create_personal_fridge(user_id)
        return fid, "owner"
    role = get_member_role(user_id, fridge_id)
    if role is None:
        raise PermissionError("이 냉장고의 멤버가 아닙니다")
    return fridge_id, role


def rename_fridge(fridge_id: str, name: str) -> None:
    get_client().table("fridges").update({"name": name}).eq("id", fridge_id).execute()


def create_invite(
    fridge_id: str, created_by: str, role: str, expires_at: datetime
) -> dict:
    """만료형 초대 토큰 발급. 토큰은 DB default(gen_random_bytes)로 생성."""
    c = get_client()
    res = (
        c.table("fridge_invites")
        .insert(
            {
                "fridge_id": fridge_id,
                "created_by": created_by,
                "role": role,
                "expires_at": expires_at.isoformat(),
            }
        )
        .execute()
    )
    return res.data[0]


def get_invite(token: str) -> dict | None:
    c = get_client()
    rows = (
        c.table("fridge_invites")
        .select("id, token, fridge_id, role, expires_at, accepted_at, fridges(name)")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    return rows.data[0] if rows.data else None


def accept_invite(token: str, user_id: str) -> dict:
    """초대 수락 → 멤버 편입. 만료/이미수락/이미멤버를 검증한다.

    반환: {fridge_id, name, alreadyMember}.
    """
    inv = get_invite(token)
    if inv is None:
        raise ValueError("초대 링크가 유효하지 않습니다")
    expires = datetime.fromisoformat(inv["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if inv.get("accepted_at"):
        raise ValueError("이미 사용된 초대 링크입니다")
    if expires < datetime.now(timezone.utc):
        raise ValueError("만료된 초대 링크입니다")

    fridge_id = inv["fridge_id"]
    name = (inv.get("fridges") or {}).get("name", "공유 냉장고")
    already = get_member_role(user_id, fridge_id) is not None
    c = get_client()
    if not already:
        c.table("fridge_members").insert(
            {"fridge_id": fridge_id, "user_id": user_id, "role": inv["role"]}
        ).execute()
        log_activity(fridge_id, user_id, "member_joined", {})
    c.table("fridge_invites").update(
        {"accepted_by": user_id, "accepted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", inv["id"]).execute()
    return {"fridgeId": fridge_id, "name": name, "alreadyMember": already}


def list_members(fridge_id: str) -> list[dict]:
    c = get_client()
    rows = (
        c.table("fridge_members")
        .select("user_id, role, joined_at")
        .eq("fridge_id", fridge_id)
        .order("joined_at")
        .execute()
    )
    return rows.data or []


def remove_member(fridge_id: str, actor_user_id: str, target_user_id: str) -> bool:
    """멤버 제거(owner 전용). owner 자신은 제거 불가. 제거 성공 시 True."""
    if get_member_role(target_user_id, fridge_id) == "owner":
        return False
    c = get_client()
    res = (
        c.table("fridge_members")
        .delete()
        .eq("fridge_id", fridge_id)
        .eq("user_id", target_user_id)
        .execute()
    )
    removed = bool(res.data)
    if removed:
        log_activity(
            fridge_id, actor_user_id, "member_removed", {"userId": target_user_id}
        )
    return removed


def log_activity(
    fridge_id: str, actor_user_id: str, action: str, detail: dict
) -> None:
    """변경 로그 적재(협업 신뢰용). 실패해도 본 흐름을 막지 않는다."""
    try:
        get_client().table("fridge_activity").insert(
            {
                "fridge_id": fridge_id,
                "actor_user_id": actor_user_id,
                "action": action,
                "detail": detail,
            }
        ).execute()
    except Exception:  # noqa: BLE001 - 로그 적재 실패는 본 요청을 실패시키지 않는다
        pass


def list_activity(fridge_id: str, limit: int = 50) -> list[dict]:
    c = get_client()
    rows = (
        c.table("fridge_activity")
        .select("id, actor_user_id, action, detail, created_at")
        .eq("fridge_id", fridge_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return rows.data or []


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


def get_waste_report(fridge_id: str, months: int = 6) -> dict:
    """절약/낭비 리포트 (S6, F7).

    waste_logs를 집계해 월별 소비/폐기 통계와 상위 폐기 품목을 반환한다.
    - months: 조회 기간 (개월). 지난 months-1개월 첫 날부터 오늘까지.
    - 반환: {months: [...], top_discarded: [...], totals: {...}}
      각 month 버킷은 consumed_count, discarded_count, consumed_amount, discarded_amount.
      est_price는 현재 항상 NULL이므로 amount는 0이 예상되고, count가 신호.
    """
    c = get_client()

    # 시작일: (months-1)개월 전 첫 날 (UTC)
    today_utc = datetime.now(timezone.utc)
    today_date = today_utc.date()
    # months-1개월 전 첫 날 계산
    first_of_this_month = today_date.replace(day=1)
    target_month = first_of_this_month.replace(day=1)
    for _ in range(months - 1):
        if target_month.month == 1:
            target_month = target_month.replace(year=target_month.year - 1, month=12)
        else:
            target_month = target_month.replace(month=target_month.month - 1)

    cutoff_iso = target_month.isoformat()

    # waste_logs 조회: logged_at >= cutoff_iso
    rows = (
        c.table("waste_logs")
        .select("name, category, action, est_price, logged_at")
        .eq("fridge_id", fridge_id)
        .gte("logged_at", cutoff_iso)
        .execute()
    )
    logs = rows.data or []

    # 월별 버킷 초기화 (지난 months-1개월 첫날부터 오늘까지의 모든 달)
    month_buckets: dict[str, dict] = {}
    current_month = target_month
    for _ in range(months):
        month_key = current_month.strftime("%Y-%m")
        month_buckets[month_key] = {
            "month": month_key,
            "consumed_count": 0,
            "discarded_count": 0,
            "consumed_amount": 0.0,
            "discarded_amount": 0.0,
        }
        # 다음 달로
        if current_month.month == 12:
            current_month = current_month.replace(year=current_month.year + 1, month=1)
        else:
            current_month = current_month.replace(month=current_month.month + 1)

    # 로그 집계
    top_discarded_map: dict[str, int] = {}
    total_consumed_count = 0
    total_discarded_count = 0
    total_consumed_amount = 0.0
    total_discarded_amount = 0.0

    for log in logs:
        # 월 키 추출
        logged_at_str = log.get("logged_at", "")
        if logged_at_str:
            logged_date = datetime.fromisoformat(logged_at_str)
            if logged_date.tzinfo is None:
                logged_date = logged_date.replace(tzinfo=timezone.utc)
            month_key = logged_date.date().strftime("%Y-%m")
        else:
            continue

        action = log.get("action", "")
        est_price = log.get("est_price")
        amount = float(est_price) if est_price is not None else 0.0

        if action == "consumed":
            if month_key in month_buckets:
                month_buckets[month_key]["consumed_count"] += 1
                month_buckets[month_key]["consumed_amount"] += amount
            total_consumed_count += 1
            total_consumed_amount += amount
        elif action == "discarded":
            if month_key in month_buckets:
                month_buckets[month_key]["discarded_count"] += 1
                month_buckets[month_key]["discarded_amount"] += amount
            total_discarded_count += 1
            total_discarded_amount += amount
            # 폐기 품목 집계
            name = log.get("name", "")
            if name:
                top_discarded_map[name] = top_discarded_map.get(name, 0) + 1

    # top_discarded: 상위 5개
    top_discarded = sorted(
        [{"name": k, "count": v} for k, v in top_discarded_map.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:5]

    # 반환 구조
    return {
        "months": sorted(month_buckets.values(), key=lambda x: x["month"]),
        "top_discarded": top_discarded,
        "totals": {
            "discarded_count": total_discarded_count,
            "consumed_count": total_consumed_count,
            "saved_amount": total_consumed_amount,
            "wasted_amount": total_discarded_amount,
        },
    }


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


# ── 레시피 공유 URL (S7, F9) ──────────────────────────────────────────────
def create_shared_recipe(
    user_id: str, fridge_id: str | None, title: str, recipe: dict
) -> str:
    """생성 레시피를 공개 공유용으로 스냅샷 저장. slug 반환(DB default로 생성)."""
    c = get_client()
    res = (
        c.table("shared_recipes")
        .insert(
            {
                "created_by": user_id,
                "fridge_id": fridge_id,
                "title": title,
                "recipe": recipe,
            }
        )
        .execute()
    )
    return res.data[0]["slug"]


def get_shared_recipe(slug: str) -> dict | None:
    """공개 조회(무인증). slug로 단건. 조회수는 best-effort로 증가."""
    c = get_client()
    rows = (
        c.table("shared_recipes")
        .select("slug, title, recipe, view_count, created_at")
        .eq("slug", slug)
        .limit(1)
        .execute()
    )
    if not rows.data:
        return None
    row = rows.data[0]
    try:  # 조회수 집계 실패는 렌더를 막지 않는다
        c.table("shared_recipes").update(
            {"view_count": row.get("view_count", 0) + 1}
        ).eq("slug", slug).execute()
    except Exception:  # noqa: BLE001
        pass
    return row


def list_shared_recipe_slugs(limit: int = 1000) -> list[dict]:
    """사이트맵용 최근 공유 레시피(slug, created_at). 공개 무인증."""
    c = get_client()
    rows = (
        c.table("shared_recipes")
        .select("slug, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return rows.data or []


# ── SD-1 이벤트 트래킹 ─────────────────────────────────────────────────────
def insert_events(session_id: str, user_id: str | None, events: list[dict]) -> int:
    """이벤트 배치 적재. 개인식별 없이 session_id + type + props만. 적재 건수 반환."""
    if not events:
        return 0
    rows = [
        {
            "session_id": session_id,
            "user_id": user_id,
            "type": e["type"],
            "props": e.get("props") or {},
        }
        for e in events
    ]
    res = get_client().table("analytics_events").insert(rows).execute()
    return len(res.data or [])


# ── SD-2 동의·거버넌스 ─────────────────────────────────────────────────────
_CONSENT_DEFAULT = {"data_consent": False, "receipt_retain": False, "onboarded": False}


def get_consent(user_id: str) -> dict:
    """동의 설정 조회. 없으면 기본(프라이버시 우선)으로 간주(행은 생성하지 않음)."""
    c = get_client()
    rows = (
        c.table("user_consent")
        .select("data_consent, receipt_retain, onboarded")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    return rows.data[0] if rows.data else dict(_CONSENT_DEFAULT)


def set_consent(
    user_id: str,
    *,
    data_consent: bool | None = None,
    receipt_retain: bool | None = None,
    onboarded: bool | None = None,
) -> dict:
    """동의 설정 upsert(부분 갱신). 갱신된 최종 상태를 반환."""
    current = get_consent(user_id)
    merged = {
        "data_consent": current["data_consent"] if data_consent is None else data_consent,
        "receipt_retain": current["receipt_retain"]
        if receipt_retain is None
        else receipt_retain,
        "onboarded": current["onboarded"] if onboarded is None else onboarded,
    }
    get_client().table("user_consent").upsert(
        {
            "user_id": user_id,
            **merged,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id",
    ).execute()
    return merged


def purge_receipt_originals() -> int:
    """보관 미동의(receipt_retain=false) 영수증 원본을 파기(SD-2 cron).

    파기 대상: image_path가 있고 아직 purged_at이 없는 작업 중, 소유자의
    receipt_retain이 false인 것(동의 행이 없으면 기본 false=파기). 삭제 후 purged_at 기록.
    반환: 파기한 원본 수.
    """
    from . import storage

    c = get_client()
    jobs = (
        c.table("receipt_jobs")
        .select("id, user_id, image_path")
        .not_.is_("image_path", "null")
        .is_("purged_at", "null")
        .execute()
    )
    rows = jobs.data or []
    if not rows:
        return 0

    # 보관 동의한 사용자 집합(true인 사람만 남긴다).
    retained = (
        c.table("user_consent")
        .select("user_id")
        .eq("receipt_retain", True)
        .execute()
    )
    retain_users = {r["user_id"] for r in (retained.data or [])}

    purged = 0
    now = datetime.now(timezone.utc).isoformat()
    for job in rows:
        if job["user_id"] in retain_users:
            continue  # 보관 동의 → 유지
        try:
            storage.delete_receipt(job["image_path"])
        except Exception:  # noqa: BLE001 - 이미 없는 객체 등은 무시하고 파기로 마킹
            pass
        c.table("receipt_jobs").update({"purged_at": now}).eq("id", job["id"]).execute()
        purged += 1
    return purged


def normalized_to_parsed(n: Normalized) -> dict:
    """정규화 결과 → API/보정 UI용 ParsedItem(camelCase, packages/shared 계약)."""
    return {
        "rawText": n.raw_text,
        "name": n.name,
        "qty": n.qty,
        "unit": n.unit,
        "category": n.category,
    }
