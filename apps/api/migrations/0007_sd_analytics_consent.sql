-- SD-1 이벤트 트래킹 + SD-2 동의·영수증 파기 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - analytics_events: 개인식별 없이 session_id + type + props만. user_id는 선택(로그인 시 집계용, PII 아님).
-- - user_consent: 동의(data_consent)·영수증 원본 보관(receipt_retain) 토글. 기본은 프라이버시 우선(둘 다 false).
--   onboarded=false면 동의 온보딩을 아직 거치지 않은 것 → 프런트가 온보딩을 노출.
-- - receipt_jobs.purged_at: 원본 파기 배치(SD-2)가 삭제 시각을 기록(멱등·중복 삭제 방지).

-- ── SD-1 이벤트 로그 ────────────────────────────────────────────────────────
create table if not exists analytics_events (
  id          bigint generated always as identity primary key,
  session_id  text not null,                          -- 프런트 익명 세션(로컬 uuid)
  user_id     uuid,                                   -- 로그인 시에만. 개인식별 필드 아님(집계용)
  type        text not null,                          -- receipt_uploaded | item_corrected | ...
  props       jsonb not null default '{}'::jsonb,     -- 타입별 부가 신호(개인정보 금지)
  created_at  timestamptz not null default now()
);
create index if not exists idx_analytics_events_type on analytics_events (type, created_at desc);
create index if not exists idx_analytics_events_created on analytics_events (created_at desc);

-- 수집은 백엔드가 service_role로만 적재. RLS는 방어선(클라이언트 직접 접근 차단).
alter table analytics_events enable row level security;

-- ── SD-2 동의·거버넌스 ──────────────────────────────────────────────────────
create table if not exists user_consent (
  user_id        uuid primary key,                    -- auth.users.id
  data_consent   boolean not null default false,      -- 익명 데이터 개선 사용 동의
  receipt_retain boolean not null default false,      -- 영수증 원본 보관(false면 파기 대상)
  onboarded      boolean not null default false,      -- 동의 온보딩 완료 여부
  updated_at     timestamptz not null default now()
);

alter table user_consent enable row level security;
drop policy if exists p_user_consent_self on user_consent;
create policy p_user_consent_self on user_consent
  for select using (user_id = auth.uid());

-- 영수증 원본 파기 기록(SD-2 배치).
alter table receipt_jobs add column if not exists purged_at timestamptz;
