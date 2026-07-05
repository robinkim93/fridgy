"""이벤트 수집 엔드포인트 (SD-1).

프런트 경량 트래커가 표준 이벤트를 배치 전송한다(POST /events). 개인식별 없이
session_id + type + props만 적재한다. 로그인 사용자가 데이터 사용에 동의하지 않았으면
서버에서 수집을 차단한다(SD-2 옵트아웃 연동, 방어선). 익명 이벤트는 프런트가 동의로 게이팅한다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import db
from ..auth import AuthUser, get_optional_user
from ..schemas import EventBatchRequest, EventBatchResponse

router = APIRouter(tags=["events"])


@router.post("/events")
def collect_events(
    body: EventBatchRequest,
    user: AuthUser | None = Depends(get_optional_user),
) -> EventBatchResponse:
    user_id = user.user_id if user else None
    # 로그인 사용자는 서버에서 동의를 재확인(옵트아웃 차단).
    if user_id is not None and not db.get_consent(user_id)["data_consent"]:
        return EventBatchResponse(accepted=0)
    accepted = db.insert_events(
        body.sessionId, user_id, [e.model_dump() for e in body.events]
    )
    return EventBatchResponse(accepted=accepted)
