"""PDF 영수증 렌더 & 파이프라인 병합 테스트 (S7, F8)."""

from __future__ import annotations

import fitz

from app import pipeline
from app.pdf import _MAX_PAGES, pdf_to_png_pages

_PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _make_pdf(pages: int) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"서울우유 1L\n삼겹살 500g page{i}")
    return doc.tobytes()


def test_pdf_to_png_pages_returns_png_bytes():
    pngs = pdf_to_png_pages(_make_pdf(2))
    assert len(pngs) == 2
    assert all(p.startswith(_PNG_SIG) for p in pngs)


def test_pdf_pages_capped_at_max():
    pngs = pdf_to_png_pages(_make_pdf(_MAX_PAGES + 3))
    assert len(pngs) == _MAX_PAGES


def test_ocr_all_merges_pdf_pages(monkeypatch):
    # PDF는 페이지별 OCR 결과를 병합한다.
    monkeypatch.setattr(pipeline.pdf, "pdf_to_png_pages", lambda data: [b"p1", b"p2"])
    calls: list[str] = []

    def fake_ocr(img: bytes, ct: str) -> list[str]:
        calls.append(ct)
        return ["우유"] if img == b"p1" else ["삼겹살"]

    monkeypatch.setattr(pipeline.nim, "ocr", fake_ocr)
    lines = pipeline._ocr_all(b"%PDF-fake", "application/pdf")
    assert lines == ["우유", "삼겹살"]
    assert calls == ["image/png", "image/png"]


def test_ocr_all_image_passthrough(monkeypatch):
    monkeypatch.setattr(pipeline.nim, "ocr", lambda img, ct: [f"line:{ct}"])
    assert pipeline._ocr_all(b"img", "image/png") == ["line:image/png"]
