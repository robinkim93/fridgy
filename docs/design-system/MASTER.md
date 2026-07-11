# Fridgy 디자인 시스템 — "Fresh Pantry"

냉장고 식재료 관리 PWA를 위한 **클린 플랫 디자인 시스템**. 콘셉트는
_신선한 팬트리_ — 따뜻한 그로서리 그린과 식품 앰버를 기본으로, 재고는
**냉장고 안 선반에 색으로 구분된 카테고리 타일**로 얹혀 한 눈에 파악된다.

> 살아있는 스타일 가이드: 로컬에서 `/?showcase` (`?showcase=shell` 은 GNB 셸)
> — [`apps/web/src/ui/Showcase.tsx`](../../apps/web/src/ui/Showcase.tsx).
> 토큰 원천은 [`apps/web/src/index.css`](../../apps/web/src/index.css)의 `:root`
> 와 [`tailwind.config.js`](../../apps/web/tailwind.config.js).

---

## 1. 디자인 원칙

1. **클린 플랫** — 장식 최소화, 라운드(12px 기본)와 부드러운 그림자, 또렷한 대비.
2. **신호등이 곧 제품** — 소비기한 상태(여유/임박/긴급)는 초록·앰버·빨강으로
   어디서나 일관되게 신호한다. 색만으로 전달하지 않고 **도트 + D-day 텍스트**를 병기.
3. **식품군 색 코딩** — 카테고리는 고유 색 + 라인 아이콘으로 한 눈에 구분.
   소비기한(상태) 채널과 분리되어 서로 방해하지 않는다.
4. **한 눈에 재고** — 냉장고 뷰 상단에 임박·긴급 개수 요약을 상시 노출.
5. **따뜻함 + 냉기** — 앱 크롬은 따뜻한 그린, 냉장고 내부는 차가운 프로스트 톤.
6. **벡터 아이콘, 이모지 금지** — 아이콘은 전부 라인 SVG(24 그리드, `currentColor`).

---

## 2. 컬러 토큰

| 역할 | 토큰 | HEX | 용도 |
|---|---|---|---|
| 캔버스 | `canvas` | `#F6F9F8` | 앱 배경 |
| 표면 | `surface` | `#FFFFFF` | 카드·시트 |
| 보조 표면 | `muted` | `#F1F5F4` | 세그먼트·태그 배경 |
| 라인 | `line / line-strong` | `#E5EBEA / #D3DBDA` | 테두리·구분선 |
| 잉크 | `ink` | `#0F172A` | 본문·제목 |
| 잉크(약) | `ink-soft / faint` | `#475569 / #94A3B8` | 보조·캡션 |
| 브랜드 | `brand` | `#059669` | 기본 액션·신선 |
| 브랜드(진/연) | `brand-600 / 100 / 50` | `#047857 / #D1FAE5 / #ECFDF5` | 강조·틴트 |
| 액센트 | `accent` | `#D97706` | 식품 앰버 하이라이트 |
| **신선(여유)** | `fresh` | `#059669` | D-6 이상 (tint `#ECFDF5`) |
| **임박** | `soon` | `#F59E0B` | D-1~D-5 (tint `#FEF3C7`) |
| **긴급** | `urgent` | `#EF4444` | D-day·기한 지남 (tint `#FEE2E2`) |
| 냉기 | `frost-50/100/cool` | `#F3F8FA / #E7F0F4 / #EAF2F9` | 냉장고 존 틴트 |
| 스틸 | `steel / line / dark` | `#E2E8EC / #CBD5DD / #64748B` | 냉장고 본체·라벨 |

