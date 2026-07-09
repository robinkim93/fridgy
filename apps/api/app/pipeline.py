"""영수증 처리 파이프라인 (BackgroundTask).

흐름: OCR → 1차 정규화(무료) → 2차 정규화(1차 실패분만 NIM) → 작업행 done.
소비기한(expire_at) 매핑은 S2에서 붙인다.
F8: PDF 영수증은 페이지 이미지로 렌더(pdf) 후 페이지별 OCR 결과를 병합한다.
"""

from __future__ import annotations

import logging

from . import clova, db, gvision, nim, pdf
from .normalize import first_pass

logger = logging.getLogger(__name__)


def _ocr_one(image: bytes, content_type: str) -> list[str]:
    """단일 이미지 OCR. 엔진 우선순위: Google Vision → CLOVA → NIM(폴백).

    Google Vision은 전체 텍스트만 주므로 LLM으로 품목을 선별한다. CLOVA는 영수증 특화라
    품목을 바로 구조화한다. 설정된 것 중 앞선 엔진을 쓰고, 실패하면 다음으로 폴백한다.
    """
    if gvision.is_configured():
        try:
            lines = gvision.ocr_lines(image, content_type)
            return nim.filter_item_lines(lines)
        except Exception as exc:  # noqa: BLE001 — 실패는 다음 엔진으로 폴백
            logger.warning("Google Vision OCR failed (%s); trying next engine", exc)
    if clova.is_configured():
        try:
            return clova.receipt_ocr(image, content_type)
        except Exception as exc:  # noqa: BLE001 — CLOVA 실패는 NIM으로 폴백
            logger.warning("CLOVA OCR failed (%s); falling back to NIM", exc)
    return nim.ocr(image, content_type)


def _ocr_all(image: bytes, content_type: str) -> list[str]:
    """입력(이미지 또는 PDF)에서 품목 라인을 추출. PDF는 페이지별로 OCR해 병합."""
    if content_type == "application/pdf":
        lines: list[str] = []
        for png in pdf.pdf_to_png_pages(image):
            lines.extend(_ocr_one(png, "image/png"))
        return lines
    return _ocr_one(image, content_type)


def process_receipt(
    job_id: str, user_id: str, image: bytes, content_type: str
) -> None:
    try:
        lines = _ocr_all(image, content_type)
        user_aliases, global_aliases = db.load_aliases(user_id)

        parsed = []
        misses: list[str] = []
        for line in lines:
            hit = first_pass(line, user_aliases, global_aliases)
            if hit is not None:
                parsed.append(hit)
            else:
                misses.append(line)

        if misses:  # 비용 발생: 1차 실패분만 LLM 위임
            parsed.extend(nim.normalize_items(misses))

        db.finish_job_done(job_id, [db.normalized_to_parsed(n) for n in parsed])
    except Exception as exc:  # noqa: BLE001 — 작업행에 실패를 남기고 폴링이 이를 노출
        db.finish_job_failed(job_id, f"{type(exc).__name__}: {exc}")
