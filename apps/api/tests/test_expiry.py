"""소비기한 계산 단위 테스트 (S2 필수: 03_개발계획.md §테스트 우선순위)."""

from datetime import date

from app.expiry import GLOBAL_DEFAULT_DAYS, compute_expire_at, resolve_days

ITEM_DAYS = {"우유": 7, "삼겹살": 3}
CATEGORY_DAYS = {"유제품": 5, "육류": 3, "채소": 7}


def test_override_wins_over_everything():
    days = resolve_days(
        "우유", "유제품", ITEM_DAYS, CATEGORY_DAYS, overrides={"우유": 2}
    )
    assert days == 2


def test_item_rule_beats_category():
    # 우유(유제품): 품목 규칙 7 이 카테고리 기본값 5 보다 우선
    assert resolve_days("우유", "유제품", ITEM_DAYS, CATEGORY_DAYS) == 7


def test_category_default_when_no_item_rule():
    # 상추는 품목 규칙이 없으니 채소 카테고리 기본값 7
    assert resolve_days("상추", "채소", ITEM_DAYS, CATEGORY_DAYS) == 7


def test_global_default_when_unknown():
    assert (
        resolve_days("듣도보도못한것", "기타", ITEM_DAYS, CATEGORY_DAYS)
        == GLOBAL_DEFAULT_DAYS
    )


def test_compute_expire_at_adds_days():
    d = compute_expire_at(
        "삼겹살", "육류", date(2026, 7, 4), ITEM_DAYS, CATEGORY_DAYS
    )
    assert d == date(2026, 7, 7)


def test_compute_expire_at_with_override():
    d = compute_expire_at(
        "우유", "유제품", date(2026, 7, 4), ITEM_DAYS, CATEGORY_DAYS,
        overrides={"우유": 1},
    )
    assert d == date(2026, 7, 5)
