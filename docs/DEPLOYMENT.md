# 운영 환경 배포 가이드

Fridgy 운영 배포 런북. **운영비용 $0 지향**으로 전부 무료 티어를 사용한다.

```
[Cloudflare Pages]  ── PWA 프런트(React/Vite)
        │  VITE_API_BASE
        ▼
[Fly.io]  ── FastAPI 백엔드  ──►  [Supabase] DB · Auth(Google) · Storage(receipts)
   ▲                          └─►  [NVIDIA NIM] OCR · 레시피 LLM
   │ X-Internal-Token
[GitHub Actions cron]  ── 일 배치: 임박 알림 · 영수증 파기
```

> 로컬 개발은 [LOCAL_DEV.md](LOCAL_DEV.md) 참고.

---

## 0. 외부 계정 (모두 무료 티어)

| 서비스 | 용도 |
|---|---|
| **Supabase** | Postgres DB · Auth(Google OAuth) · Storage(영수증 원본) |
| **NVIDIA NIM** | 영수증 OCR(vision) · 정규화/레시피 LLM |
| **Fly.io** | FastAPI 백엔드 호스팅 (Tokyo `nrt`) |
| **Cloudflare Pages** | PWA 프런트 호스팅 |
| **GitHub** | Actions cron (임박 알림 · 영수증 파기) |
| ~~Polar~~ | 결제(MoR) — PMF 이후 SB 단계, 지금 불필요 |

**진행 순서**: Supabase → NIM → 시크릿 생성 → Fly 배포 → Pages 배포 → GitHub cron → 스모크 검증.
(도메인이 서로를 참조하므로 값이 확정되는 대로 채운다.)

---

## 1. Supabase

1. 프로젝트 생성 — Region **Northeast Asia (Tokyo)** 권장(국내 지연 최소).
2. **DB 마이그레이션**: SQL Editor에서 `apps/api/migrations/`를 **번호 순서대로** 실행.

   | 파일 | 내용 |
   |---|---|
   | `0001_s1_receipt_ingest.sql` | 영수증 작업·재고·별칭 |
   | `0002_s2_consumption_reference.sql` | 소비기한 기준표·오버라이드 |
   | `0003_s3_push_notifications.sql` | 웹푸시 구독·알림함 |
   | `0004_s4_recipe_consume.sql` | 레시피 캐시·소비/폐기·waste_logs |
   | `0005_s5_shared_fridge.sql` | 공유 냉장고 멤버십·초대·활동로그 |
   | `0006_s7_shared_recipes.sql` | 공유 레시피 스냅샷(공개 URL) |
   | `0007_sd_analytics_consent.sql` | 이벤트 로그·동의·영수증 파기 |

3. **Storage**: `receipts` 이름의 **비공개(Private) 버킷** 생성.
   - SD-2 파기 배치가 이 버킷의 객체를 삭제한다.
4. **Auth → Providers → Google 연결** — 아래 절차/필드 그대로.

   **(a) Google Cloud Console에서 OAuth 클라이언트 생성**
   - 사용자 인증 정보 → **OAuth 클라이언트 ID 만들기** → 유형 **웹 애플리케이션**.
   - OAuth 동의 화면 구성(앱 이름·지원 이메일·개인정보처리방침 URL). 운영은 **게시(Production)** 상태로 전환.
   - **승인된 리디렉션 URI** = Supabase의 **Callback URL (for OAuth)** `https://<project-ref>.supabase.co/auth/v1/callback` **하나만**.
   - 발급된 **Client ID / Client Secret** 복사.

   **(b) Supabase → Authentication → Providers → Google** 필드 매핑

   | Supabase 필드 | 채우는 값 |
   |---|---|
   | **Client ID** | Google 발급 Client ID |
   | **Client Secret** | Google 발급 Client Secret |
   | **Callback URL (for OAuth)** | Supabase 제공(읽기 전용) → **복사해 (a) Google 리디렉션 URI에 등록** |
   | **Skip nonce checks** | 웹 로그인은 **OFF** |

   → Enable ON → Save.

   **(c) Supabase → Authentication → URL Configuration**
   - **Site URL** = Cloudflare Pages 운영 도메인.
   - **Redirect URLs** = 운영 도메인(예: `https://<pages-도메인>/**`). 로그인은 `redirectTo: window.location.origin`이라 이 allowlist에 있어야 복귀.
   - **프리뷰 배포**(Pages 브랜치 URL)에서 로그인하려면 해당 프리뷰 도메인도 Redirect URLs에 추가.

   **방향 요약**: Callback URL은 *Supabase→Google*, Client ID/Secret은 *Google→Supabase*, 앱 복귀 도메인은 *Supabase Redirect URLs*에만(Google 아님).
