-- Gut & Grain — wipe everything, so db/schema.sql can be run on a clean slate.
--
-- DESTRUCTIVE: deletes every recipe, rating, member AND every login of this
-- Supabase project. There is no undo. Run it in the SQL Editor, then run
-- db/schema.sql.
--
-- Photos are not deleted here: Supabase does not allow deleting storage
-- files with SQL. Empty them in Storage -> recipe-photos (select all ->
-- delete) if you want them gone too. The bucket itself can stay.

drop table if exists public.ratings, public.recipes, public.members cascade;

drop policy if exists "recipe photos: read by approved members" on storage.objects;
drop policy if exists "recipe photos: approved members upload into their own folder" on storage.objects;

drop function if exists public.set_member_status(uuid, text);
drop function if exists public.is_admin();
drop function if exists public.is_approved();

delete from auth.users;
