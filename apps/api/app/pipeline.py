"""영수증 처리 파이프라인 (BackgroundTask).

흐름: OCR → 1차 정규화(무료) → 2차 정규화(1차 실패분만 NIM) → 작업행 done.
소비기한(expire_at) 매핑은 S2에서 붙인다.
F8: PDF 영수증은 페이지 이미지로 렌더(pdf) 후 페이지별 OCR 결과를 병합한다.
"""

from __future__ import annotations

from . import db, nim, pdf
from .normalize import first_pass


def _ocr_all(image: bytes, content_type: str) -> list[str]:
    """입력(이미지 또는 PDF)에서 품목 라인을 추출. PDF는 페이지별로 OCR해 병합."""
    if content_type == "application/pdf":
        lines: list[str] = []
        for png in pdf.pdf_to_png_pages(image):
            lines.extend(nim.ocr(png, "image/png"))
        return lines
    return nim.ocr(image, content_type)


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
