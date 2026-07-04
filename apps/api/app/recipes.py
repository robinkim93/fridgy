"""레시피 추천 — S4의 순수 판단 로직.

DB I/O·LLM 호출은 db/nim 계층이 담당하고, 이 모듈은
"무엇이 임박이고 캐시 키는 무엇인가", "LLM JSON을 어떻게 검증·정렬하는가"만
순수 함수로 둔다(테스트: tests/test_recipes.py).

핵심 원칙(03_개발계획.md S4):
  - 임박 재료를 최대한 소진하는 요리를 상위로 정렬한다(expiring_used 많은 순).
  - LLM 응답은 스키마 검증 후 파싱 성공분만 노출한다.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import date


@dataclass(frozen=True)
class RecipeItem:
    """추천 컨텍스트에 넣는 보유 재료(활성 재고의 최소 표현)."""

    id: str
    name: str
    expire_at: date | None


@dataclass(frozen=True)
class Recipe:
    title: str
    used_ingredients: list[str] = field(default_factory=list)
    expiring_used: list[str] = field(default_factory=list)  # 이 요리가 소진하는 임박 재료
    missing: list[str] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)


def select_expiring_names(
    items: list[RecipeItem], today: date, threshold_days: int
) -> list[str]:
    """임박(threshold 이내, 이미 지난 것 포함) 재료명을 임박 순으로 반환.

    expire_at이 없는 항목은 임박 판정에서 제외한다(소비기한 미정).
    LLM 프롬프트의 '우선 소진 대상' 힌트로 쓴다.
    """
    dated = [it for it in items if it.expire_at is not None]
    picked = [it for it in dated if (it.expire_at - today).days <= threshold_days]
    picked.sort(key=lambda it: it.expire_at)  # type: ignore[arg-type,return-value]
    return [it.name for it in picked]


def snapshot_hash(items: list[RecipeItem], today: date) -> str:
    """활성 재고 스냅샷 → 캐시 키(해시).

    재고 구성(품목명 집합)과 임박 상태(오늘 기준 남은 일수)가 같으면 동일 키가 되어
    LLM 재호출을 막는다. id는 제외해 재등록·순서 변화에 안정적이다.
    """
    rows = sorted(
        (it.name, (it.expire_at - today).days if it.expire_at else None)
        for it in items
    )
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _str_list(value: object) -> list[str]:
    """LLM이 준 임의 값을 문자열 리스트로 정제(비문자열·공백 제거)."""
    if not isinstance(value, list):
        return []
    return [str(x).strip() for x in value if str(x).strip()]


def parse_recipes(raw: object) -> list[Recipe]:
    """LLM JSON(배열) → 검증된 Recipe 리스트. title 없는 항목은 버린다."""
    if not isinstance(raw, list):
        return []
    out: list[Recipe] = []
    for o in raw:
        if not isinstance(o, dict):
            continue
        title = str(o.get("title") or "").strip()
        if not title:
            continue
        out.append(
            Recipe(
                title=title,
                used_ingredients=_str_list(o.get("used_ingredients")),
                expiring_used=_str_list(o.get("expiring_used")),
                missing=_str_list(o.get("missing")),
                steps=_str_list(o.get("steps")),
            )
        )
    return out


def rank_recipes(recipes: list[Recipe], expiring_names: list[str]) -> list[Recipe]:
    """임박 소진 우선 정렬.

    1순위: 실제 보유 임박 재료를 많이 쓰는 순(expiring_used ∩ 실제 임박).
           LLM이 임박이 아닌 걸 expiring_used에 넣는 오류를 방어한다.
    2순위: 부족 재료(missing)가 적은 순(바로 만들 수 있는 요리 우선).
    """
    expiring = set(expiring_names)

    def key(r: Recipe) -> tuple[int, int]:
        hits = len(expiring.intersection(r.expiring_used))
        return (-hits, len(r.missing))

    return sorted(recipes, key=key)
