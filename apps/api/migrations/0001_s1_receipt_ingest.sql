-- S1. 영수증 → 재고 등록 (F1) 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - 재고는 개인이 아닌 fridge 단위에 귀속(S5 공유 냉장고 대비). 개인 냉장고 = 멤버 1명인 fridge.
-- - item_aliases: 정규화 학습 사전. scope=user(개인 보정) → scope=global(전역 승격, SD-3).
-- - receipt_jobs: 비동기 OCR·정규화 작업 상태. parsed는 보정 UI 입력용 후보 리스트(JSONB).
-- - RLS는 소유자 기반으로 걸되, 백엔드는 service_role 키로 접근(정책 우회)하며 앱단에서 스코프를 강제한다.

create extension if not exists "pgcrypto";

-- ── 냉장고 ────────────────────────────────────────────────────────────────
create table if not exists fridges (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,                 -- auth.users.id
  name          text not null default '내 냉장고',
  created_at    timestamptz not null default now()
);
create index if not exists idx_fridges_owner on fridges (owner_user_id);

-- ── 재고 품목 ─────────────────────────────────────────────────────────────
create table if not exists inventory_items (
  id           uuid primary key default gen_random_uuid(),
  fridge_id    uuid not null references fridges (id) on delete cascade,
  name         text not null,
  category     text not null default '기타',
  qty          numeric not null default 1,
  unit         text not null default '개',
  purchased_at date not null default current_date,
  expire_at    date,                            -- S2에서 소비기한 기준표로 채움
  source       text not null default 'receipt', -- receipt | manual | voice
  status       text not null default 'active',  -- active | consumed | discarded
  created_at   timestamptz not null default now()
);
create index if not exists idx_inventory_fridge_status on inventory_items (fridge_id, status);
create index if not exists idx_inventory_expire on inventory_items (fridge_id, expire_at)
  where status = 'active';

-- ── 정규화 학습 사전 ──────────────────────────────────────────────────────
create table if not exists item_aliases (
  id              uuid primary key default gen_random_uuid(),
  raw_text        text not null,                -- 정규화 키(소문자·공백정리된 원문)
  normalized_name text not null,
  category        text,
  scope           text not null default 'user', -- user | global
  user_id         uuid,                          -- scope=user일 때 소유자
  hit_count       int  not null default 1,
  promoted_at     timestamptz,                   -- 전역 승격 시각(SD-3)
  created_at      timestamptz not null default now()
);
-- 조회 순서: user 사전 → global 사전. 동일 스코프·키·유저의 중복 매핑은 하나로.
create unique index if not exists uq_alias_user
  on item_aliases (raw_text, user_id) where scope = 'user';
create unique index if not exists uq_alias_global
  on item_aliases (raw_text) where scope = 'global';
create index if not exists idx_alias_lookup on item_aliases (raw_text, scope);

-- ── 영수증 처리 작업 ──────────────────────────────────────────────────────
create table if not exists receipt_jobs (
  id           uuid primary key default gen_random_uuid(),
  fridge_id    uuid not null references fridges (id) on delete cascade,
  user_id      uuid not null,
  image_path   text,                            -- Supabase Storage 경로
  status       text not null default 'processing', -- processing | done | failed
  parsed       jsonb not null default '[]'::jsonb, -- ParsedItem[] (보정 UI 입력)
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_receipt_jobs_user on receipt_jobs (user_id, created_at desc);

-- ── RLS (소유자 기반; 백엔드 service_role은 우회) ─────────────────────────
alter table fridges         enable row level security;
alter table inventory_items enable row level security;
alter table receipt_jobs    enable row level security;
alter table item_aliases    enable row level security;

drop policy if exists p_fridges_owner on fridges;
create policy p_fridges_owner on fridges
  for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists p_inventory_owner on inventory_items;
create policy p_inventory_owner on inventory_items
  for all using (
    fridge_id in (select id from fridges where owner_user_id = auth.uid())
  ) with check (
    fridge_id in (select id from fridges where owner_user_id = auth.uid())
  );

drop policy if exists p_receipt_owner on receipt_jobs;
create policy p_receipt_owner on receipt_jobs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 별칭: 본인 user 스코프만 읽기/쓰기, global은 전체 읽기 전용(승격은 백엔드 배치가 담당).
drop policy if exists p_alias_read on item_aliases;
create policy p_alias_read on item_aliases
  for select using (scope = 'global' or user_id = auth.uid());
drop policy if exists p_alias_write on item_aliases;
create policy p_alias_write on item_aliases
  for all using (scope = 'user' and user_id = auth.uid())
  with check (scope = 'user' and user_id = auth.uid());
