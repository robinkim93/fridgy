"""절약/낭비 리포트 엔드포인트 (S6, F7).

소비/폐기 기록(waste_logs)을 월별로 집계해 절약액·낭비액·상위 폐기 품목을 반환한다.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..auth import AuthUser, get_current_user
from ..schemas import (
    TopDiscardedResponse,
    WasteMonthResponse,
    WasteReportResponse,
    WasteTotalsResponse,
)

router = APIRouter(tags=["reports"])


@router.get("/reports/waste")
def waste_report(
    fridgeId: str | None = Query(default=None),
    months: int = Query(default=6, ge=1, le=12),
    user: AuthUser = Depends(get_current_user),
) -> WasteReportResponse:
    """절약/낭비 리포트 조회 (F7).

    months 개월간의 waste_logs를 월별로 집계한다. 개인 냉장고는 자동 생성된다.
    반환: 월별 버킷(소비/폐기 건수·추정액), 상위 폐기 품목, 누적 통계.
    """
    try:
        fridge_id, _ = db.resolve_fridge(user.user_id, fridgeId)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc

    # DB 계층에서 snake_case dict를 얻는다
    report_dict = db.get_waste_report(fridge_id, months)

    # snake_case dict → camelCase 스키마로 변환
    months_list = [
        WasteMonthResponse(
            month=m["month"],
            consumedCount=m["consumed_count"],
            discardedCount=m["discarded_count"],
            consumedAmount=m["consumed_amount"],
            discardedAmount=m["discarded_amount"],
        )
        for m in report_dict.get("months", [])
    ]

    top_discarded = [
        TopDiscardedResponse(name=t["name"], count=t["count"])
        for t in report_dict.get("top_discarded", [])
    ]

    totals_dict = report_dict.get("totals", {})
    totals = WasteTotalsResponse(
        discardedCount=totals_dict.get("discarded_count", 0),
        consumedCount=totals_dict.get("consumed_count", 0),
        savedAmount=totals_dict.get("saved_amount", 0.0),
        wastedAmount=totals_dict.get("wasted_amount", 0.0),
    )

    return WasteReportResponse(months=months_list, topDiscarded=top_discarded, totals=totals)