5. **키 수집** (Settings → API / JWT): `SUPABASE_URL`, `anon key`, `service_role key`, `JWT secret`.

---

## 2. NVIDIA NIM

- API 키 발급 → `NIM_API_KEY`.
- 무료 티어에서 가용한 모델명 확인 후 필요 시 override:
  - `NIM_OCR_MODEL` (기본 `meta/llama-3.2-90b-vision-instruct`)
  - `NIM_LLM_MODEL` (기본 `nvidia/llama-3.1-nemotron-70b-instruct`)
- 비용 가드: OCR 2차 정규화·레시피는 캐시/1차 실패분에만 호출(코드에 반영됨).

---

## 3. 직접 생성하는 시크릿 2종

```bash
# 웹푸시 VAPID 키 (S3 임박 알림)
pip install py-vapid
vapid --gen           # Public/Private 키 출력 → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY

# 내부 배치 보호 토큰 (cron 인증)
openssl rand -hex 32  # → INTERNAL_TOKEN
```

---

## 4. 백엔드 배포 (Fly.io)

```bash
brew install flyctl && fly auth login
cd apps/api
fly launch --no-deploy      # app=fridgy-api, region=nrt (fly.toml 이미 설정됨)
```

**시크릿 등록** (프런트 도메인 확정 후 실제 값으로):

```bash
fly secrets set \
  SERVICE_NAME=fridgy-api VERSION=1.0.0 \
  CORS_ORIGINS="https://<pages-도메인>" \
  SUPABASE_URL="https://xxxx.supabase.co" \
  SUPABASE_ANON_KEY="..." \
  SUPABASE_SERVICE_ROLE_KEY="..." \
  SUPABASE_JWT_SECRET="..." \
  NIM_API_KEY="..." \
  NIM_BASE_URL="https://integrate.api.nvidia.com/v1" \
  NIM_OCR_MODEL="meta/llama-3.2-90b-vision-instruct" \
  NIM_LLM_MODEL="nvidia/llama-3.1-nemotron-70b-instruct" \
  RECEIPTS_BUCKET="receipts" \
  INTERNAL_TOKEN="<3번 값>" \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:hello@fridgy.app" \
  PUBLIC_BASE_URL="https://fridgy-api.fly.dev" \
  WEB_BASE_URL="https://<pages-도메인>" \
  OG_IMAGE_URL="https://<pages-도메인>/og-recipe.png"

fly deploy
```

**환경변수 레퍼런스 (백엔드 전체)**

| 키 | 설명 |
|---|---|
| `CORS_ORIGINS` | 허용 오리진(프런트 도메인). 콤마 구분 |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | Supabase 접속 |
| `SUPABASE_SERVICE_ROLE_KEY` | 백엔드 DB/Storage(RLS 우회, 앱단 스코프 강제) |
| `SUPABASE_JWT_SECRET` | Auth JWT 서명 검증 |
| `NIM_API_KEY` / `NIM_BASE_URL` / `NIM_OCR_MODEL` / `NIM_LLM_MODEL` | NIM 추론 |
| `RECEIPTS_BUCKET` | 영수증 버킷명(`receipts`) |
| `INTERNAL_TOKEN` | 내부 배치 엔드포인트 보호 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | 웹푸시 |
| `PUBLIC_BASE_URL` | **API 공개 URL** — 공유 링크·og:url·sitemap 기준 |
| `WEB_BASE_URL` | **프런트 URL** — 공유 페이지의 "앱 열기" CTA |
| `OG_IMAGE_URL` | OG 미리보기 이미지(프런트 `/og-recipe.png`) |
| `EXPIRY_THRESHOLD_DAYS` | (선택) 임박 판정 임계일, 기본 3 |

주의사항:
- **포트**: Dockerfile·fly.toml 모두 `8080`으로 일치, `/health` 헬스체크 설정됨.
- **PyMuPDF(F8)**: manylinux wheel이라 `python:3.12-slim`에서 시스템 의존성 없이 설치됨(별도 조치 불필요).
- **PUBLIC vs WEB URL 혼동 금지**: 바뀌면 공유 미리보기·SEO가 어긋난다.
- `auto_stop_machines`로 무사용 시 정지($0). 첫 요청은 콜드스타트 지연이 있을 수 있다.

---

## 5. 프런트 배포 (Cloudflare Pages)

