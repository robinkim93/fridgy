"""PDF 영수증 → 페이지 이미지 렌더 (F8).

온라인 장보기 영수증(PDF)까지 커버하기 위해, NIM 비전 OCR이 받는 이미지로
서버에서 변환한다. PyMuPDF(fitz)는 순수 wheel이라 시스템 의존성(poppler)이 없다.
비용/지연 가드: 페이지 수를 상한(_MAX_PAGES)으로 제한한다.
"""

from __future__ import annotations

import fitz  # PyMuPDF

_MAX_PAGES = 3
_ZOOM = 2.0  # 144 DPI 상당 — OCR 인식률과 용량의 균형


def pdf_to_png_pages(data: bytes) -> list[bytes]:
    """PDF 바이트를 페이지별 PNG 바이트 목록으로 렌더(최대 _MAX_PAGES).

    빈/손상 PDF는 빈 리스트를 반환해 상위(파이프라인)가 '품목 없음'으로 처리하게 한다.
    """
    pages: list[bytes] = []
    matrix = fitz.Matrix(_ZOOM, _ZOOM)
    with fitz.open(stream=data, filetype="pdf") as doc:
        for page in doc[:_MAX_PAGES]:
            pix = page.get_pixmap(matrix=matrix)
            pages.append(pix.tobytes("png"))
    return pages
