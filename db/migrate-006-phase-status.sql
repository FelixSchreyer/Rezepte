-- Gut & Grain — the patient's phase status, shared with the family, on a
-- project that already runs schema.sql from before that. Safe to run more
-- than once.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New query -> Run
-- (A fresh project gets all of this from schema.sql and does not need it.)

-- last_phase_at: when this person last picked a phase filter.
-- current_phase(_at): the status a patient sets ("How I'm doing"). Whichever
-- of the two is newer decides each person's filter — see docs/architecture.md.
alter table public.members
  add column if not exists last_phase_at bigint,
  add column if not exists current_phase text,
  add column if not exists current_phase_at bigint;

grant update (name, role, last_phase, last_phase_at, current_phase, current_phase_at)
  on public.members to authenticated;
