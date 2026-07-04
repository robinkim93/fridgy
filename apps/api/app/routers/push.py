"""Web Push 구독 + 인앱 알림함 (S3, 사용자용 엔드포인트)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..auth import AuthUser, get_current_user
from ..config import Settings, get_settings
from ..schemas import (
    NotificationListResponse,
    NotificationResponse,
    PushSubscribeRequest,
    PushSubscribeResponse,
)

router = APIRouter(tags=["push"])


@router.get("/push/public-key")
def public_key(settings: Settings = Depends(get_settings)) -> dict:
    """프런트가 구독 시 사용할 VAPID 공개키(무인증). 키 미설정 시 빈 문자열."""
    return {"publicKey": settings.vapid_public_key}


@router.post("/push/subscribe")
def subscribe(
    body: PushSubscribeRequest, user: AuthUser = Depends(get_current_user)
) -> PushSubscribeResponse:
    db.upsert_push_subscription(
        user.user_id, body.endpoint, body.keys.p256dh, body.keys.auth
    )
    return PushSubscribeResponse(ok=True)


@router.post("/push/unsubscribe")
def unsubscribe(
    body: dict, user: AuthUser = Depends(get_current_user)
) -> PushSubscribeResponse:
    endpoint = body.get("endpoint")
    if not endpoint:
        raise HTTPException(400, "endpoint가 필요합니다")
    db.delete_push_subscription(endpoint)
    return PushSubscribeResponse(ok=True)


@router.get("/notifications")
def list_notifications(
    user: AuthUser = Depends(get_current_user),
) -> NotificationListResponse:
    rows, unread = db.list_notifications(user.user_id)
    items = [
        NotificationResponse(
            id=r["id"],
            type=r.get("type", "expiring"),
            title=r["title"],
            body=r["body"],
            itemIds=r.get("item_ids", []),
            readAt=r.get("read_at"),
            createdAt=r["created_at"],
        )
        for r in rows
    ]
    return NotificationListResponse(items=items, unread=unread)


@router.post("/notifications/{notif_id}/read")
def mark_read(
    notif_id: str, user: AuthUser = Depends(get_current_user)
) -> dict:
    updated = db.mark_notification_read(user.user_id, notif_id)
    return {"updated": updated}
