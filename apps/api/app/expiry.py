"""소비기한 추정 — S2의 핵심 판단 로직.

매핑 우선순위(부정확한 기준을 개인화로 보정):
  1) user_overrides[item_name]   (개인 보정, 최우선)
  2) consumption_reference 정확 품목 규칙 (name)
  3) consumption_reference 카테고리 기본값 (category)
  4) 전역 기본값 GLOBAL_DEFAULT_DAYS

이 모듈은 순수 함수만 담당한다. DB I/O(기준표·오버라이드 로드)는 db 계층이 주입한다.
따라서 사전은 인자로 받아 테스트 가능하게 유지한다(테스트: tests/test_expiry.py).
"""

from __future__ import annotations

from datetime import date, timedelta

# 어떤 기준에도 걸리지 않을 때의 보수적 전역 기본값(일).
GLOBAL_DEFAULT_DAYS = 7


def resolve_days(
    name: str,
    category: str,
    item_days: dict[str, int] | None = None,
    category_days: dict[str, int] | None = None,
    overrides: dict[str, int] | None = None,
) -> int:
    """품목의 소비일수를 우선순위대로 해석한다.

    item_days:     { 정규화표준명: 일수 }  (consumption_reference name 규칙)
    category_days: { 카테고리:     일수 }  (consumption_reference 카테고리 기본값)
    overrides:     { 품목명:       일수 }  (user_overrides, 최우선)
    """
    if overrides and name in overrides:
        return overrides[name]
    if item_days and name in item_days:
        return item_days[name]
    if category_days and category in category_days:
        return category_days[category]
    return GLOBAL_DEFAULT_DAYS


def compute_expire_at(
    name: str,
    category: str,
    purchased_at: date,
    item_days: dict[str, int] | None = None,
    category_days: dict[str, int] | None = None,
    overrides: dict[str, int] | None = None,
) -> date:
    """구매일 + 소비일수 = 임박일(expire_at)."""
    days = resolve_days(name, category, item_days, category_days, overrides)
    return purchased_at + timedelta(days=days)
