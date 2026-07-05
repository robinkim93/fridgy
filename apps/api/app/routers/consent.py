"""동의·옵트아웃 설정 엔드포인트 (SD-2).

- GET   /me/consent : 현재 동의 상태(데이터 사용·영수증 보관·온보딩 여부).
- PATCH /me/consent : 부분 갱신(온보딩 수락/거절, 토글 변경).

기본은 프라이버시 우선(둘 다 false). 동의 없이는 SD-1 수집이 차단된다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db
from ..auth import AuthUser, get_current_user
from ..schemas import ConsentResponse, ConsentUpdateRequest

router = APIRouter(tags=["consent"])


def _to_response(c: dict) -> ConsentResponse:
    return ConsentResponse(
        dataConsent=c["data_consent"],
        receiptRetain=c["receipt_retain"],
        onboarded=c["onboarded"],
    )


@router.get("/me/consent")
def get_consent(user: AuthUser = Depends(get_current_user)) -> ConsentResponse:
    return _to_response(db.get_consent(user.user_id))


@router.patch("/me/consent")
def update_consent(
    body: ConsentUpdateRequest, user: AuthUser = Depends(get_current_user)
) -> ConsentResponse:
    updated = db.set_consent(
        user.user_id,
        data_consent=body.dataConsent,
        receipt_retain=body.receiptRetain,
        onboarded=body.onboarded,
    )
    return _to_response(updated)
