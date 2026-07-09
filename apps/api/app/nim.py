"""NVIDIA NIM 클라이언트 — 영수증 OCR + 품목명 2차 정규화.

비용 가드레일(부록 B): NIM 호출은 1차(무료 결정적) 실패분에만 쓴다.
LLM 응답은 JSON 스키마 검증 + 실패 시 1회 재시도 후 폴백(빈 결과).
"""

from __future__ import annotations

import base64
import io
import json
import logging

import httpx

from .config import get_settings
from .normalize import Normalized, extract_qty

logger = logging.getLogger(__name__)

# image_url은 이미지를 vision 토큰으로 처리(텍스트 컨텍스트 미소모)하므로, 작은 한글
# 감열지 인식률을 위해 해상도·품질을 넉넉히 준다. 과대 요청 방지용 바이트 상한만 둔다.
_OCR_MAX_SIDE = 2600  # 작은 한글 영수증 텍스트 가독성 확보
_MAX_INLINE_BYTES = 400_000  # 요청 과대 방지 상한(품질 우선, 초과 시에만 압축)


def _prepare_image(data: bytes, content_type: str) -> tuple[bytes, str]:
    """OCR 전 이미지를 축소하고 inline 한계 내 JPEG로 재인코딩. 실패 시 원본 유지."""
    try:
        from PIL import Image  # 런타임 의존(requirements). 실패 시 원본 폴백.

        img = Image.open(io.BytesIO(data)).convert("RGB")
        img.thumbnail((_OCR_MAX_SIDE, _OCR_MAX_SIDE))
        # 텍스트 OCR은 해상도·선명도가 중요 → 고품질 우선, 상한 초과 시에만 단계적 압축.
        for quality in (92, 85, 78, 68):
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality)
            if buf.tell() <= _MAX_INLINE_BYTES:
                return buf.getvalue(), "image/jpeg"
        img.thumbnail((2048, 2048))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return buf.getvalue(), "image/jpeg"
    except Exception:  # noqa: BLE001 — 다운스케일 실패는 원본으로 시도
        return data, content_type


_CATEGORIES = [
    "유제품", "육류", "수산물", "채소", "과일",
    "냉동식품", "가공식품", "통조림", "음료", "기타",
]


