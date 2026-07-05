"""내부 배치 엔드포인트 (S3 임박 알림 발송).

GitHub Actions cron이 X-Internal-Token으로 호출한다(.github/workflows/notify.yml).
상시 스케줄러 없이 일 1회 실행으로 임박 항목을 조회 → 유저별 그룹핑 →
인앱 알림 적재 + Web Push 발송. 인앱 알림은 항상 남기고, 푸시는 구독이 있으면 보낸다.
"""

from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, status

from .. import db, notify, push
from ..config import Settings, get_settings
from ..notify import ExpiringItem
from ..schemas import NotifyExpiringResponse, PurgeReceiptsResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["internal"])


def _require_internal_token(
    x_internal_token: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    if not settings.internal_token:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "INTERNAL_TOKEN not configured"
        )
    if x_internal_token != settings.internal_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid internal token")


@router.post("/internal/notify-expiring", dependencies=[Depends(_require_internal_token)])
def notify_expiring(
    settings: Settings = Depends(get_settings),
) -> NotifyExpiringResponse:
    today = date.today()
    grouped = db.load_expiring_by_user(today, settings.expiry_threshold_days)

    users_notified = 0
    push_sent = 0
    items_flagged = 0

    for user_id, raw_items in grouped.items():
        items = [
            ExpiringItem(id=r["id"], name=r["name"], expire_at=r["expire_at"])
            for r in raw_items
        ]
        items = notify.select_expiring(items, today, settings.expiry_threshold_days)
        if not items:
            continue

        title, body = notify.build_notification(items, today)
        item_ids = [it.id for it in items]

        # 인앱 알림함(항상 적재) — 푸시 못 받는 환경 대비 안전장치.
        db.insert_notification(user_id, title, body, item_ids)
        users_notified += 1

        # Web Push(구독 있을 때만). 만료 구독은 정리.
        payload = {"title": title, "body": body, "url": "/", "itemIds": item_ids}
        for sub in db.list_push_subscriptions(user_id):
            try:
                if push.send_push(sub, payload):
                    push_sent += 1
            except push.SubscriptionGone as gone:
                db.delete_push_subscription(gone.endpoint)

        db.mark_items_notified(item_ids, today)
        items_flagged += len(item_ids)

    logger.info(
        "notify-expiring: users=%s push=%s items=%s",
        users_notified, push_sent, items_flagged,
    )
    return NotifyExpiringResponse(
        usersNotified=users_notified, pushSent=push_sent, itemsFlagged=items_flagged
    )


@router.post(
    "/internal/purge-receipts", dependencies=[Depends(_require_internal_token)]
)
def purge_receipts() -> PurgeReceiptsResponse:
    """영수증 원본 파기 배치 (SD-2).

    보관 미동의(receipt_retain=false) 사용자의 영수증 원본을 Storage에서 삭제하고
    purged_at을 기록한다. GitHub Actions cron이 일 1회 호출.
    """
    purged = db.purge_receipt_originals()
    logger.info("purge-receipts: purged=%s", purged)
    return PurgeReceiptsResponse(purged=purged)
