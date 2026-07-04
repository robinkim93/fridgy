"""S3 임박 알림 순수 로직 테스트 (notify.py)."""

from datetime import date

from app.notify import (
    ExpiringItem,
    build_notification,
    dday_label,
    days_left,
    select_expiring,
)

TODAY = date(2026, 7, 4)


def _item(name: str, d: int) -> ExpiringItem:
    """오늘로부터 d일 뒤 만료 항목."""
    return ExpiringItem(id=name, name=name, expire_at=date.fromordinal(TODAY.toordinal() + d))


def test_days_left():
    assert days_left(date(2026, 7, 7), TODAY) == 3
    assert days_left(date(2026, 7, 4), TODAY) == 0
    assert days_left(date(2026, 7, 1), TODAY) == -3


def test_dday_label():
    assert dday_label(date(2026, 7, 4), TODAY) == "D-day"
    assert dday_label(date(2026, 7, 6), TODAY) == "D-2"
    assert dday_label(date(2026, 7, 2), TODAY) == "만료"


def test_select_expiring_filters_and_sorts():
    items = [_item("사과", 10), _item("우유", 1), _item("시금치", -2), _item("빵", 3)]
    picked = select_expiring(items, TODAY, threshold_days=3)
    # 10일(사과)은 임박 아님. 나머지는 만료일 오름차순.
    assert [it.name for it in picked] == ["시금치", "우유", "빵"]


def test_select_expiring_includes_boundary():
    items = [_item("경계", 3), _item("초과", 4)]
    picked = select_expiring(items, TODAY, threshold_days=3)
    assert [it.name for it in picked] == ["경계"]


def test_build_notification_summary():
    items = select_expiring(
        [_item("우유", 1), _item("시금치", -1), _item("빵", 2), _item("계란", 3)],
        TODAY,
        threshold_days=3,
    )
    title, body = build_notification(items, TODAY)
    assert "4개" in title
    # 임박 순 최대 3개 + '외 1개'
    assert body.startswith("시금치(만료), 우유(D-1), 빵(D-2)")
    assert body.endswith("외 1개")


def test_build_notification_few_items():
    items = select_expiring([_item("우유", 0)], TODAY, threshold_days=3)
    title, body = build_notification(items, TODAY)
    assert "1개" in title
    assert body == "우유(D-day)"
    assert "외" not in body
