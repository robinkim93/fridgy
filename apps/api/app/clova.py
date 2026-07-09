"""Naver CLOVA OCR — 한국어 영수증 특화 OCR.

NVIDIA 무료 모델(VLM·nemotron)이 한국어 감열 영수증 인식에서 신뢰도가 낮아,
한국어 영수증 특화 서비스인 CLOVA OCR을 1순위 엔진으로 쓴다.

셋업: NCP 콘솔 → CLOVA OCR → Domain 생성(모델=Receipt) → APIGW Invoke URL과
Secret Key를 CLOVA_OCR_INVOKE_URL / CLOVA_OCR_SECRET 에 등록.

영수증 특화 응답은 품목을 구조화(images[].receipt.result.subResults[].items[])하므로
별도 LLM 필터 없이 품목명을 바로 추출한다.
"""

from __future__ import annotations

import base64
import logging
import time
import uuid

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

# CLOVA가 받는 이미지 포맷. PDF는 파이프라인이 PNG 페이지로 변환해 넘긴다.
_FORMAT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "jpg",  # webp 미지원 → jpg로 표기(대개 무해). 필요 시 상위에서 변환.
}


def is_configured() -> bool:
    s = get_settings()
    return bool(s.clova_ocr_invoke_url and s.clova_ocr_secret)


def receipt_ocr(image: bytes, content_type: str) -> list[str]:
    """CLOVA 영수증 OCR로 품목명 리스트를 추출. 실패 시 예외를 올려 상위가 폴백."""
    s = get_settings()
    payload = {
        "version": "V2",
        "requestId": uuid.uuid4().hex,
        "timestamp": int(time.time() * 1000),
        "images": [
            {
                "format": _FORMAT.get(content_type, "jpg"),
                "name": "receipt",
                "data": base64.b64encode(image).decode(),
            }
        ],
    }
    resp = httpx.post(
        s.clova_ocr_invoke_url,
        headers={"X-OCR-SECRET": s.clova_ocr_secret, "Content-Type": "application/json"},
        json=payload,
        timeout=30.0,
    )
    if resp.status_code >= 400:  # 진단: 실제 사유 노출
        logger.warning("CLOVA OCR error %s: %s", resp.status_code, resp.text[:600])
    resp.raise_for_status()

    images = resp.json().get("images") or []
    result = ((images[0].get("receipt") or {}).get("result") or {}) if images else {}
    names: list[str] = []
    for sub in result.get("subResults") or []:
        for item in sub.get("items") or []:
            name = ((item.get("name") or {}).get("text") or "").strip()
            if name:
                names.append(name)
    logger.warning("CLOVA items=%r", names)
    return names
