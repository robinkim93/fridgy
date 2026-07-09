"""Google Cloud Vision OCR — 무료 티어(월 1,000건) 한국어 문서 OCR.

DOCUMENT_TEXT_DETECTION으로 영수증 전체 텍스트를 정확히 추출(한국어 강함). 원시 라인만 주므로
품목 선별은 상위(pipeline)가 nim.filter_item_lines(LLM)로 수행한다.

셋업: GCP 콘솔 → Cloud Vision API 사용 설정 → 사용자 인증 정보 → API 키 발급
      → GOOGLE_VISION_API_KEY 등록. (키는 Vision API로만 제한 권장)
"""

from __future__ import annotations

import base64
import logging

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

_URL = "https://vision.googleapis.com/v1/images:annotate"


def is_configured() -> bool:
    return bool(get_settings().google_vision_api_key)


def ocr_lines(image: bytes, content_type: str) -> list[str]:
    """영수증 이미지에서 전체 텍스트 라인을 추출. 실패 시 예외를 올려 상위가 폴백."""
    s = get_settings()
    payload = {
        "requests": [
            {
                "image": {"content": base64.b64encode(image).decode()},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION"}],
                "imageContext": {"languageHints": ["ko", "en"]},
            }
        ]
    }
    resp = httpx.post(
        f"{_URL}?key={s.google_vision_api_key}", json=payload, timeout=30.0
    )
    if resp.status_code >= 400:  # 진단: 실제 사유 노출
        logger.warning("Google Vision error %s: %s", resp.status_code, resp.text[:600])
    resp.raise_for_status()

    responses = resp.json().get("responses") or []
    if not responses:
        return []
    err = responses[0].get("error")
    if err:
        raise RuntimeError(f"vision error: {err.get('message')}")
    text = (responses[0].get("fullTextAnnotation") or {}).get("text", "")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    logger.warning("Google Vision lines=%r", lines[:40])
    return lines
