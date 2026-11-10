-- Gut & Grain — "Cooked" log, the patient's daily check-in and push
-- reminders, on a project that already runs schema.sql from before them.
-- Safe to run more than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (A fresh project gets all of this from schema.sql and does not need it.)
--
-- Together these are the two time series a later analysis needs: what was
-- eaten when (cook_events — "cooked" counts as eaten by the patient), and
-- how the patient was doing on each day (checkins).

-- When the daily check-in reminder goes out, as the patient's local "HH:MM".
-- null = the default, 20:00.
alter table public.members add column if not exists checkin_time text;

grant update (name, role, last_phase, last_phase_at, current_phase, current_phase_at, checkin_time)
  on public.members to authenticated;

-- ---------- cook events: "Cooked" on a recipe ----------
create table if not exists public.cook_events (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  cooked_at bigint not null,
  cooked_by uuid references auth.users(id) on delete set null,
  created_at bigint not null
);

alter table public.cook_events enable row level security;

drop policy if exists "cook events: approved members read" on public.cook_events;
create policy "cook events: approved members read"
  on public.cook_events for select using (public.is_approved());
drop policy if exists "cook events: approved members add, as themselves" on public.cook_events;
create policy "cook events: approved members add, as themselves"
  on public.cook_events for insert with check (public.is_approved() and cooked_by = auth.uid());
drop policy if exists "cook events: change own" on public.cook_events;
create policy "cook events: change own"
  on public.cook_events for update
  using (public.is_approved() and cooked_by = auth.uid())
  with check (public.is_approved() and cooked_by = auth.uid());
drop policy if exists "cook events: remove own" on public.cook_events;
create policy "cook events: remove own"
  on public.cook_events for delete using (public.is_approved() and cooked_by = auth.uid());

revoke all on public.cook_events from anon, authenticated;
grant select, insert, delete on public.cook_events to authenticated;
grant update (cooked_at) on public.cook_events to authenticated;

-- ---------- check-ins: how the patient was doing, one row per day ----------
-- `day` is the patient's local date ("2026-11-10"); `phase` is their phase
-- status at the time, so the phase history is kept alongside.
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  day text not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  state text not null check (state in ('good', 'medium', 'poor')),
  phase text,
  created_at bigint not null,
  unique (uid, day)
);

alter table public.checkins enable row level security;

drop policy if exists "checkins: approved members read" on public.checkins;
create policy "checkins: approved members read"
  on public.checkins for select using (public.is_approved());
drop policy if exists "checkins: insert own" on public.checkins;
create policy "checkins: insert own"
  on public.checkins for insert with check (public.is_approved() and uid = auth.uid());
drop policy if exists "checkins: update own" on public.checkins;
create policy "checkins: update own"
  on public.checkins for update
  using (public.is_approved() and uid = auth.uid())
  with check (public.is_approved() and uid = auth.uid());

revoke all on public.checkins from anon, authenticated;
grant select, insert, update on public.checkins to authenticated;

-- ---------- push subscriptions: one per device that turned reminders on ----------
-- Read by the daily-checkin Edge Function with the service-role key; each
-- person only ever sees their own rows.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  uid uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'Europe/Berlin',
  last_sent_day text,
  created_at bigint not null
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: own rows only" on public.push_subscriptions;
create policy "push: own rows only"
  on public.push_subscriptions for all
  using (uid = auth.uid())
  with check (uid = auth.uid() and public.is_approved());

revoke all on public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Realtime, so a "Cooked" or a check-in shows on every device. The blocks
-- skip a table already in the publication (a second run).
do $$
begin
  alter publication supabase_realtime add table public.cook_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.checkins;
exception when duplicate_object then null;
end $$;

-- ---------- the reminder schedule ----------
-- Push needs the daily-checkin Edge Function (see its file for setup), called
-- every 15 minutes. Enable the pg_cron and pg_net extensions (Dashboard ->
-- Database -> Extensions), then run this once with your CRON_SECRET:
--
--   select cron.schedule('daily-checkin', '*/15 * * * *', $$
--     select net.http_post(
--       url := 'https://akuqozjsbrayrveflksy.supabase.co/functions/v1/daily-checkin',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--       body := '{}'::jsonb
--     );
--   $$);
