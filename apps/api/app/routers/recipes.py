"""레시피 추천 & 소비 처리 엔드포인트 (S4, F4·F5).

흐름(GET /recipes/suggest):
  활성 재고 로드 → 임박 재료 선별 → 스냅샷 해시로 캐시 조회
  → 미스면 NIM 호출 → 검증·정렬 → 캐시 저장 → 반환.
비용 가드레일(부록 B): 동일 재고 상태면 캐시를 재사용해 LLM 재호출을 막는다.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from .. import db, nim, recipes
from ..auth import AuthUser, get_current_user
from ..config import Settings, get_settings
from ..recipes import Recipe, RecipeItem
from ..schemas import (
    ConsumeRequest,
    ConsumeResponse,
    RecipeResponse,
    RecipeSuggestResponse,
)

router = APIRouter(tags=["recipes"])


def _to_response(r: dict) -> RecipeResponse:
    """캐시/검증된 dict → 응답 스키마(camelCase)."""
    return RecipeResponse(
        title=r["title"],
        usedIngredients=r.get("used_ingredients", []),
        expiringUsed=r.get("expiring_used", []),
        missing=r.get("missing", []),
        steps=r.get("steps", []),
    )


def _recipe_to_cache(r: Recipe) -> dict:
    """정렬된 Recipe → 캐시/응답 공통 dict(snake_case, 원본 계약 유지)."""
    return {
        "title": r.title,
        "used_ingredients": r.used_ingredients,
        "expiring_used": r.expiring_used,
        "missing": r.missing,
        "steps": r.steps,
    }


@router.get("/recipes/suggest")
def suggest(
    user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> RecipeSuggestResponse:
    fridge_id = db.get_or_create_personal_fridge(user.user_id)
    rows = db.list_inventory(fridge_id)
    if not rows:
        raise HTTPException(400, "추천할 재고가 없습니다. 영수증으로 먼저 재고를 추가하세요.")

    today = date.today()
    items = [
        RecipeItem(
            id=r["id"],
            name=r["name"],
            expire_at=date.fromisoformat(r["expire_at"]) if r.get("expire_at") else None,
        )
        for r in rows
    ]
    expiring_names = recipes.select_expiring_names(
        items, today, settings.expiry_threshold_days
    )
    snap = recipes.snapshot_hash(items, today)

    cached = db.get_recipe_cache(fridge_id, snap)
    if cached is not None:
        return RecipeSuggestResponse(
            items=[_to_response(r) for r in cached],
            expiringNames=expiring_names,
            cached=True,
        )

    raw = nim.suggest_recipes(expiring_names, [it.name for it in items])
    ranked = recipes.rank_recipes(recipes.parse_recipes(raw), expiring_names)
    payload = [_recipe_to_cache(r) for r in ranked]
    db.set_recipe_cache(fridge_id, snap, payload)  # 파싱 실패(빈 리스트)도 캐싱해 재호출 방지

    return RecipeSuggestResponse(
        items=[_to_response(r) for r in payload],
        expiringNames=expiring_names,
        cached=False,
    )


@router.post("/inventory/consume")
def consume(
    body: ConsumeRequest, user: AuthUser = Depends(get_current_user)
) -> ConsumeResponse:
    """요리 후 사용 재료를 소비 처리하거나(consumed) 폐기(discarded) 처리한다(F5)."""
    if not body.itemIds:
        raise HTTPException(400, "처리할 품목이 없습니다")
    fridge_id = db.get_or_create_personal_fridge(user.user_id)
    updated = db.consume_inventory_items(
        user.user_id, fridge_id, body.itemIds, body.action
    )
    return ConsumeResponse(updated=updated)
