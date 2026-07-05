-- S5. 공유 냉장고 (F6) 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - fridges는 S1부터 존재. 여기서 멤버십(fridge_members)·초대(fridge_invites)·변경로그(fridge_activity)를 얹는다.
-- - 개인 냉장고 = owner 1명이 member로도 등록된 fridge. 기존 fridge의 owner를 member로 백필한다.
-- - 권한: owner(초대·멤버관리·삭제) / member(재고 CRUD). 백엔드가 service_role로 앱단 강제, RLS는 방어선.
-- - 초대는 만료형 토큰 링크. 수락 시 fridge_members에 편입.

-- ── 멤버십 ────────────────────────────────────────────────────────────────
create table if not exists fridge_members (
  fridge_id  uuid not null references fridges (id) on delete cascade,
  user_id    uuid not null,                         -- auth.users.id
  role       text not null default 'member',        -- owner | member
  joined_at  timestamptz not null default now(),
  primary key (fridge_id, user_id)
);
create index if not exists idx_fridge_members_user on fridge_members (user_id);

-- 기존 fridge의 owner를 member(role=owner)로 백필(멱등).
insert into fridge_members (fridge_id, user_id, role)
select id, owner_user_id, 'owner' from fridges
on conflict (fridge_id, user_id) do nothing;

-- ── 초대 링크 ─────────────────────────────────────────────────────────────
create table if not exists fridge_invites (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique default encode(gen_random_bytes(24), 'hex'),
  fridge_id    uuid not null references fridges (id) on delete cascade,
  role         text not null default 'member',      -- 수락 시 부여할 역할
  created_by   uuid not null,
  expires_at   timestamptz not null,
  accepted_by  uuid,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_fridge_invites_fridge on fridge_invites (fridge_id, created_at desc);

-- ── 변경 로그 ─────────────────────────────────────────────────────────────
-- 협업 신뢰용. 재고 추가/소비/폐기 + 멤버 참여 등 행위자·시각을 남긴다.
create table if not exists fridge_activity (
  id          uuid primary key default gen_random_uuid(),
  fridge_id   uuid not null references fridges (id) on delete cascade,
  actor_user_id uuid not null,
  action      text not null,                         -- added | consumed | discarded | member_joined | member_removed
  detail      jsonb not null default '{}'::jsonb,    -- {name, qty, unit, count, ...}
  created_at  timestamptz not null default now()
);
create index if not exists idx_fridge_activity_fridge on fridge_activity (fridge_id, created_at desc);

-- ── RLS (방어선; 백엔드는 service_role로 우회하고 앱단에서 스코프 강제) ──────
alter table fridge_members  enable row level security;
alter table fridge_invites  enable row level security;
alter table fridge_activity enable row level security;

-- 멤버는 자신이 속한 냉장고의 멤버십/로그를 조회할 수 있다.
drop policy if exists p_fridge_members_self on fridge_members;
create policy p_fridge_members_self on fridge_members
  for select using (
    user_id = auth.uid()
    or fridge_id in (select fridge_id from fridge_members where user_id = auth.uid())
  );

drop policy if exists p_fridge_activity_member on fridge_activity;
create policy p_fridge_activity_member on fridge_activity
  for select using (
    fridge_id in (select fridge_id from fridge_members where user_id = auth.uid())
  );

drop policy if exists p_fridge_invites_owner on fridge_invites;
create policy p_fridge_invites_owner on fridge_invites
  for select using (
    fridge_id in (
      select fridge_id from fridge_members where user_id = auth.uid() and role = 'owner'
    )
  );

-- 재고 접근을 소유자 → 멤버로 확장(S1 정책 대체).
drop policy if exists p_inventory_owner on inventory_items;
drop policy if exists p_inventory_member on inventory_items;
create policy p_inventory_member on inventory_items
  for all using (
    fridge_id in (select fridge_id from fridge_members where user_id = auth.uid())
  )
  with check (
    fridge_id in (select fridge_id from fridge_members where user_id = auth.uid())
  );