def _chat(
    model: str, messages: list[dict], *, max_tokens: int = 1024, temperature: float = 0.2
) -> str:
    s = get_settings()
    if not s.nim_api_key:
        raise RuntimeError("NIM_API_KEY not configured")
    resp = httpx.post(
        f"{s.nim_base_url}/chat/completions",
        headers={"Authorization": f"Bearer {s.nim_api_key}"},
        json={
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
        timeout=60.0,
    )
    if resp.status_code >= 400:  # 진단: NVIDIA 400 등의 실제 사유를 본문에서 노출
        logger.warning("NIM %s error %s: %s", model, resp.status_code, resp.text[:600])
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def _extract_json(text: str) -> object:
    """코드펜스·잡텍스트를 걷어내고 첫 JSON 값을 파싱."""
    t = text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t.split("\n", 1)[1] if "\n" in t else t
    start = min((i for i in (t.find("["), t.find("{")) if i != -1), default=-1)
    if start == -1:
        raise ValueError("no JSON in response")
    return json.loads(t[start:])


# ── OCR: 영수증 이미지 → 원시 품목 라인 ──────────────────────────────────
def _detect_lines(image: bytes, content_type: str) -> list[str]:
    """전용 다국어 OCR(nemotron-ocr-v2)로 이미지의 모든 텍스트 라인을 위→아래 순서로 추출."""
    s = get_settings()
    if not s.nim_api_key:
        raise RuntimeError("NIM_API_KEY not configured")
    img_bytes, ct = _prepare_image(image, content_type)
    data_url = f"data:{ct};base64,{base64.b64encode(img_bytes).decode()}"
    resp = httpx.post(
        s.nim_ocr_infer_url,
        headers={"Authorization": f"Bearer {s.nim_api_key}", "Accept": "application/json"},
        json={"input": [{"type": "image_url", "url": data_url}], "merge_levels": ["paragraph"]},
        timeout=60.0,
    )
    if resp.status_code >= 400:  # 진단: 실제 사유 노출
        logger.warning("OCR infer error %s: %s", resp.status_code, resp.text[:600])
    resp.raise_for_status()
    logger.warning("OCR raw(img=%dB): %s", len(img_bytes), resp.text[:2500])  # 진단: 원시 응답
    data = resp.json().get("data") or []
    dets = data[0].get("text_detections", []) if data else []

    def _topleft(d: dict) -> tuple[float, float]:
        pts = (d.get("bounding_box") or {}).get("points") or []
        ys = [p.get("y", 0.0) for p in pts] or [0.0]
        xs = [p.get("x", 0.0) for p in pts] or [0.0]
        return (min(ys), min(xs))

    lines = [
        (d.get("text_prediction") or {}).get("text", "").strip()
        for d in sorted(dets, key=_topleft)
    ]
    return [ln for ln in lines if ln]


def filter_item_lines(lines: list[str]) -> list[str]:
    """전체 OCR 라인 중 '구매 식품/식재료 품목명' 라인만 LLM으로 추린다.

    전용 OCR(nemotron)·Google Vision 등 '전체 텍스트'를 주는 엔진의 후처리에 공용으로 쓴다.
    """
    if not lines:
        return []
    s = get_settings()
    # LLM에는 '어느 라인이 품목인가'만 번호로 고르게 한다. 텍스트를 재작성하게 두면
    # "꽈리고추 수육튀김"을 "꽈리고추"로 줄이는 등 상품명을 임의 축약하므로, 선택된
    # 번호로 '원문 라인'을 그대로 되돌린다(글자 변형 원천 차단).
    numbered = "\n".join(f"{i}: {ln}" for i, ln in enumerate(lines))
    prompt = (
        "다음은 한국어 영수증에서 OCR로 추출한, 번호가 매겨진 텍스트 라인들이다. 이 중 "
        "'구매한 식품/식재료 품목명'이 들어있는 라인의 번호만 고르라. 상호·주소·사업자번호·"
        "전화·날짜·카드번호·승인번호·합계·부가세, 그리고 가격·수량만 있는 라인은 제외한다. "
        "여러 재료가 결합된 완제품(예: '꽈리고추 수육튀김', '명란크림우동')도 하나의 품목이다. "
        "코드펜스 없이 정수 번호의 JSON 배열로만 답하라(예: [3,5,9]). 없으면 [].\n\n"
        + numbered
    )
    for attempt in range(2):
        try:
            content = _chat(
                s.nim_llm_model, [{"role": "user", "content": prompt}], temperature=0
            )
            parsed = _extract_json(content)
            if isinstance(parsed, list):
                out: list[str] = []
                for x in parsed:
                    try:
                        idx = int(x)
                    except (TypeError, ValueError):
                        continue
                    if 0 <= idx < len(lines) and lines[idx].strip():
                        out.append(lines[idx].strip())
                return out
        except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError):
            if attempt == 1:
                break
    return lines  # 필터 실패 시 전체 라인 폴백(사용자가 보정에서 정리)


def _ocr_vlm(image: bytes, content_type: str) -> list[str]:
    """폴백: 전용 OCR 실패 시 VLM(image_url)으로 품목 라인을 추출."""
    s = get_settings()
    prompt = (
        "이미지는 한국어 영수증이다. '상품명' 열의 구매 품목명을 위→아래 순서로 정확히 전사하라. "
        "글자를 비슷한 다른 글자로 추측하지 말고 보이는 그대로 옮겨라. "
        "가격·수량·합계·부가세·매장/사업자/주소/카드/승인번호는 제외한다. "
        '판독 불가하면 빈 배열([]). 코드펜스 없이 JSON 문자열 배열로만 답하라.'
    )
    img_bytes, ct = _prepare_image(image, content_type)
    data_url = f"data:{ct};base64,{base64.b64encode(img_bytes).decode()}"
    content = _chat(
        s.nim_ocr_model,
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
        temperature=0,
    )
    parsed = _extract_json(content)
    return [str(x).strip() for x in parsed if str(x).strip()] if isinstance(parsed, list) else []


def ocr(image: bytes, content_type: str) -> list[str]:
    """영수증에서 '구매 품목' 텍스트 라인만 추출.

    1순위: 전용 다국어 OCR(nemotron-ocr-v2)로 전체 라인 정확 전사 → LLM으로 품목만 필터.
    실패 시(엔드포인트/스키마 문제): VLM 폴백.
    """
    try:
        lines = _detect_lines(image, content_type)
        logger.warning("OCR(nemotron) lines=%r", lines[:40])
        items = filter_item_lines(lines)
        logger.warning("OCR items=%r", items)
        return items
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        logger.warning("dedicated OCR failed (%s); falling back to VLM", exc)
        return _ocr_vlm(image, content_type)


