-- S7. 레시피 공유 URL (F9) 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - 생성 레시피를 공개 웹페이지로 공유(SEO 유입 채널). FastAPI가 /r/{slug}를 서버렌더 HTML로 제공.
-- - slug는 짧은 랜덤 토큰(URL). recipe 원본은 jsonb로 스냅샷(공유 시점 고정 — 이후 재고 변화와 무관).
-- - 공개 조회는 무인증. 백엔드가 service_role로 slug 단건을 읽어 렌더한다(RLS는 방어선).

create table if not exists shared_recipes (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique default encode(gen_random_bytes(6), 'hex'),  -- URL-safe 12자 hex
  title       text not null,
  recipe      jsonb not null,                        -- {title, usedIngredients, expiringUsed, missing, steps}
  created_by  uuid not null,                         -- auth.users.id (공유한 사용자)
  fridge_id   uuid references fridges (id) on delete set null,
  view_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_shared_recipes_created on shared_recipes (created_at desc);

-- RLS(방어선; 공개 렌더는 백엔드가 service_role로 우회).
alter table shared_recipes enable row level security;

-- 공유한 본인은 자신의 공유 레시피를 조회할 수 있다.
drop policy if exists p_shared_recipes_owner on shared_recipes;
create policy p_shared_recipes_owner on shared_recipes
  for select using (created_by = auth.uid());
