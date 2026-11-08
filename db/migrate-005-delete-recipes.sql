-- Gut & Grain — let a recipe be deleted, by whoever added it or an admin, on
-- a project that already runs schema.sql from before that. Safe to run more
-- than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (A fresh project gets all of this from schema.sql and does not need it.)

-- Its ratings and shopping-list entry go with it (on delete cascade).
drop policy if exists "recipes: deleted by whoever added it, or an admin" on public.recipes;
create policy "recipes: deleted by whoever added it, or an admin"
  on public.recipes for delete
  using (public.is_approved() and (added_by = auth.uid() or public.is_admin()));

grant delete on public.recipes to authenticated;

-- The app removes a deleted recipe's photo afterwards. A photo may have been
-- uploaded by someone else (anyone can change a recipe's photo), so this
-- isn't tied to the uploader's folder: any approved member may delete a
-- photo that no recipe uses any more — and only such a photo.
drop policy if exists "recipe photos: approved members delete unused ones" on storage.objects;
create policy "recipe photos: approved members delete unused ones"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'recipe-photos'
    and public.is_approved()
    and not exists (select 1 from public.recipes r where r.photo_path = storage.objects.name)
  );
