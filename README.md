# Gut & Grain

A shared, IBD-friendly recipe box for one family. Recipes are tagged with the
illness phase they suit; the patient rates them for taste and tolerance, and
everyone sees the results live on their own device.

Plain HTML/CSS/JS — no framework, no bundler, no `npm install`.

## Running it locally

The app uses native ES modules, which browsers refuse to load over `file://`.
Serve the folder over HTTP instead:

```sh
./serve.sh              # port 8000; PORT=3000 ./serve.sh to change it
```

That is `python3 -m http.server` under the hood — Python standard library, so
there is nothing to install and no virtualenv to activate. There is no build
step either: edit a file, reload the page.

| URL | What you get |
| --- | --- |
| `http://localhost:8000/` | The real Supabase project — **the family's actual data** |
| `http://localhost:8000/?mock` | Local mock data in `localStorage`, no network |
| `http://localhost:8000/tests/` | The test suite |

### Working against mock data

Day-to-day UI work should use `?mock`. It runs the app against
[src/backend/mock.js](src/backend/mock.js) — same contract as the Supabase
adapter, backed by `localStorage` and seeded with eight recipes, three members
and a spread of ratings. No network, no account, and no way to write to the
real recipe box. A badge in the corner shows when it is active.

| URL | |
| --- | --- |
| `?mock` | Start at the sign-in screen. Seeded accounts: `alex@`, `sam@`, `robin@`, `jordan@example.com`, password `password` |
| `?mock&user=alex` | Signed in as Alex — an approved *patient* and the *admin*, with a phase status set |
| `?mock&user=sam` | Signed in as Sam — an approved *member*, so rating is hidden |
| `?mock&user=jordan` | Signed in as Jordan — still *waiting for approval* |
| `?mock&user=nobody` | An account with no profile yet, which lands you in onboarding |
| `?mock&reset` | Wipe and reseed before starting |
| `?mock&latency=800` | Slow every call down, to see the loading states |
| `?mock&fail=connect` | Force the "Couldn't connect" screen |
| `?mock&fail=auth` | Make every sign-in and sign-up fail |
| `?mock&fail=sync` | Make refreshing fail, to see the "may be out of date" notice (switch tabs and back) |

Open two tabs with different `user=` values to watch a rating appear in both
at once — the mock emulates realtime through the `storage` event, the same
behaviour Supabase Realtime gives the deployed app.

**The mock does not exercise row-level security.** It cannot: there are no
policies in `localStorage`. A bug where the UI assumes it may write something
Postgres would reject will not surface locally, so smoke-test against the real
project before shipping anything that changes writes.

### Tests

Open `http://localhost:8000/tests/`. They run in the browser — no Node, no npm,
no test runner to install. Reload to re-run; the tab title carries the result
(`✓ 53/53`).

Covered: the pure logic in [src/lib/recipes.js](src/lib/recipes.js) (filtering,
tag collection, rating maths), the row mappers in
[src/backend/mappers.js](src/backend/mappers.js), and the mock backend's
compliance with the Backend contract. The rendering layer is not covered.

Add a test by creating `tests/whatever.test.js` and importing it from
[tests/index.html](tests/index.html).

## Layout

```
index.html          Markup shell — loads the stylesheets and src/main.js
manifest.webmanifest  Makes "Add to Home Screen" a standalone web app (needed for push)
sw.js               Service worker for the daily check-in push only — caches nothing
serve.sh            Local dev server (python3 stdlib)
icons/
  icon.svg          The bear, round — browser-tab icon and the source of:
  apple-touch-icon.png  180×180 full-square version for the iPhone home screen
                    (sips -s format png -z 180 180 <square svg> --out …)
src/
  main.js           Entry point: first paint, then init()
  boot.js           Lifecycle: connect, sign in, load profile, subscribe
  config.js         Backend credentials, phases, tags, tolerance levels
  state.js          The single mutable `state` object + the #root node
  backend/
    index.js        Picks the adapter: ?mock in the URL, or real Supabase
    supabase.js     The only module that talks to Supabase
    mock.js         localStorage stand-in implementing the same contract
    mappers.js      Postgres rows <-> app objects
    seed.js         Sample data for the mock
  lib/
    dom.js          el() element builder, initials()
    recipes.js      Filtering, tag collection, rating maths, recipes to rate (pure)
    members.js      Approved / admin checks, member lists (pure)
    photos.js       Shrinks a photo in the browser before upload
    shopping.js     Scales and adds up ingredients for the shopping list (pure)
    checkins.js     Days, cooked times, when the daily check-in is due
    push.js         Web push: availability, subscribe, unsubscribe
  ui/
    app.js          render() — rebuilds the view from `state`
    screens.js      Loading / connection-failed / waiting / no-access screens
    auth.js         Sign-in and create-account screen
    header.js       Sticky top bar
    filters.js      Phase dropdown, tag filter dropdown, search
    grid.js         Home shelves (all + per tag), results grid, cards
    modal.js        Overlay shell + which modal is open
    onboarding.js   Name + role form (first run, and "Your details")
    account.js      Account panel behind the avatar: menu + pages
    add-recipe.js   Add-a-recipe form
    photo-picker.js "Add a photo" button (camera or library on phones)
    shopping.js     Shopping list panel: people per recipe, export, clear
    detail.js       Recipe detail, "Cooked" button + rating form
    checkin.js      "How are you today?" — the patient's daily check-in
    reminder.js     Account page (patients): check-in time + notifications
    notifications.js  Account page: recipes waiting for the patient's rating
    members.js      Account page (admins): let people in, decline, remove access
styles/             One stylesheet per concern; tokens.css must load first
tests/
  index.html        Open in a browser to run the suite
  harness.js        ~150-line describe/it/expect runner
  *.test.js         The tests themselves
db/
  schema.sql        Supabase schema. Run once in the SQL Editor.
  reset.sql         Deletes all tables, data and logins, before a fresh schema.sql
  migrate-002-photos.sql  Adds recipe photos to a project set up before them
  migrate-003-shopping.sql  Adds servings and the shared shopping list
  migrate-004-edit-recipes.sql  Lets approved members edit a saved recipe
  migrate-005-delete-recipes.sql  Lets whoever added a recipe, or an admin, delete it
  migrate-006-phase-status.sql  Adds the patient's phase status ("How I'm doing")
  migrate-007-cooking-checkins.sql  Adds "Cooked", the daily check-in and push reminders
docs/
  architecture.md   How the pieces fit together
```

