"""레시피 공유 URL (S7, F9).

- POST /recipes/share : 생성 레시피를 공개 스냅샷으로 저장 → 공유 URL 반환(인증).
- GET  /r/{slug}      : 공개 레시피 페이지를 서버렌더 HTML로 제공(무인증).
                        크롤러는 JS를 실행하지 않으므로 OG/Twitter 메타를 서버에서 심는다.
- GET  /sitemap.xml   : 공유 레시피 URL 목록(SEO 색인).
- GET  /robots.txt    : 사이트맵 위치 안내.

보안: 공개 페이지의 모든 동적 문자열은 html.escape로 이스케이프한다(XSS 방지).
"""

from __future__ import annotations

import html
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse, Response

from .. import db
from ..auth import AuthUser, get_current_user
from ..config import Settings, get_settings
from ..schemas import ShareRecipeRequest, ShareRecipeResponse

router = APIRouter(tags=["share"])


def _share_url(base: str, slug: str) -> str:
    return f"{base.rstrip('/')}/r/{slug}"


@router.post("/recipes/share")
def share_recipe(
    body: ShareRecipeRequest,
    user: AuthUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> ShareRecipeResponse:
    """레시피를 공개 페이지로 스냅샷 저장하고 공유 URL을 반환한다.

    공유는 '그 시점의 레시피'를 고정한다(이후 재고 변화와 무관). fridgeId가 오면
    멤버십을 검증하되, 공개 페이지 자체에는 냉장고/개인정보를 노출하지 않는다.
    """
    fridge_id: str | None = None
    if body.fridgeId:
        try:
            fridge_id, _ = db.resolve_fridge(user.user_id, body.fridgeId)
        except PermissionError as exc:
            raise HTTPException(403, str(exc)) from exc

    recipe = {
        "title": body.title,
        "usedIngredients": body.usedIngredients,
        "expiringUsed": body.expiringUsed,
        "missing": body.missing,
        "steps": body.steps,
    }
    slug = db.create_shared_recipe(user.user_id, fridge_id, body.title, recipe)
    return ShareRecipeResponse(
        slug=slug, url=_share_url(settings.public_base_url, slug)
    )


def _meta_description(recipe: dict) -> str:
    """검색·미리보기용 요약(<=200자). 임박 소진 + 주요 재료를 담는다."""
    used = recipe.get("usedIngredients") or []
    expiring = recipe.get("expiringUsed") or []
    parts: list[str] = []
    if expiring:
        parts.append(f"임박 재료 {', '.join(expiring[:3])} 소진 레시피")
    if used:
        parts.append(f"재료: {', '.join(used[:6])}")
    desc = ". ".join(parts) or "냉장고 재료로 만드는 레시피 — Fridgy 추천"
    return desc[:200]


def _render_page(slug: str, recipe: dict, s: Settings) -> str:
    title = recipe.get("title") or "레시피"
    used = recipe.get("usedIngredients") or []
    expiring = set(recipe.get("expiringUsed") or [])
    missing = recipe.get("missing") or []
    steps = recipe.get("steps") or []

    e = html.escape
    desc = _meta_description(recipe)
    url = _share_url(s.public_base_url, slug)
    app_url = s.web_base_url.rstrip("/")

    # 재료 칩(임박은 강조)
    all_chips = list(used) + [x for x in expiring if x not in used]
    chips_html = "".join(
        f'<span class="chip {"hot" if c in expiring else ""}">{e(c)}</span>'
        for c in all_chips
    )
    missing_html = (
        f'<p class="missing">필요 재료: {e(", ".join(missing))}</p>' if missing else ""
    )
    steps_html = "".join(f"<li>{e(str(step))}</li>" for step in steps)

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)} · Fridgy</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{e(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Fridgy">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(url)}">
<meta property="og:image" content="{e(s.og_image_url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{e(s.og_image_url)}">
<style>
  :root {{ color-scheme: light; }}
  body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:#f8fafc; color:#1f2937; line-height:1.6; }}
  .wrap {{ max-width:640px; margin:0 auto; padding:24px 20px 48px; }}
  header {{ text-align:center; margin-bottom:20px; }}
  header a {{ color:#15803d; font-weight:700; text-decoration:none; font-size:20px; }}
  h1 {{ font-size:26px; margin:8px 0 16px; color:#111827; }}
  .chips {{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:20px; }}
  .chip {{ background:#dbeafe; color:#1d4ed8; border-radius:999px; padding:4px 10px; font-size:13px; }}
  .chip.hot {{ background:#ffedd5; color:#c2410c; font-weight:600; }}
  .missing {{ color:#6b7280; font-size:14px; }}
  h2 {{ font-size:16px; color:#374151; margin:24px 0 8px; }}
  ol {{ padding-left:20px; }} ol li {{ margin:6px 0; }}
  .cta {{ display:block; text-align:center; margin-top:32px; background:#2563eb; color:#fff;
    padding:14px; border-radius:12px; text-decoration:none; font-weight:600; }}
  footer {{ margin-top:28px; text-align:center; color:#9ca3af; font-size:12px; }}
</style>
</head>
<body>
<div class="wrap">
  <header><a href="{e(app_url)}">🧊 Fridgy</a></header>
  <h1>{e(title)}</h1>
  <div class="chips">{chips_html}</div>
  {missing_html}
  <h2>조리 단계</h2>
  <ol>{steps_html}</ol>
  <a class="cta" href="{e(app_url)}">냉장고 재료로 레시피 받기 →</a>
  <footer>냉장고 유통기한 관리 · 임박 재료 레시피 · Fridgy</footer>
</div>
</body>
</html>"""


@router.get("/r/{slug}", response_class=HTMLResponse)
def public_recipe_page(
    slug: str, settings: Settings = Depends(get_settings)
) -> HTMLResponse:
    """공개 레시피 페이지(무인증, 서버렌더 HTML + OG 메타)."""
    row = db.get_shared_recipe(slug)
    if row is None:
        raise HTTPException(404, "공유된 레시피를 찾을 수 없습니다")
    html_str = _render_page(slug, row["recipe"], settings)
    # 크롤러·CDN이 잠시 캐시하도록(비용/부하 완화).
    return HTMLResponse(html_str, headers={"Cache-Control": "public, max-age=3600"})


@router.get("/sitemap.xml")
def sitemap(settings: Settings = Depends(get_settings)) -> Response:
    """공유 레시피 URL 목록(SEO 색인용)."""
    base = settings.public_base_url.rstrip("/")
    urls = [f"{base}/r/{r['slug']}" for r in db.list_shared_recipe_slugs()]
    entries = "".join(f"<url><loc>{xml_escape(u)}</loc></url>" for u in urls)
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{entries}</urlset>"
    )
    return Response(body, media_type="application/xml")


@router.get("/robots.txt", response_class=PlainTextResponse)
def robots(settings: Settings = Depends(get_settings)) -> str:
    base = settings.public_base_url.rstrip("/")
    return f"User-agent: *\nAllow: /r/\nSitemap: {base}/sitemap.xml\n"
