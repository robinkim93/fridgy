"""Supabase Auth JWT 검증 (S0 인증 미들웨어).

프런트는 Supabase Auth(구글 OAuth)로 로그인 후 access token(JWT)을
Authorization: Bearer <token> 로 실어 보낸다. 백엔드는 이 서명을 검증해 인증 요청을 구분한다.

Supabase는 프로젝트에 따라 서명 방식이 다르다:
- 비대칭 서명 키(ES256/RS256): JWKS(공개키)로 검증 — 신규 프로젝트 기본.
- 레거시 대칭 시크릿(HS256): SUPABASE_JWT_SECRET로 검증.
토큰 헤더의 alg를 보고 둘 다 지원한다. JWKS는 kid별로 캐시하고, 미스 시 1회 갱신(키 로테이션 대비).
"""

from __future__ import annotations

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from .config import Settings, get_settings

_ASYMMETRIC_ALGS = {"ES256", "RS256"}
# kid -> JWK(dict). 모듈 수명 동안 캐시(요청마다 네트워크 호출 방지).
_jwks_by_kid: dict[str, dict] = {}


class AuthUser:
    def __init__(self, user_id: str, email: str | None):
        self.user_id = user_id
        self.email = email


def _fetch_jwks(settings: Settings) -> dict[str, dict]:
    """Supabase JWKS 엔드포인트에서 공개키 목록을 받아 kid로 인덱싱."""
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10.0)
    resp.raise_for_status()
    return {k["kid"]: k for k in resp.json().get("keys", []) if k.get("kid")}


def _jwk_for_kid(kid: str, settings: Settings) -> dict | None:
    """kid에 해당하는 JWK. 캐시 미스면 1회 갱신(첫 사용·키 로테이션 대비)."""
    if kid in _jwks_by_kid:
        return _jwks_by_kid[kid]
    try:
        _jwks_by_kid.update(_fetch_jwks(settings))
    except (httpx.HTTPError, ValueError, KeyError):
        return None
    return _jwks_by_kid.get(kid)


def _verification_key(token: str, settings: Settings) -> tuple[object, str]:
    """토큰 헤더의 alg에 맞는 (검증키, alg)를 고른다. HS256=시크릿, 비대칭=JWKS."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from exc

    alg = header.get("alg")
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                "SUPABASE_JWT_SECRET not configured",
            )
        return settings.supabase_jwt_secret, alg

    if alg in _ASYMMETRIC_ALGS:
        if not settings.supabase_url:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "SUPABASE_URL not configured"
            )
        kid = header.get("kid", "")
        jwk = _jwk_for_kid(kid, settings)
        if jwk is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
        return jwk, alg

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def get_current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    token = authorization.removeprefix("Bearer ").strip()

    key, alg = _verification_key(token, settings)
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience="authenticated",
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    return AuthUser(user_id=user_id, email=payload.get("email"))


def get_optional_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthUser | None:
    """인증이 있으면 사용자, 없으면 None(익명). SD-1 이벤트 수집처럼
    로그인 여부와 무관하게 받되, 로그인 시 집계·동의 검증에 쓴다."""
    if not authorization:
        return None
    try:
        return get_current_user(authorization, settings)
    except HTTPException:
        return None
