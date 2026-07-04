-- S4. 레시피 추천 & 소비 처리 (F4·F5) 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - recipe_cache: (재고 스냅샷 해시 → 추천 결과). 동일 재고 상태면 LLM 재호출(비용) 없이 재사용.
--   스코프는 fridge 단위(공유 냉장고 S5 대비). 재고가 바뀌면 해시가 달라져 자연 무효화된다.
-- - inventory_items.consumed_at: 소비/폐기 확정 시각. 상태 전이(active→consumed|discarded) 기록.
-- - waste_logs: 소비/폐기 이벤트 적재. S6 절약/낭비 리포트의 원천 데이터.
--   금액(est_price)은 영수증 단가가 있으면 채우고, 없으면 NULL(리포트에서 추정 제외).

-- ── 재고에 소비/폐기 확정 시각 추가 ────────────────────────────────────────
alter table inventory_items
  add column if not exists consumed_at timestamptz;

-- ── 레시피 추천 캐시 ───────────────────────────────────────────────────────
create table if not exists recipe_cache (
  id            uuid primary key default gen_random_uuid(),
  fridge_id     uuid not null references fridges (id) on delete cascade,
  snapshot_hash text not null,                 -- 활성 재고 스냅샷 해시(캐시 키)
  recipes       jsonb not null default '[]'::jsonb, -- Recipe[] (추천 결과)
  created_at    timestamptz not null default now()
);
-- 냉장고·스냅샷당 하나(재고 동일 상태면 재사용). 재고 변화 시 새 해시 = 새 행.
create unique index if not exists uq_recipe_cache
  on recipe_cache (fridge_id, snapshot_hash);

-- ── 소비/폐기 로그 (S6 리포트 대비) ────────────────────────────────────────
create table if not exists waste_logs (
  id         uuid primary key default gen_random_uuid(),
  fridge_id  uuid not null references fridges (id) on delete cascade,
  user_id    uuid not null,                    -- 행위자(auth.users.id)
  item_id    uuid,                             -- 원본 inventory_items.id(삭제 대비 nullable)
  name       text not null,
  category   text not null default '기타',
  qty        numeric not null default 1,
  unit       text not null default '개',
  est_price  numeric,                          -- 추정 금액(영수증 단가). 없으면 NULL
  action     text not null,                    -- consumed | discarded
  logged_at  timestamptz not null default now()
);
create index if not exists idx_waste_logs_fridge
  on waste_logs (fridge_id, logged_at desc);

-- ── RLS (소유자 기반; 백엔드 service_role은 우회) ─────────────────────────
alter table recipe_cache enable row level security;
alter table waste_logs   enable row level security;

drop policy if exists p_recipe_cache_owner on recipe_cache;
create policy p_recipe_cache_owner on recipe_cache
  for all using (
    fridge_id in (select id from fridges where owner_user_id = auth.uid())
  ) with check (
    fridge_id in (select id from fridges where owner_user_id = auth.uid())
  );

drop policy if exists p_waste_logs_owner on waste_logs;
create policy p_waste_logs_owner on waste_logs
  for all using (
    fridge_id in (select id from fridges where owner_user_id = auth.uid())
  ) with check (
    fridge_id in (select id from fridges where owner_user_id = auth.uid())
  );
