"""품목명 정규화 — S1의 핵심 판단 로직.

3단계 전략(비용 최소화 순):
  1차(무료·결정적): 텍스트 정리 → 별칭 사전(user→global) → 시드 렉시콘 키워드 매칭
  2차(비용 발생):   1차 실패 항목만 NIM Llama Nemotron에 JSON 정규화 위임 (pipeline.py)
  3차(학습):        사용자 보정을 item_aliases(scope=user)에 반영 (routers/inventory.py)

이 모듈은 1차(순수 함수)만 담당한다. DB·NIM I/O는 파이프라인이 주입한다.
따라서 사전은 인자로 받아 테스트 가능하게 유지한다(테스트: tests/test_normalize.py).
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class Normalized:
    """정규화 결과 후보. 보정 UI(ParsedItem)의 백엔드 대응."""

    raw_text: str
    name: str
    category: str
    qty: float
    unit: str
    matched_by: str  # user_alias | global_alias | product | lexicon | llm | unknown


# ── 시드 렉시콘: 키워드(부분일치) → (표준명, 카테고리) ────────────────────
# 국내 마트 영수증 빈출 품목 중심. 사용자 보정·전역 승격(SD-3)으로 점진 확장한다.
# 순서 주의: 더 구체적인 키워드를 앞에 둬 오매칭을 줄인다(예: "두유"가 "우유"보다 먼저).
SEED_LEXICON: list[tuple[str, str, str]] = [
    # (키워드, 표준명, 카테고리)
    ("두유", "두유", "음료"),
    ("우유", "우유", "유제품"),
    ("요거트", "요거트", "유제품"),
    ("요구르트", "요거트", "유제품"),
    ("치즈", "치즈", "유제품"),
    ("버터", "버터", "유제품"),
    ("계란", "계란", "기타"),
    ("달걀", "계란", "기타"),
    ("돼지", "돼지고기", "육류"),
    ("삼겹", "삼겹살", "육류"),
    ("소고기", "소고기", "육류"),
    ("한우", "소고기", "육류"),
    ("닭", "닭고기", "육류"),
    ("계육", "닭고기", "육류"),
    ("고등어", "고등어", "수산물"),
    ("오징어", "오징어", "수산물"),
    ("새우", "새우", "수산물"),
    ("연어", "연어", "수산물"),
    ("김치", "김치", "가공식품"),
    ("두부", "두부", "가공식품"),
    ("어묵", "어묵", "가공식품"),
    ("햄", "햄", "가공식품"),
    ("소시지", "소시지", "가공식품"),
    ("만두", "만두", "냉동식품"),
    ("냉동", "냉동식품", "냉동식품"),
    ("시금치", "시금치", "채소"),
    ("상추", "상추", "채소"),
    ("양파", "양파", "채소"),
    ("대파", "대파", "채소"),
    ("파프리카", "파프리카", "채소"),
    ("당근", "당근", "채소"),
    ("감자", "감자", "채소"),
    ("고구마", "고구마", "채소"),
    ("오이", "오이", "채소"),
    ("애호박", "애호박", "채소"),
    ("호박", "애호박", "채소"),
    ("토마토", "토마토", "채소"),
    ("버섯", "버섯", "채소"),
    ("마늘", "마늘", "채소"),
    ("배추", "배추", "채소"),
    ("무", "무", "채소"),
    ("사과", "사과", "과일"),
    ("바나나", "바나나", "과일"),
    ("딸기", "딸기", "과일"),
    ("포도", "포도", "과일"),
    ("귤", "귤", "과일"),
    ("오렌지", "오렌지", "과일"),
    ("참외", "참외", "과일"),
    ("수박", "수박", "과일"),
    ("참치", "참치캔", "통조림"),
    ("통조림", "통조림", "통조림"),
    ("생수", "생수", "음료"),
    ("주스", "주스", "음료"),
    ("콜라", "콜라", "음료"),
    ("맥주", "맥주", "음료"),
]

# ── 완제품(조리·가공식품) 마커 ─────────────────────────────────────────────
# 이 표현이 원문에 있으면 여러 재료가 결합된 '완제품'으로 보고, 대표 재료로 축약하지 않고
# 원문 제품명을 통째로 보존한다(예: "명란크림우동", "꽈리고추 수육튀김").
# 오탐 방지를 위해 단일 재료·브랜드 단어의 부분열이 되기 쉬운 표현(예: "국")은 제외한다.
_PRODUCT_MARKERS: tuple[str, ...] = (
    "우동", "라면", "국수", "파스타", "스파게티", "피자", "버거", "샌드위치",
    "튀김", "볶음", "조림", "전골", "찌개", "구이", "무침", "조림", "찜",
    "김밥", "덮밥", "비빔밥", "볶음밥", "도시락", "떡볶이", "만두", "돈까스",
    "까스", "카츠", "그라탕", "리조또", "스테이크", "샐러드", "수육", "족발",
    "치킨", "너겟", "핫도그", "소떡", "유부초밥", "쫄면", "냉면", "칼국수",
)


def is_prepared_product(raw_text: str) -> bool:
    """원문이 조리·가공 완제품명인지 판정(대표 재료 축약 금지 대상)."""
    s = raw_text.lower()
    return any(m in s for m in _PRODUCT_MARKERS)


# ── 정리(clean) 규칙 ───────────────────────────────────────────────────────
# 용량/포장 노이즈만 제거한다. 브랜드는 통삭제하지 않는다
# ("서울우유"의 "우유"처럼 제품명이 브랜드에 붙어 오는 경우가 많기 때문).
# 용량/규격 토큰: 500g, 1kg, 1l, 1.8l, 2입, 30구, 묶음 등
_SIZE_RE = re.compile(r"\d+(\.\d+)?\s*(kg|g|ml|l|리터|입|구|매|팩|봉|병|캔|호|인분)", re.I)
# 가격 노이즈: 천단위 콤마 금액(26,000) 또는 '원' 표기
_PRICE_RE = re.compile(r"\d{1,3}(?:,\d{3})+|\d+\s*원")
_PACKAGING = ("행사", "할인", "1+1", "묶음", "특가", "국산", "수입산", "냉장", "봉지", "대용량")
# 수량 추출: "2개"(숫자+단위) 또는 "x3"(선행 배수 표기)
_QTY_UNIT_RE = re.compile(r"(\d+)\s*(개|봉|팩|병|캔|줄|송이|망|ea)\b", re.I)
_QTY_MULT_RE = re.compile(r"x\s*(\d+)\b", re.I)


def alias_key(raw_text: str) -> str:
    """별칭 사전/렉시콘 매칭용 키. 소문자·공백정리한 원문(정보 손실 최소)."""
    return re.sub(r"\s+", " ", raw_text.strip().lower())


def _clean_for_match(raw_text: str) -> str:
    """렉시콘 키워드 매칭용으로 노이즈를 제거한 문자열."""
    s = raw_text.lower()
    s = _SIZE_RE.sub(" ", s)
    for token in _PACKAGING:
        s = s.replace(token, " ")
    # 특수문자·숫자 제거(수량은 별도 추출)
    s = re.sub(r"[^가-힣a-z ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def strip_noise(raw_text: str) -> str:
    """표시용 이름에서 용량·포장·가격 노이즈만 제거(대소문자·원문 표기는 보존)."""
    s = _PRICE_RE.sub(" ", raw_text)
    s = _SIZE_RE.sub(" ", s)
    for token in _PACKAGING:
        s = s.replace(token, " ")
    return re.sub(r"\s+", " ", s).strip()


def extract_qty(raw_text: str) -> tuple[float, str]:
    """원문에서 (수량, 단위)를 추출. 없으면 (1, '개')."""
    s = raw_text.lower()
    m = _QTY_UNIT_RE.search(s)
    if m:
        unit = m.group(2)
        unit = "개" if unit.lower() == "ea" else unit
        return float(m.group(1)), unit
    m = _QTY_MULT_RE.search(s)
    if m:
        return float(m.group(1)), "개"
    return 1.0, "개"


def first_pass(
    raw_text: str,
    user_aliases: dict[str, tuple[str, str | None]] | None = None,
    global_aliases: dict[str, tuple[str, str | None]] | None = None,
) -> Normalized | None:
    """1차 정규화. 매칭 실패 시 None(→ 2차 NIM 위임 대상).

    aliases 형식: { alias_key: (normalized_name, category|None) }
    조회 순서: user 사전 → global 사전 → 시드 렉시콘.
    """
    if not raw_text or not raw_text.strip():
        return None

    qty, unit = extract_qty(raw_text)
    key = alias_key(raw_text)

    # 1) 사용자 사전 (개인 보정 재사용)
    if user_aliases and key in user_aliases:
        name, cat = user_aliases[key]
        return Normalized(raw_text, name, cat or "기타", qty, unit, "user_alias")

    # 2) 전역 사전 (SD-3 승격분)
    if global_aliases and key in global_aliases:
        name, cat = global_aliases[key]
        return Normalized(raw_text, name, cat or "기타", qty, unit, "global_alias")

    # 2.5) 완제품(조리·가공식품)은 대표 재료로 축약하지 않고 원문 제품명을 보존.
    #      LLM 정규화가 "명란크림우동→명란"처럼 앞 재료로 줄이는 것을 결정적으로 차단한다.
    if is_prepared_product(raw_text):
        name = strip_noise(raw_text) or raw_text.strip()
        return Normalized(raw_text, name, "가공식품", qty, unit, "product")

    # 3) 시드 렉시콘 키워드 부분일치
    cleaned = _clean_for_match(raw_text)
    if cleaned:
        for keyword, name, category in SEED_LEXICON:
            if keyword in cleaned:
                return Normalized(raw_text, name, category, qty, unit, "lexicon")

    return None
