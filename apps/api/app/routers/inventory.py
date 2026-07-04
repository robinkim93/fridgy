"""재고 확정 엔드포인트 (F1 마무리 + 3차 학습)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..auth import AuthUser, get_current_user
from ..normalize import first_pass
from ..schemas import InventoryConfirmRequest, InventoryConfirmResponse

router = APIRouter(tags=["inventory"])


@router.post("/inventory/confirm")
def confirm_inventory(
    body: InventoryConfirmRequest, user: AuthUser = Depends(get_current_user)
) -> InventoryConfirmResponse:
    if not body.items:
        raise HTTPException(400, "확정할 품목이 없습니다")

    fridge_id = db.get_or_create_personal_fridge(user.user_id)
    inserted = db.insert_inventory(
        fridge_id, [it.model_dump() for it in body.items]
    )

    # 3차 학습(SD-3): 사용자가 최종 확정한 표기를 개인 사전에 남긴다.
    # 1차 결과와 다른 경우(=LLM 정규화 or 사용자 보정)만 저장해 사전 오염을 줄인다.
    user_aliases, global_aliases = db.load_aliases(user.user_id)
    for it in body.items:
        if not it.rawText:
            continue
        hit = first_pass(it.rawText, user_aliases, global_aliases)
        if hit is None or hit.name != it.name or hit.category != it.category:
            db.upsert_user_alias(user.user_id, it.rawText, it.name, it.category)

    return InventoryConfirmResponse(
        inserted=len(inserted), itemIds=[r["id"] for r in inserted]
    )
