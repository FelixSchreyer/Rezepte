-- Gut & Grain — add servings and the shared shopping list to a project that
-- already runs schema.sql from before them. Safe to run more than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (A fresh project gets all of this from schema.sql and does not need it.)

-- Existing recipes are assumed to serve 2, the default for new ones.
alter table public.recipes
  add column if not exists servings int not null default 2 check (servings between 1 and 50);

create table if not exists public.shopping_items (
  recipe_id uuid primary key references public.recipes(id) on delete cascade,
  people int not null default 2 check (people between 1 and 50),
  added_by uuid references auth.users(id) on delete set null,
  added_at bigint not null
);

alter table public.shopping_items enable row level security;

drop policy if exists "shopping: approved members read" on public.shopping_items;
create policy "shopping: approved members read"
  on public.shopping_items for select using (public.is_approved());
drop policy if exists "shopping: approved members add" on public.shopping_items;
create policy "shopping: approved members add"
  on public.shopping_items for insert with check (public.is_approved());
drop policy if exists "shopping: approved members change" on public.shopping_items;
create policy "shopping: approved members change"
  on public.shopping_items for update using (public.is_approved()) with check (public.is_approved());
drop policy if exists "shopping: approved members remove" on public.shopping_items;
create policy "shopping: approved members remove"
  on public.shopping_items for delete using (public.is_approved());

revoke all on public.shopping_items from anon, authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;

-- Realtime, so the list updates live on every device. The block skips the
-- step if the table is already in the publication (a second run).
do $$
begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null;
end $$;
