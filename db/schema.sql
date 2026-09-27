-- Gut & Grain — Supabase schema
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (On a project that already has these tables, run db/reset.sql first.)
--
-- Access model: people sign up with email + password, which creates a
-- `pending` members row. Nobody sees any data until an admin sets them to
-- `approved`. Every rule below is enforced here in Postgres, not only in the
-- UI. The first admin has to be made by hand — see the end of this file.

-- ---------- members (one row per person, keyed by their auth user id) ----------
create table if not exists public.members (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('member', 'patient')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin boolean not null default false,
  last_phase text,
  joined_at bigint,
  created_at timestamptz not null default now()
);

-- ---------- access helpers ----------
-- `security definer` lets the policies below look up the caller's own
-- members row without the members policies recursing into themselves.
create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members where id = auth.uid() and status = 'approved'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members where id = auth.uid() and status = 'approved' and is_admin
  );
$$;

alter table public.members enable row level security;

create policy "members: approved see everyone, others only themselves"
  on public.members for select
  using (id = auth.uid() or public.is_approved());

-- A new row always starts pending, never admin, and carries the email the
-- person actually signed up with.
create policy "members: insert own pending row only"
  on public.members for insert
  with check (
    id = auth.uid()
    and status = 'pending'
    and not is_admin
    and email = (auth.jwt() ->> 'email')
  );

-- Which columns may be updated is limited by the grants further down
-- (name, role, last_phase) — status and is_admin are not among them.
create policy "members: update own row only"
  on public.members for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- admin: approve / reject / revoke ----------
-- The only way to change anyone's status. Callable by approved admins only,
-- and not on themselves, so the last admin cannot lock everyone out.
create or replace function public.set_member_status(target uuid, new_status text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only admins can change member status' using errcode = '42501';
  end if;
  if target = auth.uid() then
    raise exception 'admins cannot change their own status' using errcode = '42501';
  end if;
  if new_status not in ('approved', 'rejected') then
    raise exception 'invalid status: %', new_status using errcode = '22023';
  end if;
  update public.members set status = new_status where id = target;
end;
$$;

-- ---------- recipes ----------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  phases text[] not null,
  tags text[] not null,
  ingredients text[] not null,
  instructions text default '',
  prep_minutes int,
  added_by uuid references auth.users(id) on delete set null,
  added_by_name text,
  created_at bigint not null
);

alter table public.recipes enable row level security;

create policy "recipes: read by approved members"
  on public.recipes for select
  using (public.is_approved());

create policy "recipes: insert by approved members, as themselves"
  on public.recipes for insert
  with check (public.is_approved() and added_by = auth.uid());

-- ---------- ratings ----------
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  name text not null,
  stars int not null check (stars between 1 and 5),
  tolerance text not null check (tolerance in ('good', 'medium', 'poor')),
  comment text default '',
  created_at bigint not null,
  unique (recipe_id, uid)
);

alter table public.ratings enable row level security;

create policy "ratings: read by approved members"
  on public.ratings for select
  using (public.is_approved());

create policy "ratings: insert own rating, approved members only"
  on public.ratings for insert
  with check (public.is_approved() and uid = auth.uid());

create policy "ratings: update own rating, approved members only"
  on public.ratings for update
  using (public.is_approved() and uid = auth.uid());

-- ---------- table privileges ----------
-- RLS policies above decide *which rows*; these grants decide whether a role
-- may touch a table or column at all. Some Supabase projects grant everything
-- to anon/authenticated by default, others nothing — so start from nothing
-- and grant exactly what the app needs. `anon` (not signed in) gets nothing.
revoke all on public.members, public.recipes, public.ratings from anon, authenticated;

grant usage on schema public to authenticated;
grant select, insert on public.members to authenticated;
grant update (name, role, last_phase) on public.members to authenticated;
grant select, insert on public.recipes to authenticated;
grant select, insert, update on public.ratings to authenticated;

revoke execute on function public.set_member_status(uuid, text) from public, anon;
grant execute on function public.set_member_status(uuid, text) to authenticated;

-- ---------- realtime (so all devices see changes live) ----------
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.recipes;
alter publication supabase_realtime add table public.ratings;

-- ---------- the first admin ----------
-- Register in the app first, then run this once with your own email.
-- Every later admin can be made the same way.
--
--   update public.members
--      set status = 'approved', is_admin = true
--    where email = 'you@example.com';
