"""정규화 1차 파이프라인 단위 테스트 (S1 필수)."""

from app.normalize import alias_key, extract_qty, first_pass


def test_lexicon_brand_and_size_stripped():
    r = first_pass("서울우유1L")
    assert r is not None
    assert r.name == "우유"
    assert r.category == "유제품"
    assert r.matched_by == "lexicon"


def test_more_specific_keyword_wins_over_generic():
    # "두유"가 "우유"보다 먼저 매칭돼야 한다.
    r = first_pass("매일두유99.9 190ml")
    assert r is not None
    assert r.name == "두유"
    assert r.category == "음료"


def test_qty_and_unit_extraction():
    assert extract_qty("삼겹살 2팩") == (2.0, "팩")
    assert extract_qty("계란 30구") == (1.0, "개")  # 30구는 규격 → 수량 미인식, 기본값
    assert extract_qty("바나나") == (1.0, "개")
    qty, unit = extract_qty("생수 x6")
    assert (qty, unit) == (6.0, "개")


def test_user_alias_takes_priority():
    aliases = {alias_key("스팸클래식340"): ("스팸", "가공식품")}
    r = first_pass("스팸클래식340", user_aliases=aliases)
    assert r is not None
    assert r.name == "스팸"
    assert r.matched_by == "user_alias"


def test_user_alias_beats_global():
    key = alias_key("냉동만두")
    r = first_pass(
        "냉동만두",
        user_aliases={key: ("손만두", None)},
        global_aliases={key: ("만두", "냉동식품")},
    )
    assert r.name == "손만두"
    assert r.matched_by == "user_alias"


def test_unmatched_returns_none_for_llm_fallback():
    assert first_pass("알수없는신상품ABC") is None
    assert first_pass("") is None
    assert first_pass("   ") is None


def test_alias_key_normalizes_whitespace_and_case():
    assert alias_key("  Seoul  Milk 1L ") == "seoul milk 1l"
