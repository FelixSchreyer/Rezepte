-- Gut & Grain — Supabase schema
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> Run

-- ---------- members (one row per person, keyed by their auth user id) ----------
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('member', 'patient')),
  last_phase text,
  joined_at bigint,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;

create policy "members: read by any signed-in user"
  on public.members for select
  using (auth.role() = 'authenticated');

create policy "members: insert own row only"
  on public.members for insert
  with check (auth.uid() = id);

create policy "members: update own row only"
  on public.members for update
  using (auth.uid() = id);

-- ---------- recipes ----------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  phases text[] not null,
  tags text[] not null,
  ingredients text[] not null,
  instructions text default '',
  prep_minutes int,
  added_by uuid references auth.users(id),
  added_by_name text,
  created_at bigint not null
);

alter table public.recipes enable row level security;

create policy "recipes: read by any signed-in user"
  on public.recipes for select
  using (auth.role() = 'authenticated');

create policy "recipes: insert by any signed-in user"
  on public.recipes for insert
  with check (auth.role() = 'authenticated');

-- ---------- ratings ----------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  uid uuid not null references auth.users(id),
  name text not null,
  stars int not null check (stars between 1 and 5),
  tolerance text not null check (tolerance in ('good', 'medium', 'poor')),
  comment text default '',
  created_at bigint not null,
  unique (recipe_id, uid)
);

alter table public.ratings enable row level security;

create policy "ratings: read by any signed-in user"
  on public.ratings for select
  using (auth.role() = 'authenticated');

create policy "ratings: insert own rating only"
  on public.ratings for insert
  with check (auth.uid() = uid);

create policy "ratings: update own rating only"
  on public.ratings for update
  using (auth.uid() = uid);

-- ---------- table privileges ----------
-- RLS policies above decide *which rows*; these grants decide whether the
-- role may touch the table at all. Newer Supabase projects no longer grant
-- them automatically, and without them every request fails with
-- "permission denied for table". Only `authenticated` is granted: the app
-- always signs in (anonymously) before its first query.
grant usage on schema public to authenticated;
grant select, insert, update on public.members to authenticated;
grant select, insert         on public.recipes to authenticated;
grant select, insert, update on public.ratings to authenticated;

-- ---------- realtime (so all devices see changes live) ----------
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.recipes;
alter publication supabase_realtime add table public.ratings;
