"""API 요청·응답 스키마 (packages/shared 계약과 camelCase로 일치)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ItemCategory = Literal[
    "유제품", "육류", "수산물", "채소", "과일",
    "냉동식품", "가공식품", "통조림", "음료", "기타",
]
ReceiptJobStatus = Literal["processing", "done", "failed"]


class ParsedItem(BaseModel):
    rawText: str = ""
    name: str
    qty: float = 1
    unit: str = "개"
    category: ItemCategory = "기타"


class ReceiptCreateResponse(BaseModel):
    jobId: str
    status: ReceiptJobStatus


class ReceiptJobResponse(BaseModel):
    id: str
    status: ReceiptJobStatus
    items: list[ParsedItem] = Field(default_factory=list)
    error: str | None = None


class InventoryConfirmRequest(BaseModel):
    jobId: str | None = None
    items: list[ParsedItem]


class InventoryConfirmResponse(BaseModel):
    inserted: int
    itemIds: list[str]


class InventoryItemResponse(BaseModel):
    """재고 품목 (packages/shared InventoryItem 계약과 일치)."""

    id: str
    fridgeId: str
    name: str
    category: ItemCategory = "기타"
    qty: float = 1
    unit: str = "개"
    purchasedAt: str
    expireAt: str | None = None
    source: Literal["receipt", "manual", "voice"] = "receipt"
    status: Literal["active", "consumed", "discarded"] = "active"


class InventoryListResponse(BaseModel):
    items: list[InventoryItemResponse] = Field(default_factory=list)


class ExpiryOverrideRequest(BaseModel):
    itemName: str
    customDays: int = Field(gt=0, le=3650)


class ExpiryOverrideResponse(BaseModel):
    itemName: str
    customDays: int
    updated: int  # 즉시 재계산된 활성 품목 수


# ── S3 임박 알림 (F3) ──────────────────────────────────────────────────────
class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscribeRequest(BaseModel):
    """브라우저 PushSubscription.toJSON() 형태."""

    endpoint: str
    keys: PushKeys


class PushSubscribeResponse(BaseModel):
    ok: bool = True


class NotificationResponse(BaseModel):
    id: str
    type: str = "expiring"
    title: str
    body: str
    itemIds: list[str] = Field(default_factory=list)
    readAt: str | None = None
    createdAt: str


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse] = Field(default_factory=list)
    unread: int = 0


class NotifyExpiringResponse(BaseModel):
    """배치 결과 요약(cron 로그·수동 실행 확인용)."""

    usersNotified: int
    pushSent: int
    itemsFlagged: int
