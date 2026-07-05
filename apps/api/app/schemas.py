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
    fridgeId: str | None = None  # 미지정 시 개인 냉장고(S5 공유 냉장고 스코프)
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
    fridgeId: str | None = None
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


# ── S4 레시피 추천 & 소비 처리 (F4·F5) ─────────────────────────────────────
class RecipeResponse(BaseModel):
    """추천 레시피 1건 (packages/shared Recipe 계약과 일치)."""

    title: str
    usedIngredients: list[str] = Field(default_factory=list)
    expiringUsed: list[str] = Field(default_factory=list)  # 이 요리가 소진하는 임박 재료
    missing: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)


class RecipeSuggestResponse(BaseModel):
    items: list[RecipeResponse] = Field(default_factory=list)
    expiringNames: list[str] = Field(default_factory=list)  # 정렬 기준이 된 임박 재료
    cached: bool = False  # 캐시 재사용 여부(비용 가드 확인용)


class ConsumeRequest(BaseModel):
    fridgeId: str | None = None
    itemIds: list[str]
    action: Literal["consumed", "discarded"] = "consumed"


class ConsumeResponse(BaseModel):
    updated: int  # 상태 전이된 활성 품목 수


# ── S5 공유 냉장고 (F6) ─────────────────────────────────────────────────────
FridgeRole = Literal["owner", "member"]


class FridgeSummary(BaseModel):
    id: str
    name: str
    role: FridgeRole
    isOwner: bool


class FridgeListResponse(BaseModel):
    items: list[FridgeSummary] = Field(default_factory=list)


class FridgeRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class InviteCreateRequest(BaseModel):
    role: FridgeRole = "member"
    ttlHours: int = Field(default=72, gt=0, le=720)


class InviteCreateResponse(BaseModel):
    token: str
    role: FridgeRole
    expiresAt: str


class InviteInfoResponse(BaseModel):
    fridgeName: str
    role: FridgeRole
    expired: bool
    accepted: bool


class InviteAcceptResponse(BaseModel):
    fridgeId: str
    name: str
    alreadyMember: bool


class MemberResponse(BaseModel):
    userId: str
    role: FridgeRole
    joinedAt: str


class MemberListResponse(BaseModel):
    items: list[MemberResponse] = Field(default_factory=list)


class ActivityResponse(BaseModel):
    id: str
    actorUserId: str
    action: str
    detail: dict = Field(default_factory=dict)
    createdAt: str


class ActivityListResponse(BaseModel):
    items: list[ActivityResponse] = Field(default_factory=list)
