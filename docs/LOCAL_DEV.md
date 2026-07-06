# 로컬 개발 환경 기동 가이드

Fridgy를 로컬에서 운영과 동일한 구성으로 띄우는 절차. 백엔드(FastAPI) + 프런트(React/Vite PWA)
+ 외부 연동(Supabase / NVIDIA NIM)으로 구성된다.

> 운영 배포는 [DEPLOYMENT.md](DEPLOYMENT.md) 참고.

---

## 0. 사전 준비

| 항목 | 요구 | 비고 |
|---|---|---|
| Node | ≥ 20 | 프런트·모노레포 워크스페이스 |
| Python | 3.12 (운영 동일) | 3.14도 동작하나 CI는 3.12 |
| Supabase 프로젝트 | 필수 | DB·Auth·Storage. 로컬도 원격 프로젝트를 사용 |
| NVIDIA NIM API 키 | OCR/레시피 사용 시 | 없으면 업로드 파이프라인이 500 |

로컬 전용 최소 세팅은 Supabase만 있어도 로그인·재고 CRUD까지 확인 가능하다.
OCR(영수증)·레시피 추천은 NIM 키가 있어야 실제 동작한다.

---

## 1. Supabase 준비 (로컬도 원격 프로젝트 사용)

1. Supabase 프로젝트 생성 (Region 무관, 운영은 Tokyo 권장).
2. **마이그레이션 적용**: SQL Editor에서 `apps/api/migrations/`의 파일을 **번호 순서대로** 실행.
   `0001 → 0002 → 0003 → 0004 → 0005 → 0006 → 0007`
3. **Storage 버킷**: `receipts` 이름의 **비공개(Private)** 버킷 생성.
4. **Auth → Google Provider 연결** — 아래 절차/필드 그대로.

   **(a) Google Cloud Console에서 OAuth 클라이언트 생성**
   - API 및 서비스 → 사용자 인증 정보 → **OAuth 클라이언트 ID 만들기** → 유형 **웹 애플리케이션**.
   - (최초 1회) OAuth 동의 화면 구성 필요(앱 이름·지원 이메일; 테스트 중이면 테스트 사용자에 본인 추가).
   - **승인된 리디렉션 URI** 칸에 → Supabase가 준 **Callback URL (for OAuth)** 값을 붙여넣기:
     `https://<project-ref>.supabase.co/auth/v1/callback` **하나만**. (localhost는 여기 넣지 않음)
   - 생성되면 **Client ID / Client Secret** 을 복사해 둔다.

   **(b) Supabase → Authentication → Providers → Google** 화면 필드 매핑

   | Supabase 필드 | 채우는 값 |
   |---|---|
   | **Client ID** | Google에서 발급한 Client ID 붙여넣기 |
   | **Client Secret** | Google에서 발급한 Client Secret 붙여넣기 |
   | **Callback URL (for OAuth)** | Supabase가 주는 읽기 전용 값 → **이걸 복사해 (a)의 Google 리디렉션 URI에 등록** |
   | **Skip nonce checks** | 웹 로그인에선 **끈 채로 둠**(네이티브 idToken 전용 옵션) |

   → Enable 토글 ON 후 Save.

   **(c) Supabase → Authentication → URL Configuration** (로그인 후 복귀 주소 allowlist)
   - **Site URL / Redirect URLs** 에 `http://localhost:5173` (또는 `http://localhost:5173/**`) 추가.

   **방향 요약 (헷갈림 방지)**
   - **Callback URL: Supabase → Google** (Supabase가 주고, Google에 등록).
   - **Client ID/Secret: Google → Supabase** (Google이 주고, Supabase에 등록).
   - **앱 복귀 주소(localhost): Supabase Redirect URLs** 에만 (Google 아님).
   - 로그인은 `signInWithOAuth({ redirectTo: window.location.origin })`([LoginScreen.tsx](../apps/web/src/features/auth/LoginScreen.tsx))
     이라 로컬 origin `http://localhost:5173`이 Redirect URLs에 있어야 복귀한다.
   - 형식: 스킴 `http://`(슬래시 2개) 필수, 포트 **정확히 `5173`**(`vite.config.ts` `server.port`).
     `5137`·`http:localhost`면 매칭 실패 → Site URL로 폴백. `http://localhost`(TLS 없음)는 정상 허용.
5. **키 수집** (Settings → API, Settings → API → JWT):
   - Project URL, `anon` key, `service_role` key, JWT secret

---

## 2. 백엔드 (apps/api)

```bash
cd apps/api
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt   # pymupdf 포함(F8 PDF 렌더)
cp .env.example .env
```

`.env` 채우기 (핵심):

