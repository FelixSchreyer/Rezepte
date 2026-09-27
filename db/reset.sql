-- Gut & Grain — wipe everything, so db/schema.sql can be run on a clean slate.
--
-- DESTRUCTIVE: deletes every recipe, rating, member AND every login of this
-- Supabase project. There is no undo. Run it in the SQL Editor, then run
-- db/schema.sql.

drop table if exists public.ratings, public.recipes, public.members cascade;

drop function if exists public.set_member_status(uuid, text);
drop function if exists public.is_admin();
drop function if exists public.is_approved();

delete from auth.users;