접근성: `ink`(#0F172A) on `surface` ≈ 16:1. 상태 뱃지는 **색 + 도트 + 텍스트** 3중
신호(긴급은 은은한 맥동, `prefers-reduced-motion`에서 정지). 밝은 틴트 위 텍스트는
진한 동일계열 색(예 임박 `#B45309`, 긴급 `#B91C1C`)으로 4.5:1 이상 확보.

카테고리 색(`CategoryIcon.CATEGORY_COLOR`): 유제품 블루·육류 로즈·수산물 틸·채소 그린·
과일 오렌지·냉동식품 아이스블루·가공식품 탠·통조림 스틸·음료 바이올렛·기타 슬레이트.

---

## 3. 타이포그래피 — Pretendard 단일

한글·라틴 모두 고가독인 **Pretendard**로 통일(픽셀/비트맵 폰트 제거).
CDN(`index.css` @import): jsdelivr `orioncactus/pretendard` variable.

| 스타일 | 클래스 | 용도 |
|---|---|---|
| 워드마크/큰 제목 | `font-extrabold` | `Fridgy` 로고, 쇼케이스 헤더 |
| 제목/헤딩 | `text-xl font-bold` (`h1~h3`) | 화면 제목·섹션 |
| 라벨·버튼 | `font-semibold` | 버튼·GNB·뱃지 |
| 본문·데이터 | 기본(`font-sans`, 400) | 목록·설명 |
| 숫자·데이터 | `.tnum` | D-day·수량·금액 (등폭 숫자, 레이아웃 흔들림 방지) |

- 본문 16px 기준, line-height 1.6, 제목 letter-spacing `-0.01em`.
- 안티앨리어싱 기본(가독성 우선). 픽셀 렌더링·스무딩 해제 없음.

---

## 4. 형태 · 간격 · 모션

- **라운드**: `sm 8` / 기본 `12` / `lg 16` / `xl 20` / `2xl 24` / pill `full`.
- **그림자**: `shadow-sm`(카드) / `shadow`(기본) / `shadow-md`(냉장고) / `shadow-lg`(시트).
- **테두리**: `border border-line`(1px) 기본. 하드 그림자·두꺼운 잉크 테두리 없음.
- **간격**: 4/8px 그리드.
- **모션**: 120–200ms `ease-out`.
  - `.press` — 탭 시 `scale(0.97)`(레이아웃 이동 없음).
  - `.pulse-urgent` — 긴급 상태 도트 은은한 맥동.
  - `.tnum` — 데이터 등폭 숫자.
  - 모두 `prefers-reduced-motion`에서 정지. 포커스는 `:focus-visible` 링(brand).

---

## 5. 컴포넌트 (`apps/web/src/ui/`)

| 컴포넌트 | 파일 | 설명 |
|---|---|---|
| `Button` | `primitives.tsx` | `primary`/`ghost`/`subtle`/`danger`, 최소 44px 터치, press |
| `Card` | `primitives.tsx` | 흰 표면 + 라인 + 부드러운 그림자(`raised`=lg) |
| `ExpiryBadge` | `primitives.tsx` | 소비기한 D-day 신호등 뱃지(도트+텍스트) |
| `Tag` | `primitives.tsx` | 카테고리·수량 라벨 pill |
| `CategoryIcon` | `CategoryIcon.tsx` | 카테고리 → 색 코딩 라인 아이콘(색 칩 옵션) |
| `NavIcon` | `NavIcon.tsx` | GNB 라인 아이콘(fridge/recipe/report/bell/gear) |
| `FridgeView` | `FridgeView.tsx` | **시그니처**: 냉장고 안의 재고 |
| 소비기한 로직 | `expiry.ts` | `daysLeft`/`expiryLevel`/`ddayLabel`/`LEVEL_COLOR` |

---

## 6. 시그니처 패턴 — "냉장고 안의 재고"

재고 리스트를 냉장고로 렌더한다(`FridgeView`).

- **본체**: 라운드 스틸 카드 + 부드러운 그림자. 상단 스트립에 온도(3°C)와
  **한눈 요약**(긴급 N · 임박 M, 없으면 "모두 신선").
- **구역(zone)**: `냉장실`(중립 프로스트), `야채칸`(채소·과일, 그린 틴트),
  `냉동실`(냉동식품, 쿨 블루 틴트). 각 존 라벨 옆에 개수 표시, 임박 순 정렬.
- **아이템 타일**: 카테고리 색 아이콘 칩 + 우상단 상태 도트(신호등) + 이름 + D-day.
  긴급 도트는 맥동. 타일은 flex-wrap 그리드로 선반처럼 좌측 정렬.
- **상호작용**: 탭 → 선택 하이라이트(brand 링) → 하단 액션 시트(소비/폐기/기한 조정).
- **접근성**: 타일에 `aria-label`(이름 + D-day), 선택 `aria-pressed`.
  아이콘 판독이 어려운 사용자를 위해 **목록 보기 토글**을 항상 제공.

---

## 7. 적용 체크리스트

- [ ] 이모지 아이콘 없음(라인 SVG 사용)
- [ ] 소비기한은 색 + 도트 + D-day 텍스트 병기(색 단독 금지)
- [ ] 터치 타깃 ≥ 44px, 클릭 요소 `cursor-pointer`
- [ ] `prefers-reduced-motion` 존중(`.pulse-urgent`/`.press` 정지)
- [ ] 본문 ≥ 16px, 대비 4.5:1
- [ ] 375px 폭에서 가로 스크롤 없음
- [ ] 숫자 데이터에 `.tnum`

---

## 8. 후속 작업

디자인 시스템은 대시보드·재고·레시피·리포트·알림·설정 화면에 적용됨.
아직 이관되지 않은 전체화면 서브플로우(로그인·영수증·냉장고 관리·초대 수락)는
동일 프리미티브(`Button`/`Card`/`Tag`)로 순차 이관 예정 — 정형 이관 작업이라
Sonnet 위임에 적합(§CLAUDE.md 모델 라우팅).
