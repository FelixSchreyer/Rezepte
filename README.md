# Gut & Grain

Single-file web app (`index.html`) — HTML/CSS/JS, no build step, no dependencies to install.

## Files
- `index.html` — the whole app
- `schema.sql` — Supabase schema (tables, RLS, realtime). Run once in Supabase SQL Editor.

## Backend
Supabase project: `https://akuqozjsbrayrveflksy.supabase.co`
Publishable key: set in `index.html`, top of the `<script>` block (`SUPABASE_URL` / `SUPABASE_KEY`).

Auth: anonymous sign-in (no email/password). Requires "Anonymous Sign-Ins" enabled in
Supabase → Authentication → Sign In / Providers.

## Code structure (inside index.html)
- `Backend` object: all Supabase calls live here (connect, getUid, fetchProfile,
  saveProfile, onMembers/onRecipes/onRatings, addRecipe, upsertRating,
  fetchFilterState/saveFilterState). Nothing else in the file talks to Supabase directly.
- `state` object: all app state.
- `render()` + `render*()` functions: rebuild the DOM from `state`.
- `submit*()` functions: form validation + calls into `Backend`.

## Deploy
Static file, works on Netlify/Vercel/GitHub Pages/any static host.
Must be served as `index.html` (already named).

## Tables
- `members` (id = auth user id, name, role, last_phase)
- `recipes`
- `ratings` (unique per recipe_id + uid)
