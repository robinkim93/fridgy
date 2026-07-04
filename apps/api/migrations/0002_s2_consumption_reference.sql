-- S2. 소비기한 추정 (F2) 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - consumption_reference: 품목/카테고리 → 기본 소비일수 기준표(부트스트랩 시드).
--   name 지정 행 = 정확 품목 규칙, name NULL + category 행 = 카테고리 기본값.
-- - user_overrides: 사용자가 특정 품목의 소비일수를 보정. 있으면 최우선 적용.
-- - 계산: expire_at = purchased_at + (override or item_days or category_days or 전역기본).
--   전역 기본값은 앱단 상수(expiry.GLOBAL_DEFAULT_DAYS)로 둔다.

-- ── 소비기한 기준표(시드) ──────────────────────────────────────────────────
create table if not exists consumption_reference (
  id           uuid primary key default gen_random_uuid(),
  name         text,              -- 정확 품목명(정규화 표준명). NULL이면 카테고리 기본값 행.
  category     text not null,     -- 품목 규칙도 카테고리를 함께 보관(참조·검수용)
  default_days int  not null check (default_days > 0),
  created_at   timestamptz not null default now()
);
-- 품목 규칙은 표준명당 1개, 카테고리 기본값은 카테고리당 1개로 유지.
create unique index if not exists uq_consref_item
  on consumption_reference (name) where name is not null;
create unique index if not exists uq_consref_category
  on consumption_reference (category) where name is null;

-- ── 개인화 오버라이드 ──────────────────────────────────────────────────────
create table if not exists user_overrides (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                 -- auth.users.id
  item_name   text not null,                 -- 정규화 표준명
  custom_days int  not null check (custom_days > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists uq_override_user_item
  on user_overrides (user_id, item_name);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- 기준표는 전체 읽기 전용(시딩·검수는 백엔드 service_role). 오버라이드는 본인만.
alter table consumption_reference enable row level security;
alter table user_overrides        enable row level security;

drop policy if exists p_consref_read on consumption_reference;
create policy p_consref_read on consumption_reference for select using (true);

drop policy if exists p_override_owner on user_overrides;
create policy p_override_owner on user_overrides
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 시드: 카테고리 기본값 ──────────────────────────────────────────────────
insert into consumption_reference (name, category, default_days) values
  (null, '유제품',   7),
  (null, '육류',     3),
  (null, '수산물',   2),
  (null, '채소',     7),
  (null, '과일',     7),
  (null, '냉동식품', 90),
  (null, '가공식품', 14),
  (null, '통조림',   365),
  (null, '음료',     30),
  (null, '기타',     7)
on conflict do nothing;

-- ── 시드: 정확 품목 규칙 ───────────────────────────────────────────────────
insert into consumption_reference (name, category, default_days) values
  ('우유',   '유제품', 7),
  ('두유',   '음료',   14),
  ('요거트', '유제품', 14),
  ('치즈',   '유제품', 30),
  ('버터',   '유제품', 60),
  ('계란',   '기타',   30),
  ('돼지고기','육류',  3),
  ('삼겹살', '육류',   3),
  ('소고기', '육류',   4),
  ('닭고기', '육류',   2),
  ('고등어', '수산물', 2),
  ('오징어', '수산물', 2),
  ('새우',   '수산물', 2),
  ('연어',   '수산물', 2),
  ('김치',   '가공식품', 60),
  ('두부',   '가공식품', 7),
  ('어묵',   '가공식품', 14),
  ('햄',     '가공식품', 14),
  ('소시지', '가공식품', 14),
  ('만두',   '냉동식품', 90),
  ('냉동식품','냉동식품', 90),
  ('시금치', '채소', 4),
  ('상추',   '채소', 5),
  ('양파',   '채소', 30),
  ('대파',   '채소', 14),
  ('파프리카','채소', 10),
  ('당근',   '채소', 21),
  ('감자',   '채소', 30),
  ('고구마', '채소', 21),
  ('오이',   '채소', 7),
  ('애호박', '채소', 7),
  ('토마토', '채소', 7),
  ('버섯',   '채소', 5),
  ('마늘',   '채소', 30),
  ('배추',   '채소', 14),
  ('무',     '채소', 21),
  ('사과',   '과일', 21),
  ('바나나', '과일', 5),
  ('딸기',   '과일', 3),
  ('포도',   '과일', 5),
  ('귤',     '과일', 14),
  ('오렌지', '과일', 21),
  ('참외',   '과일', 7),
  ('수박',   '과일', 7),
  ('참치캔', '통조림', 365),
  ('통조림', '통조림', 365),
  ('생수',   '음료', 365),
  ('주스',   '음료', 14),
  ('콜라',   '음료', 180),
  ('맥주',   '음료', 180)
on conflict do nothing;
