-- S3. 임박 알림 (F3) 스키마
-- 대상: Supabase Postgres. `supabase db push` 또는 SQL 에디터로 적용.
--
-- 설계 메모
-- - push_subscriptions: 브라우저 Web Push 구독(endpoint + 키). 유저당 여러 기기 가능.
-- - notifications: 인앱 알림함. 푸시가 도달 못하는 환경(iOS 미설치 등) 대비 병행.
-- - inventory_items.notified_at: 임박 알림 발송일. cron 반복 실행 시 하루 1회로 중복 발송 방지.
-- - 발송 배치는 백엔드 service_role로 접근(RLS 우회), 조회는 fridge 소유자 기준으로 그룹핑.

-- ── 재고에 알림 발송일 추가(중복 발송 가드) ────────────────────────────────
alter table inventory_items
  add column if not exists notified_at date;

-- ── Web Push 구독 ──────────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,                 -- auth.users.id
  endpoint   text not null,                 -- 푸시 서비스 엔드포인트(고유)
  p256dh     text not null,                 -- 구독 공개키
  auth       text not null,                 -- 구독 인증 시크릿
  created_at timestamptz not null default now()
);
-- 동일 엔드포인트는 유저당 하나로 유지(재구독 시 upsert).
create unique index if not exists uq_push_endpoint on push_subscriptions (endpoint);
create index if not exists idx_push_user on push_subscriptions (user_id);

-- ── 인앱 알림함 ────────────────────────────────────────────────────────────
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  type       text not null default 'expiring', -- expiring | ...
  title      text not null,
  body       text not null,
  item_ids   jsonb not null default '[]'::jsonb, -- 관련 inventory_items id
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user
  on notifications (user_id, created_at desc);

-- ── RLS (소유자 기반; 백엔드 service_role은 우회) ─────────────────────────
alter table push_subscriptions enable row level security;
alter table notifications      enable row level security;

drop policy if exists p_push_owner on push_subscriptions;
create policy p_push_owner on push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_notif_owner on notifications;
create policy p_notif_owner on notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