```dotenv
CORS_ORIGINS=http://localhost:5173

SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_JWT_SECRET=...

NIM_API_KEY=...                 # 없으면 OCR/레시피만 비활성, 나머지는 동작
NIM_BASE_URL=https://integrate.api.nvidia.com/v1

RECEIPTS_BUCKET=receipts
INTERNAL_TOKEN=dev-internal-token   # 내부 배치 수동 호출용(아무 값)

# 공유 URL(F9) — 로컬 기본값
PUBLIC_BASE_URL=http://localhost:8000
WEB_BASE_URL=http://localhost:5173
OG_IMAGE_URL=http://localhost:5173/og-recipe.png
```

> `VAPID_*`는 웹푸시(S3)를 로컬에서 시험할 때만 필요. 생략 시 알림 발송만 비활성.

기동 (레포 루트에서):

```bash
npm run dev:api        # = cd apps/api && .venv/bin/uvicorn app.main:app --reload  → http://localhost:8000
```

> 이 스크립트는 **`apps/api/.venv`** 의 uvicorn을 직접 실행한다(위 §2에서 만든 venv 필수).
> venv를 활성화한 상태라면 `cd apps/api && uvicorn app.main:app --reload` 로 직접 실행해도 된다:
> ```bash
> cd apps/api && source .venv/bin/activate && uvicorn app.main:app --reload
> ```
> `uvicorn: command not found` 는 venv 미활성 + 전역 미설치 상태다.

확인: <http://localhost:8000/health> → `{"status":"ok", ...}`

---

## 3. 프런트 (apps/web)

```bash
# 레포 루트
npm install                              # 워크스페이스 전체 설치
cp apps/web/.env.example apps/web/.env
```

`apps/web/.env`:

```dotenv
VITE_API_BASE=http://localhost:8000
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

기동:

```bash
npm run dev:web         # vite → http://localhost:5173
```

> `@fridgy/shared`는 **빌드가 필요 없는 소스 전용 패키지**다(`main`이 `src/index.ts`를 직접 가리킴).
> Vite가 TS 소스를 그대로 트랜스파일하므로 별도 build 단계가 없다. 타입만 확인하려면
> `npm run typecheck -w packages/shared`.

---

## 4. 동작 스모크 (로컬)

1. `http://localhost:5173` → Google 로그인
2. 최초 로그인 시 **동의 온보딩** 노출 → 동의/거절 (설정 ⚙️ 에서 변경 가능)
3. 영수증 **이미지** 업로드(또는 드래그&드롭) → 폴링 → 보정 → 재고 등록 *(NIM 필요)*
4. 영수증 **PDF** 업로드 → 페이지 병합 OCR *(NIM 필요)*
5. 레시피 추천 → "🔗 공유" → `http://localhost:8000/r/{slug}` 페이지 확인
6. 설정에서 데이터 동의 ON → Supabase `analytics_events` 테이블에 이벤트 적재 확인

---

## 5. 내부 배치 수동 호출 (cron 대체)

로컬엔 스케줄러가 없으므로 필요 시 직접 호출한다.

```bash
# 임박 알림 배치 (S3)
curl -X POST http://localhost:8000/internal/notify-expiring \
  -H "X-Internal-Token: dev-internal-token"

# 영수증 원본 파기 배치 (SD-2)
curl -X POST http://localhost:8000/internal/purge-receipts \
  -H "X-Internal-Token: dev-internal-token"
```

---

## 6. 테스트

```bash
cd apps/api && ./.venv/bin/python -m pytest -q     # 백엔드 유닛/라우터 테스트
npm run build:web                                  # 프런트 타입체크 + 번들
```

---

## 7. 자주 겪는 이슈

| 증상 | 원인 / 해결 |
|---|---|
| `/me` 등 401 | `SUPABASE_JWT_SECRET` 불일치. Supabase JWT secret 재확인 |
| 로그인 후 리다이렉트 실패 | **Supabase** URL Configuration → Redirect URLs에 `http://localhost:5173` 미등록(또는 포트 오타 `5137`). Google 콘솔이 아니라 Supabase 쪽임 |
| 영수증 업로드 500 | `NIM_API_KEY` 미설정 또는 무료 티어 모델명 불일치 |
| 업로드 403(냉장고) | 공유 냉장고 멤버십 스코프 — 개인 냉장고는 자동 생성됨. 토큰/유저 확인 |
| CORS 에러 | `CORS_ORIGINS`에 프런트 오리진(`http://localhost:5173`) 포함 여부 |
| PDF 업로드 실패 | `pip install -r requirements.txt` 재실행(pymupdf 설치 여부) |
| `uvicorn: command not found` | venv 미활성 + 전역 미설치. `apps/api/.venv` 생성 후 `npm run dev:api`(venv uvicorn 사용) 또는 `source .venv/bin/activate` |
