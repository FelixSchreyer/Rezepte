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
| `?mock` | Work as Alex — a *patient*, so the rating form is visible |
| `?mock&user=sam` | Work as Sam — a *member*, so rating is hidden |
| `?mock&user=nobody` | An unknown identity, which lands you in onboarding |
| `?mock&reset` | Wipe and reseed before starting |
| `?mock&latency=800` | Slow every call down, to see the loading states |
| `?mock&fail=connect` | Force the "Couldn't connect" screen |
| `?mock&fail=auth` | Force the "Couldn't sign you in" screen |

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
serve.sh            Local dev server (python3 stdlib)
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
    recipes.js      Filtering, tag collection, rating maths (pure)
  ui/
    app.js          render() — rebuilds the view from `state`
    screens.js      Loading / connection-failed / sign-in-failed screens
    header.js       Sticky top bar
    filters.js      Phase dropdown, tag chips, search
    grid.js         Recipe grid, cards, empty state
    modal.js        Overlay shell + which modal is open
    onboarding.js   Name + role form
    add-recipe.js   Add-a-recipe form
    detail.js       Recipe detail + rating form
styles/             One stylesheet per concern; tokens.css must load first
tests/
  index.html        Open in a browser to run the suite
  harness.js        ~150-line describe/it/expect runner
  *.test.js         The tests themselves
db/
  schema.sql        Supabase schema. Run once in the SQL Editor.
docs/
  architecture.md   How the pieces fit together
```

## Backend

Supabase project: `https://akuqozjsbrayrveflksy.supabase.co`, configured in
[src/config.js](src/config.js).

Auth is **anonymous sign-in** — no email or password. The browser silently gets
a session on first visit and reuses it afterwards; "signing in", from the
person's point of view, is just the name + role step. This requires *Anonymous
Sign-Ins* to be enabled under Supabase → Authentication → Sign In / Providers.

Before the app will work against a fresh project, run [db/schema.sql](db/schema.sql)
once in the Supabase SQL Editor. It creates the three tables, their row-level
security policies, and enables realtime on all of them.

The key in `config.js` is the **publishable** key and is safe to commit — every
table is protected by row-level security. Never put a service-role key in `src/`.

## Deploying

Static hosting, no configuration: Netlify, Vercel, GitHub Pages, or any web
server. Publish the repository root as-is; `index.html` is already the entry
point and all asset paths are relative.