## Backend

Supabase project: `https://akuqozjsbrayrveflksy.supabase.co`, configured in
[src/config.js](src/config.js).

Auth is **email + password**, and an account alone does not get you in:

1. Someone creates an account and enters their name and role.
2. That makes a `pending` member. They see a "waiting for approval" screen and
   no data — the database itself returns nothing to them.
3. An **admin** lets them in (or declines) under **Members & requests** in the
   account panel behind their avatar. The waiting screen switches to the app
   by itself.

Admins can also take access away again later. Everything is enforced by
row-level security and the `set_member_status()` function in
[db/schema.sql](db/schema.sql), not only by the UI.

### Setting up a project

1. **Supabase → Authentication → Sign In / Providers → Email:** enabled, with
   **Confirm email switched off**. The admin approval is the check; Supabase's
   built-in mailer does not deliver to arbitrary addresses on the free plan, so
   confirmation mails would never arrive.
2. **Same page → Anonymous Sign-Ins:** switched **off**. The app no longer uses them.
3. **SQL Editor:** run [db/schema.sql](db/schema.sql). On a project that already
   has the tables, run [db/reset.sql](db/reset.sql) first — it **deletes all
   recipes, ratings, members and logins**. To bring an existing project up to
   date *without* losing data, run the `db/migrate-*.sql` files it is missing
   instead, in order — each is safe to run twice.
4. **The first admin:** create your own account in the app, then run the snippet
   at the end of `schema.sql` with your email. Further admins the same way.

### Quick fill with Gemini (optional)

The "Describe it in your own words" box needs the `structure-recipe` Edge
Function. Without it, everything else works and the box shows an error.

1. Get a free API key at [aistudio.google.com](https://aistudio.google.com) → *Get API key*.
2. Supabase → **Edge Functions → Deploy a new function → Via Editor**, name it
   `structure-recipe`, paste [supabase/functions/structure-recipe/index.ts](supabase/functions/structure-recipe/index.ts), deploy.
3. **Edge Functions → Secrets:** add `GEMINI_API_KEY` with the key.

On Gemini's free tier Google may use the text to improve its models.

### Daily check-in notifications (optional)

The patient's "How are you today?" works without this: once it's past their
reminder time, a dot on the avatar asks. Push notifications additionally need
the `daily-checkin` Edge Function, a cron job, and the app served over
**HTTPS** (localhost only works on the computer itself). On an iPhone they
only arrive when the app was added to the Home Screen and opened from there
(iOS 16.4 or later) — a home-screen icon added before `manifest.webmanifest`
existed has to be removed and added again.

1. `npx web-push generate-vapid-keys` (any computer with Node). Put the
   **public** key into `VAPID_PUBLIC_KEY` in [src/config.js](src/config.js).
2. Deploy [supabase/functions/daily-checkin/index.ts](supabase/functions/daily-checkin/index.ts)
   as `daily-checkin`, with **Verify JWT switched off**.
3. **Edge Functions → Secrets:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (`mailto:` + your address), `CRON_SECRET` (a long random string).
4. **Database → Extensions:** enable `pg_cron` and `pg_net`, then run the
   `cron.schedule(...)` snippet at the end of
   [db/migrate-007-cooking-checkins.sql](db/migrate-007-cooking-checkins.sql)
   with your `CRON_SECRET`.
5. On the patient's phone: account panel → **Daily reminder** → *Turn on
   notifications*. To test without waiting, call the function by hand with
   `{"force": true}` and the `x-cron-secret` header.

"Forgot password" is not built in: it needs a mail provider (custom SMTP in
Supabase). Until then an admin can set a new password for someone under
Authentication → Users.

The key in `config.js` is the **publishable** key and is safe to commit — every
table is protected by row-level security. Never put a service-role key in `src/`.

## Deploying

Static hosting, no configuration: Netlify, Vercel, GitHub Pages, or any web
server. Publish the repository root as-is; `index.html` is already the entry
point and all asset paths are relative.
