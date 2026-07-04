"""임박 알림 — S3의 순수 판단 로직.

DB I/O·푸시 전송은 db/push 계층이 담당하고, 이 모듈은
"어떤 항목이 임박인가"와 "알림 문구를 어떻게 만드는가"만 순수 함수로 둔다.
(테스트: tests/test_notify.py)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ExpiringItem:
    id: str
    name: str
    expire_at: date


def days_left(expire_at: date, today: date) -> int:
    """오늘 기준 남은 일수. 음수면 이미 지남."""
    return (expire_at - today).days


def dday_label(expire_at: date, today: date) -> str:
    """D-day 뱃지 문구. 오늘=D-day, 지남=만료, 이후=D-N."""
    d = days_left(expire_at, today)
    if d < 0:
        return "만료"
    if d == 0:
        return "D-day"
    return f"D-{d}"


def select_expiring(
    items: list[ExpiringItem], today: date, threshold_days: int
) -> list[ExpiringItem]:
    """임박(threshold 이내) + 이미 지난 항목을 임박 순으로 정렬해 반환."""
    picked = [it for it in items if days_left(it.expire_at, today) <= threshold_days]
    return sorted(picked, key=lambda it: it.expire_at)


def build_notification(items: list[ExpiringItem], today: date) -> tuple[str, str]:
    """임박 항목 리스트 → (제목, 본문). items는 비어있지 않다고 가정."""
    n = len(items)
    title = f"임박 재료 {n}개, 오늘 확인하세요"
    # 본문: 임박 순 최대 3개를 D-day와 함께 요약, 그 외는 '외 N개'.
    head = items[:3]
    parts = [f"{it.name}({dday_label(it.expire_at, today)})" for it in head]
    body = ", ".join(parts)
    if n > len(head):
        body += f" 외 {n - len(head)}개"
    return title, body