# ── 2차 정규화: 1차 실패 품목만 LLM에 위임 ────────────────────────────────
def normalize_items(raw_texts: list[str]) -> list[Normalized]:
    """1차 미매칭 원문들을 표준명/카테고리로 정규화. 실패 시 원문 폴백."""
    if not raw_texts:
        return []
    s = get_settings()
    prompt = (
        "다음 영수증 품목 원문들을 표준 식재료명으로 정규화하라.\n"
        f"category는 반드시 다음 중 하나: {', '.join(_CATEGORIES)}.\n"
        "규칙: 완제품·가공식품·조리식품(예: 명란크림우동, 불고기버거, 김치만두, "
        "꽈리고추 수육튀김)은 원문 제품명을 통째로 유지하라. 공백으로 나뉜 여러 단어라도 "
        "하나의 제품명이면 앞 단어만 남기지 말고 전체를 유지한다. 여러 재료가 결합된 "
        "조합명을 대표 재료 하나로 축약하지 마라. name에는 원문의 의미 있는 단어를 모두 "
        "포함하고, 용량·브랜드·포장 등 노이즈 제거만 허용한다.\n"
        "언어 유지: 원문 언어를 그대로 따른다. 영어 원문(예: Milk, Chicken Breast)은 "
        "영어 이름으로 두고 한글로 번역하지 마라. 한글 원문은 한글로 둔다.\n"
        "각 원문에 대해 {\"rawText\",\"name\",\"category\"} 객체를 만들어 "
        "JSON 배열로만 답하라. 식품이 아니면 name은 원문 유지, category는 '기타'.\n\n"
        + "\n".join(f"- {t}" for t in raw_texts)
    )
    messages = [{"role": "user", "content": prompt}]
    for attempt in range(2):  # 스키마 실패 시 1회 재시도(부록 B)
        try:
            content = _chat(s.nim_llm_model, messages, temperature=0)
            parsed = _extract_json(content)
            if not isinstance(parsed, list):
                raise ValueError("expected JSON array")
            out: list[Normalized] = []
            by_raw = {str(o.get("rawText", "")).strip(): o for o in parsed if isinstance(o, dict)}
            for raw in raw_texts:
                o = by_raw.get(raw, {})
                name = str(o.get("name") or raw).strip()
                cat = o.get("category")
                cat = cat if cat in _CATEGORIES else "기타"
                qty, unit = extract_qty(raw)
                out.append(Normalized(raw, name, cat, qty, unit, "llm"))
            return out
        except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError):
            if attempt == 1:
                break
    # 폴백: 원문 그대로 노출(사용자가 보정 UI에서 고칠 수 있게)
    return [Normalized(r, r, "기타", *extract_qty(r), "unknown") for r in raw_texts]


# ── 레시피 추천: 임박 재료 우선 소진 (S4) ─────────────────────────────────
def suggest_recipes(expiring: list[str], all_items: list[str]) -> object:
    """보유 재료로 만들 요리를 임박 재료 우선으로 추천. 원시 JSON(list) 반환.

    스키마 검증·정렬은 recipes.py가 담당한다(이 함수는 파싱만, 실패 시 1회 재시도 후 빈 리스트).
    비용 가드레일: 결과 캐싱은 호출부(라우터)가 스냅샷 해시로 처리한다.
    """
    if not all_items:
        return []
    s = get_settings()
    expiring_line = ", ".join(expiring) if expiring else "(없음)"
    prompt = (
        "너는 냉장고 재료로 만들 요리를 추천하는 셰프다.\n"
        f"보유 재료: {', '.join(all_items)}\n"
        f"임박(먼저 소진해야 하는) 재료: {expiring_line}\n\n"
        "규칙:\n"
        "- 임박 재료를 최대한 많이 소진하는 요리를 우선 추천한다.\n"
        "- 보유 재료를 주로 쓰되, 흔한 기본양념/부족 재료는 missing에 적는다.\n"
        "- 최대 5개, 실제로 만들 수 있는 현실적인 요리만.\n"
        "다음 스키마의 객체 배열 JSON으로만 답하라(설명·코드펜스 금지):\n"
        '[{"title": "요리명", "used_ingredients": ["보유재료"], '
        '"expiring_used": ["이 요리가 쓰는 임박재료"], '
        '"missing": ["부족한 재료"], "steps": ["조리 단계"]}]'
    )
    messages = [{"role": "user", "content": prompt}]
    for attempt in range(2):  # 스키마 실패 시 1회 재시도(부록 B)
        try:
            content = _chat(s.nim_llm_model, messages, max_tokens=2048)
            parsed = _extract_json(content)
            if not isinstance(parsed, list):
                raise ValueError("expected JSON array")
            return parsed
        except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError):
            if attempt == 1:
                break
    return []
