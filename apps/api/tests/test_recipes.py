"""S4 레시피 추천 순수 로직 테스트 (recipes.py)."""

from datetime import date

from app.recipes import (
    Recipe,
    RecipeItem,
    parse_recipes,
    rank_recipes,
    select_expiring_names,
    snapshot_hash,
)

TODAY = date(2026, 7, 4)


def _item(name: str, d: int | None) -> RecipeItem:
    """오늘로부터 d일 뒤 만료(=None이면 소비기한 미정) 재료."""
    exp = date.fromordinal(TODAY.toordinal() + d) if d is not None else None
    return RecipeItem(id=name, name=name, expire_at=exp)


def test_select_expiring_names_filters_sorts_and_skips_undated():
    items = [_item("사과", 10), _item("우유", 1), _item("시금치", -2), _item("소금", None)]
    names = select_expiring_names(items, TODAY, threshold_days=3)
    # 10일(사과) 임박 아님, 소금(미정) 제외. 나머지 만료일 오름차순.
    assert names == ["시금치", "우유"]


def test_snapshot_hash_is_stable_regardless_of_order_and_id():
    a = [_item("우유", 1), _item("계란", 5)]
    b = [
        RecipeItem(id="다른id", name="계란", expire_at=date.fromordinal(TODAY.toordinal() + 5)),
        RecipeItem(id="또다른id", name="우유", expire_at=date.fromordinal(TODAY.toordinal() + 1)),
    ]
    assert snapshot_hash(a, TODAY) == snapshot_hash(b, TODAY)


def test_snapshot_hash_changes_with_expiry_state():
    a = [_item("우유", 1)]
    b = [_item("우유", 2)]
    assert snapshot_hash(a, TODAY) != snapshot_hash(b, TODAY)


def test_parse_recipes_drops_invalid_and_cleans_lists():
    raw = [
        {"title": "김치찌개", "used_ingredients": ["김치", "돼지고기"], "expiring_used": ["김치"], "steps": ["끓인다"]},
        {"used_ingredients": ["양파"]},  # title 없음 → 버림
        "문자열",  # dict 아님 → 버림
        {"title": "  ", "used_ingredients": []},  # 빈 title → 버림
        {"title": "계란말이", "used_ingredients": ["계란", "", 3], "missing": ["파"]},
    ]
    out = parse_recipes(raw)
    assert [r.title for r in out] == ["김치찌개", "계란말이"]
    # 비문자열·공백 정제
    assert out[1].used_ingredients == ["계란", "3"]


def test_parse_recipes_non_list_returns_empty():
    assert parse_recipes({"title": "x"}) == []
    assert parse_recipes(None) == []


def test_rank_recipes_prioritizes_expiring_then_fewer_missing():
    expiring = ["시금치", "우유"]
    recipes = [
        Recipe(title="A", expiring_used=[], missing=[]),
        Recipe(title="B", expiring_used=["시금치"], missing=["소금", "설탕"]),
        Recipe(title="C", expiring_used=["시금치", "우유"], missing=["소금"]),
        Recipe(title="D", expiring_used=["시금치"], missing=[]),
    ]
    ranked = rank_recipes(recipes, expiring)
    # C(임박2) > D(임박1,부족0) > B(임박1,부족2) > A(임박0)
    assert [r.title for r in ranked] == ["C", "D", "B", "A"]


def test_rank_recipes_ignores_false_expiring_claims():
    expiring = ["우유"]
    recipes = [
        Recipe(title="거짓임박", expiring_used=["사과", "배"]),  # 실제 임박 아님 → 0으로 취급
        Recipe(title="진짜임박", expiring_used=["우유"]),
    ]
    ranked = rank_recipes(recipes, expiring)
    assert [r.title for r in ranked] == ["진짜임박", "거짓임박"]
