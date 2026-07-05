"""Supabase Auth JWT 검증 (S0 인증 미들웨어).

프런트는 Supabase Auth(구글 OAuth)로 로그인 후 access token(JWT)을
Authorization: Bearer <token> 로 실어 보낸다. 백엔드는 Supabase JWT secret으로
서명을 검증해 인증된 요청을 구분한다.
"""

from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from .config import Settings, get_settings


class AuthUser:
    def __init__(self, user_id: str, email: str | None):
        self.user_id = user_id
        self.email = email


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

    if not settings.supabase_jwt_secret:
        # 시크릿 미설정 환경(로컬 초기 세팅)에서 명확한 에러를 준다.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SUPABASE_JWT_SECRET not configured",
        )

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
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
