"""Supabase Storage — 영수증 원본 업로드.

버킷은 비공개. 원본은 품목 추출 후 파기 옵션(SD-2) 대상이므로 경로만 DB에 남긴다.
"""

from __future__ import annotations

import uuid

from .db import get_client

RECEIPTS_BUCKET = "receipts"


def upload_receipt(user_id: str, data: bytes, content_type: str) -> str:
    """영수증 이미지를 업로드하고 저장 경로를 반환."""
    ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "application/pdf": "pdf",
    }.get(content_type, "bin")
    path = f"{user_id}/{uuid.uuid4().hex}.{ext}"
    get_client().storage.from_(RECEIPTS_BUCKET).upload(
        path, data, {"content-type": content_type, "upsert": "false"}
    )
    return path


def delete_receipt(path: str) -> None:
    """영수증 원본 삭제(SD-2 파기 배치). 존재하지 않는 객체는 호출부가 무시한다."""
    get_client().storage.from_(RECEIPTS_BUCKET).remove([path])
