"""영수증 업로드·폴링 엔드포인트 (F1)."""

from __future__ import annotations

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)

from .. import db, storage
from ..auth import AuthUser, get_current_user
from ..pipeline import process_receipt
from ..schemas import ParsedItem, ReceiptCreateResponse, ReceiptJobResponse

router = APIRouter(prefix="/receipts", tags=["receipts"])

_ALLOWED = {"image/png", "image/jpeg", "image/webp"}
_MAX_BYTES = 8 * 1024 * 1024  # 8MB


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def create_receipt(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    user: AuthUser = Depends(get_current_user),
) -> ReceiptCreateResponse:
    if file.content_type not in _ALLOWED:
        raise HTTPException(400, f"지원하지 않는 형식: {file.content_type}")
    data = file.file.read()
    if not data:
        raise HTTPException(400, "빈 파일")
    if len(data) > _MAX_BYTES:
        raise HTTPException(413, "파일이 너무 큽니다(최대 8MB)")

    fridge_id = db.get_or_create_personal_fridge(user.user_id)
    image_path = storage.upload_receipt(user.user_id, data, file.content_type)
    job_id = db.create_job(user.user_id, fridge_id, image_path)

    # 비동기: OCR→정규화. 폴링(GET)으로 결과 확인.
    background.add_task(process_receipt, job_id, user.user_id, data, file.content_type)
    return ReceiptCreateResponse(jobId=job_id, status="processing")


@router.get("/{job_id}")
def get_receipt(
    job_id: str, user: AuthUser = Depends(get_current_user)
) -> ReceiptJobResponse:
    job = db.get_job(job_id, user.user_id)
    if job is None:
        raise HTTPException(404, "작업을 찾을 수 없습니다")
    items = [ParsedItem(**it) for it in (job.get("parsed") or [])]
    return ReceiptJobResponse(
        id=job["id"], status=job["status"], items=items, error=job.get("error")
    )
