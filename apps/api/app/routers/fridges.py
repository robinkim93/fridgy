"""공유 냉장고 엔드포인트 (S5, F6).

멤버십·초대 링크·멤버 관리·변경 로그. 재고 CRUD의 fridge 스코프는
기존 라우터(inventory/recipes/receipts)가 db.resolve_fridge로 처리한다.

권한 모델: owner(초대·멤버관리·이름변경) / member(재고 CRUD).
백엔드는 service_role로 접근하며 여기서 앱단 권한을 강제한다.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from .. import db
from ..auth import AuthUser, get_current_user
from ..schemas import (
    ActivityListResponse,
    ActivityResponse,
    FridgeListResponse,
    FridgeRenameRequest,
    FridgeSummary,
    InviteAcceptResponse,
    InviteCreateRequest,
    InviteCreateResponse,
    InviteInfoResponse,
    MemberListResponse,
    MemberResponse,
)

router = APIRouter(prefix="/fridges", tags=["fridges"])


def _require_owner(user_id: str, fridge_id: str) -> None:
    role = db.get_member_role(user_id, fridge_id)
    if role is None:
        raise HTTPException(403, "이 냉장고의 멤버가 아닙니다")
    if role != "owner":
        raise HTTPException(403, "소유자만 수행할 수 있습니다")


def _require_member(user_id: str, fridge_id: str) -> str:
    role = db.get_member_role(user_id, fridge_id)
    if role is None:
        raise HTTPException(403, "이 냉장고의 멤버가 아닙니다")
    return role


@router.get("")
def list_fridges(user: AuthUser = Depends(get_current_user)) -> FridgeListResponse:
    """내가 속한 냉장고 목록(스위처용). 개인 냉장고가 없으면 생성한다."""
    fridges = db.list_user_fridges(user.user_id)
    if not fridges:
        db.get_or_create_personal_fridge(user.user_id)
        fridges = db.list_user_fridges(user.user_id)
    return FridgeListResponse(items=[FridgeSummary(**f) for f in fridges])


@router.patch("/{fridge_id}")
def rename_fridge(
    fridge_id: str,
    body: FridgeRenameRequest,
    user: AuthUser = Depends(get_current_user),
) -> FridgeSummary:
    _require_owner(user.user_id, fridge_id)
    db.rename_fridge(fridge_id, body.name.strip())
    for f in db.list_user_fridges(user.user_id):
        if f["id"] == fridge_id:
            return FridgeSummary(**f)
    raise HTTPException(404, "냉장고를 찾을 수 없습니다")


@router.post("/{fridge_id}/invite")
def create_invite(
    fridge_id: str,
    body: InviteCreateRequest,
    user: AuthUser = Depends(get_current_user),
) -> InviteCreateResponse:
    _require_owner(user.user_id, fridge_id)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.ttlHours)
    inv = db.create_invite(fridge_id, user.user_id, body.role, expires_at)
    return InviteCreateResponse(
        token=inv["token"], role=inv["role"], expiresAt=inv["expires_at"]
    )


@router.get("/invites/{token}")
def invite_info(token: str) -> InviteInfoResponse:
    """수락 화면용 초대 미리보기(무인증 — 토큰만으로 조회)."""
    inv = db.get_invite(token)
    if inv is None:
        raise HTTPException(404, "초대 링크가 유효하지 않습니다")
    expires = datetime.fromisoformat(inv["expires_at"])
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return InviteInfoResponse(
        fridgeName=(inv.get("fridges") or {}).get("name", "공유 냉장고"),
        role=inv["role"],
        expired=expires < datetime.now(timezone.utc),
        accepted=bool(inv.get("accepted_at")),
    )


@router.post("/invites/{token}/accept")
def accept_invite(
    token: str, user: AuthUser = Depends(get_current_user)
) -> InviteAcceptResponse:
    try:
        result = db.accept_invite(token, user.user_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return InviteAcceptResponse(**result)


@router.get("/{fridge_id}/members")
def list_members(
    fridge_id: str, user: AuthUser = Depends(get_current_user)
) -> MemberListResponse:
    _require_member(user.user_id, fridge_id)
    rows = db.list_members(fridge_id)
    return MemberListResponse(
        items=[
            MemberResponse(
                userId=r["user_id"], role=r["role"], joinedAt=r["joined_at"]
            )
            for r in rows
        ]
    )


@router.delete("/{fridge_id}/members/{target_user_id}")
def remove_member(
    fridge_id: str,
    target_user_id: str,
    user: AuthUser = Depends(get_current_user),
) -> dict:
    _require_owner(user.user_id, fridge_id)
    if target_user_id == user.user_id:
        raise HTTPException(400, "소유자 자신은 제거할 수 없습니다")
    removed = db.remove_member(fridge_id, user.user_id, target_user_id)
    if not removed:
        raise HTTPException(400, "제거할 수 없는 멤버입니다")
    return {"removed": True}


@router.get("/{fridge_id}/activity")
def list_activity(
    fridge_id: str, user: AuthUser = Depends(get_current_user)
) -> ActivityListResponse:
    _require_member(user.user_id, fridge_id)
    rows = db.list_activity(fridge_id)
    return ActivityListResponse(
        items=[
            ActivityResponse(
                id=r["id"],
                actorUserId=r["actor_user_id"],
                action=r["action"],
                detail=r.get("detail") or {},
                createdAt=r["created_at"],
            )
            for r in rows
        ]
    )