- Git 저장소 연동 → 빌드 설정:
  - **Build command**: `npm run build:web`
  - **Build output directory**: `apps/web/dist`
  - **Node version**: 20
- **환경변수** (VITE_ 접두사만 클라이언트에 노출):

  | 키 | 값 |
  |---|---|
  | `VITE_API_BASE` | `https://fridgy-api.fly.dev` |
  | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
  | `VITE_SUPABASE_ANON_KEY` | `...` |

  > 웹푸시 공개키는 런타임에 `GET /push/public-key`로 받으므로 프런트 env에 VAPID 불필요.

- **정적 자산**: `apps/web/public/og-recipe.png`가 빌드에 자동 포함 → `OG_IMAGE_URL`이 이를 가리킴.
- **SPA 폴백**: 앱 라우팅·초대 링크(`?invite=`)가 SPA이므로 404 → `/index.html` 리라이트 설정.
  - 공유 레시피 `/r/{slug}`는 **API(Fly)가 서버렌더**하므로 Pages 라우팅과 무관.

---

## 6. GitHub Actions cron (일 배치)

- Repo → Settings → Secrets and variables → Actions:

  | 시크릿 | 값 |
  |---|---|
  | `API_BASE` | `https://fridgy-api.fly.dev` |
  | `INTERNAL_TOKEN` | 4번에서 Fly에 넣은 값과 **동일** |

- [.github/workflows/notify.yml](../.github/workflows/notify.yml)이 매일 **00:00 UTC(09:00 KST)** 실행:
  1. `POST /internal/notify-expiring` — 임박 알림(인앱 + 웹푸시)
  2. `POST /internal/purge-receipts` — 보관 미동의 영수증 원본 파기
- 최초 배포 후 **Actions → workflow_dispatch로 수동 1회** 실행해 인증·동작 검증.

---

## 7. 배포 후 스모크 체크리스트

- [ ] `GET https://fridgy-api.fly.dev/health` → `{"status":"ok"}`
- [ ] 프런트 접속 → Google 로그인 → **동의 온보딩** 노출·저장
- [ ] 영수증 **이미지** 업로드 → 폴링 → 보정 → 재고 등록
- [ ] 영수증 **PDF** 업로드(F8) → 페이지 병합 OCR
- [ ] 임박 재료 알림: `notify-expiring` 수동 실행 → 인앱 알림 + 웹푸시 수신
- [ ] 레시피 추천 → "🔗 공유" → `/r/{slug}` 열람
- [ ] 공유 미리보기: 카카오톡/트위터/Facebook 디버거로 OG 카드(제목·이미지·설명) 확인
- [ ] `GET /sitemap.xml`, `GET /robots.txt` 정상 응답
- [ ] 동의 ON → Supabase `analytics_events`에 이벤트 적재 / 동의 OFF → 미적재
- [ ] `purge-receipts` 수동 실행 → 미동의 영수증 `purged_at` 기록 + Storage 객체 삭제

---

## 8. 릴리스 절차 (요약)

1. `dev`에서 검증 완료 → `main`으로 머지(명시적 승인 하에서만; `protect-main` hook 우회 필요).
2. Fly: `cd apps/api && fly deploy`.
3. Pages: `main`(또는 지정 브랜치) push 시 자동 빌드/배포.
4. 스키마 변경이 있으면 **배포 전** 해당 마이그레이션을 Supabase에 먼저 적용.
5. 배포 후 §7 스모크 체크리스트 수행.

---

## 9. 트러블슈팅

| 증상 | 원인 / 해결 |
|---|---|
| 전 API 401 | `SUPABASE_JWT_SECRET` 불일치 |
| 로그인 리다이렉트 실패 | **Supabase** URL Configuration → Redirect URLs에 Pages 도메인 미등록(Google 콘솔 아님). 프리뷰 도메인도 별도 등록 필요 |
| CORS 차단 | `CORS_ORIGINS`에 정확한 프런트 오리진(스킴 포함) 필요 |
| 공유 미리보기 안 뜸 | `OG_IMAGE_URL` 접근 불가 / `PUBLIC_BASE_URL` 오설정 / 크롤러 캐시 → 디버거로 재수집 |
| cron 401 | GitHub `INTERNAL_TOKEN` ≠ Fly `INTERNAL_TOKEN` |
| 영수증 원본이 안 지워짐 | 사용자 `receipt_retain=true`(보관 동의) 또는 이미 `purged_at` 존재 |
| 업로드 500 | `NIM_API_KEY` 미설정 / 무료 티어 모델명 불일치 |
| 첫 요청 지연 | Fly `auto_stop_machines` 콜드스타트(정상) |
