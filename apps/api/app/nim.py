"""NVIDIA NIM 클라이언트 — 영수증 OCR + 품목명 2차 정규화.

비용 가드레일(부록 B): NIM 호출은 1차(무료 결정적) 실패분에만 쓴다.
LLM 응답은 JSON 스키마 검증 + 실패 시 1회 재시도 후 폴백(빈 결과).
"""

from __future__ import annotations

import base64
import json

import httpx

from .config import get_settings
from .normalize import Normalized, extract_qty

_CATEGORIES = [
    "유제품", "육류", "수산물", "채소", "과일",
    "냉동식품", "가공식품", "통조림", "음료", "기타",
]


def _chat(model: str, messages: list[dict], *, max_tokens: int = 1024) -> str:
    s = get_settings()
    if not s.nim_api_key:
        raise RuntimeError("NIM_API_KEY not configured")
    resp = httpx.post(
        f"{s.nim_base_url}/chat/completions",
        headers={"Authorization": f"Bearer {s.nim_api_key}"},
        json={
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": max_tokens,
        },
        timeout=60.0,
    )
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
def ocr(image: bytes, content_type: str) -> list[str]:
    """영수증에서 '구매 품목' 텍스트 라인만 추출. 금액·합계·매장정보는 제외."""
    s = get_settings()
    data_url = f"data:{content_type};base64,{base64.b64encode(image).decode()}"
    content = _chat(
        s.nim_ocr_model,
        [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "이 영수증에서 구매한 식품/생필품 '품목명 라인'만 뽑아라. "
                            "가격·수량숫자·합계·부가세·매장정보·카드정보는 제외한다. "
                            'JSON 배열로만 답하라. 예: ["서울우유 1L", "삼겹살 500g"]'
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }
        ],
    )
    parsed = _extract_json(content)
    if not isinstance(parsed, list):
        return []
    return [str(x).strip() for x in parsed if str(x).strip()]


# ── 2차 정규화: 1차 실패 품목만 LLM에 위임 ────────────────────────────────
def normalize_items(raw_texts: list[str]) -> list[Normalized]:
    """1차 미매칭 원문들을 표준명/카테고리로 정규화. 실패 시 원문 폴백."""
    if not raw_texts:
        return []
    s = get_settings()
    prompt = (
        "다음 영수증 품목 원문들을 표준 식재료명으로 정규화하라.\n"
        f"category는 반드시 다음 중 하나: {', '.join(_CATEGORIES)}.\n"
        "각 원문에 대해 {\"rawText\",\"name\",\"category\"} 객체를 만들어 "
        "JSON 배열로만 답하라. 식품이 아니면 name은 원문 유지, category는 '기타'.\n\n"
        + "\n".join(f"- {t}" for t in raw_texts)
    )
    messages = [{"role": "user", "content": prompt}]
    for attempt in range(2):  # 스키마 실패 시 1회 재시도(부록 B)
        try:
            content = _chat(s.nim_llm_model, messages)
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
