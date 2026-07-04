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
