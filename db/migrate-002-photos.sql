-- Gut & Grain — add recipe photos to a project that already runs schema.sql
-- from before photos existed. Safe to run more than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (A fresh project gets all of this from schema.sql and does not need it.)

alter table public.recipes add column if not exists photo_path text;

drop policy if exists "recipes: approved members set the photo" on public.recipes;
create policy "recipes: approved members set the photo"
  on public.recipes for update
  using (public.is_approved())
  with check (public.is_approved());

grant update (photo_path) on public.recipes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "recipe photos: read by approved members" on storage.objects;
create policy "recipe photos: read by approved members"
  on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and public.is_approved());

drop policy if exists "recipe photos: approved members upload into their own folder" on storage.objects;
create policy "recipe photos: approved members upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and public.is_approved()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
