# Fridgy

냉장고 식재료 유통기한 관리 + 임박 재료 레시피 추천 PWA. 운영비 $0 지향.

기획·설계는 [CLAUDE.md](CLAUDE.md) 및 `01`~`05` 문서 참조.

## 모노레포 구조

```
fridge_guardian/
├─ apps/web/         # React + Vite PWA  → Cloudflare Pages
├─ apps/api/         # FastAPI            → Fly.io
├─ packages/shared/  # 공용 도메인 타입 (web ↔ api 계약)
└─ .github/workflows/  # CI + 임박 알림 cron
```

## 로컬 개발

### 사전 준비
- Node 20+, Python 3.12+
- `apps/web/.env.example` → `.env`, `apps/api/.env.example` → `.env` 복사 후 값 채우기

### 프런트 (web)
```bash
npm install          # 루트에서 (workspaces)
npm run dev:web      # http://localhost:5173
```

### 백엔드 (api)
```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload   # http://localhost:8000
curl localhost:8000/health      # {"status":"ok",...}
```

## 배포
- **web**: Cloudflare Pages (빌드 `npm run build:web`, 출력 `apps/web/dist`)
- **api**: Fly.io (`cd apps/api && fly launch` → `fly deploy`), 시크릿은 `fly secrets set`
- **cron**: GitHub Actions `notify.yml` — repo secrets에 `API_BASE`, `INTERNAL_TOKEN` 등록

## 스택
React+TS+Vite(PWA) · FastAPI · Supabase(DB/Auth/Storage) · NVIDIA NIM(AI) · Polar(결제)
