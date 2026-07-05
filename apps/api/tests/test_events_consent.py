"""이벤트 수집(SD-1) · 동의(SD-2) 엔드포인트 테스트.

DB/Supabase 없이 db 함수를 monkeypatch하고 auth 의존성을 override해 라우터 로직만 검증한다.
핵심: 옵트아웃 사용자 수집 차단, 익명 수집 허용, 동의 부분 갱신.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import db
from app.auth import AuthUser, get_current_user, get_optional_user
from app.main import app

_USER = AuthUser(user_id="u1", email="a@b.c")


@pytest.fixture
def client():
    yield TestClient(app)
    app.dependency_overrides.clear()


def _capture_events(monkeypatch):
    captured: dict = {}

    def fake_insert(session_id, user_id, events):
        captured["args"] = (session_id, user_id, events)
        return len(events)

    monkeypatch.setattr(db, "insert_events", fake_insert)
    return captured


def test_events_blocked_when_opted_out(client, monkeypatch):
    captured = _capture_events(monkeypatch)
    monkeypatch.setattr(db, "get_consent", lambda uid: {"data_consent": False})
    app.dependency_overrides[get_optional_user] = lambda: _USER

    res = client.post(
        "/events",
        json={"sessionId": "s1", "events": [{"type": "recipe_cooked"}]},
    )
    assert res.status_code == 200
    assert res.json()["accepted"] == 0
    assert "args" not in captured  # 수집 자체가 일어나지 않아야 함


def test_events_collected_when_consented(client, monkeypatch):
    captured = _capture_events(monkeypatch)
    monkeypatch.setattr(db, "get_consent", lambda uid: {"data_consent": True})
    app.dependency_overrides[get_optional_user] = lambda: _USER

    res = client.post(
        "/events",
        json={
            "sessionId": "s1",
            "events": [
                {"type": "receipt_uploaded", "props": {"kind": "pdf"}},
                {"type": "recipe_suggested"},
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["accepted"] == 2
    assert captured["args"][1] == "u1"


def test_events_anonymous_allowed(client, monkeypatch):
    captured = _capture_events(monkeypatch)
    app.dependency_overrides[get_optional_user] = lambda: None

    res = client.post(
        "/events",
        json={"sessionId": "anon", "events": [{"type": "recipe_shared"}]},
    )
    assert res.status_code == 200
    assert res.json()["accepted"] == 1
    assert captured["args"][1] is None  # user_id 없음


def test_events_rejects_unknown_type(client, monkeypatch):
    app.dependency_overrides[get_optional_user] = lambda: None
    res = client.post(
        "/events",
        json={"sessionId": "s", "events": [{"type": "hack_attempt"}]},
    )
    assert res.status_code == 422


def test_get_consent_maps_snake_to_camel(client, monkeypatch):
    monkeypatch.setattr(
        db,
        "get_consent",
        lambda uid: {"data_consent": True, "receipt_retain": False, "onboarded": True},
    )
    app.dependency_overrides[get_current_user] = lambda: _USER
    res = client.get("/me/consent")
    assert res.json() == {
        "dataConsent": True,
        "receiptRetain": False,
        "onboarded": True,
    }


def test_patch_consent_partial(client, monkeypatch):
    seen: dict = {}

    def fake_set(uid, **kwargs):
        seen.update(kwargs)
        return {"data_consent": True, "receipt_retain": True, "onboarded": True}

    monkeypatch.setattr(db, "set_consent", fake_set)
    app.dependency_overrides[get_current_user] = lambda: _USER

    res = client.patch("/me/consent", json={"dataConsent": True, "onboarded": True})
    assert res.status_code == 200
    assert res.json()["dataConsent"] is True
    assert seen == {"data_consent": True, "receipt_retain": None, "onboarded": True}
