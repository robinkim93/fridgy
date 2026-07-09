"""JWT 검증 테스트 (S0 인증) — ES256(JWKS) + HS256(레거시) 양쪽."""

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import HTTPException
from jose import jwk, jwt

from app import auth
from app.config import Settings

_KID = "test-kid-1"
_CLAIMS = {"sub": "user-123", "email": "a@b.com", "aud": "authenticated"}


@pytest.fixture(autouse=True)
def _clear_jwks_cache():
    auth._jwks_by_kid.clear()
    yield
    auth._jwks_by_kid.clear()


def _es256_keypair() -> tuple[str, dict]:
    """ES256 개인키(PEM)와 공개 JWK(kid 포함) 생성."""
    priv = ec.generate_private_key(ec.SECP256R1())
    priv_pem = priv.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub_pem = (
        priv.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    pub_jwk = jwk.construct(pub_pem, "ES256").to_dict()
    pub_jwk["kid"] = _KID
    return priv_pem, pub_jwk


def test_es256_via_jwks(monkeypatch):
    priv_pem, pub_jwk = _es256_keypair()
    settings = Settings(supabase_url="https://proj.supabase.co")
    monkeypatch.setattr(auth, "_fetch_jwks", lambda s: {_KID: pub_jwk})

    token = jwt.encode(_CLAIMS, priv_pem, algorithm="ES256", headers={"kid": _KID})
    user = auth.get_current_user(f"Bearer {token}", settings)
    assert user.user_id == "user-123"
    assert user.email == "a@b.com"


def test_es256_unknown_kid_rejected(monkeypatch):
    priv_pem, _ = _es256_keypair()
    settings = Settings(supabase_url="https://proj.supabase.co")
    monkeypatch.setattr(auth, "_fetch_jwks", lambda s: {})  # kid 없음

    token = jwt.encode(_CLAIMS, priv_pem, algorithm="ES256", headers={"kid": _KID})
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(f"Bearer {token}", settings)
    assert exc.value.status_code == 401


def test_hs256_legacy_secret():
    settings = Settings(supabase_jwt_secret="legacy-secret")
    token = jwt.encode(_CLAIMS, "legacy-secret", algorithm="HS256")
    user = auth.get_current_user(f"Bearer {token}", settings)
    assert user.user_id == "user-123"


def test_hs256_wrong_secret_rejected():
    settings = Settings(supabase_jwt_secret="right-secret")
    token = jwt.encode(_CLAIMS, "wrong-secret", algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(f"Bearer {token}", settings)
    assert exc.value.status_code == 401


def test_missing_bearer():
    with pytest.raises(HTTPException) as exc:
        auth.get_current_user(None, Settings())
    assert exc.value.status_code == 401
