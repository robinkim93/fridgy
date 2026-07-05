"""레시피 공유 페이지 렌더 테스트 (S7, F9).

DB 없이 순수 렌더 함수(_render_page, _meta_description, _share_url)를 검증한다.
핵심: OG/Twitter 메타 존재, XSS 이스케이프, 임박 재료 강조.
"""

from __future__ import annotations

from app.config import Settings
from app.routers.share import _meta_description, _render_page, _share_url

_S = Settings(
    public_base_url="https://api.fridgy.app",
    web_base_url="https://fridgy.app",
    og_image_url="https://fridgy.app/og-recipe.png",
)

_RECIPE = {
    "title": "두부 김치찌개",
    "usedIngredients": ["두부", "김치", "대파"],
    "expiringUsed": ["두부"],
    "missing": ["고춧가루"],
    "steps": ["재료를 썬다", "끓인다"],
}


def test_share_url_no_double_slash():
    assert _share_url("https://api.fridgy.app/", "abc") == "https://api.fridgy.app/r/abc"


def test_meta_description_mentions_expiring_and_limits_length():
    desc = _meta_description(_RECIPE)
    assert "두부" in desc
    assert len(desc) <= 200


def test_render_page_has_og_and_canonical():
    page = _render_page("slug123", _RECIPE, _S)
    assert '<html lang="ko">' in page
    assert 'property="og:title" content="두부 김치찌개"' in page
    assert 'property="og:url" content="https://api.fridgy.app/r/slug123"' in page
    assert 'property="og:image" content="https://fridgy.app/og-recipe.png"' in page
    assert 'name="twitter:card" content="summary_large_image"' in page
    assert 'rel="canonical" href="https://api.fridgy.app/r/slug123"' in page
    # 앱 열기 CTA는 웹앱 도메인을 가리킨다
    assert 'href="https://fridgy.app"' in page


def test_render_page_marks_expiring_chip_hot():
    page = _render_page("s", _RECIPE, _S)
    assert '<span class="chip hot">두부</span>' in page
    assert '<span class="chip ">김치</span>' in page


def test_render_page_escapes_xss():
    evil = {
        "title": "<script>alert(1)</script>",
        "usedIngredients": ['"><img src=x onerror=alert(1)>'],
        "expiringUsed": [],
        "missing": [],
        "steps": ["<b>hi</b>"],
    }
    page = _render_page("s", evil, _S)
    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;" in page
    assert "<img src=x" not in page
    assert "<b>hi</b>" not in page
