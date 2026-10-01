-- Gut & Grain — let approved members edit a saved recipe, on a project that
-- already runs schema.sql from before that. Safe to run more than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (A fresh project gets all of this from schema.sql and does not need it.)

-- The update policy (approved members only) already exists; until now the
-- column grant limited it to photo_path. Who added a recipe, and when, stays
-- fixed.
drop policy if exists "recipes: approved members set the photo" on public.recipes;
drop policy if exists "recipes: approved members edit" on public.recipes;
create policy "recipes: approved members edit"
  on public.recipes for update
  using (public.is_approved())
  with check (public.is_approved());

grant update (title, phases, tags, ingredients, instructions, prep_minutes, servings, photo_path)
  on public.recipes to authenticated;
