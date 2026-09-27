# Architecture

Gut & Grain is a small client-side app with three layers and one rule between
them: **data flows down, events flow up, and only `render()` touches the DOM
tree wholesale.**

```
  main.js
     │  render()  +  init()
     ▼
  boot.js ──────────────► backend/supabase.js ──► Supabase
     │  mutates state                               (Postgres + Auth + Realtime)
     ▼
  state.js  ◄─── ui/* read from it, mutate it, then call render()
     │
     ▼
  ui/app.js  render()  ──► ui/{header,filters,grid,modal,screens}
                                        └─► ui/{onboarding,add-recipe,detail}
```

## The render model

There is no virtual DOM and no reactivity. `state` is a plain object;
`render()` empties `#root` and rebuilds everything from it. Any handler that
changes something mutates `state` and calls `render()`.

Two escape hatches exist because a full re-render would destroy focus or
caret position mid-typing:

- `renderGridInPlace()` — swaps only `.grid`, used by the search field.
- `renderModalInPlace()` — swaps only `.overlay`, used by form validation and
  the star/tolerance pickers.

Modal draft state (a half-filled add-recipe form) lives on `state.modal`, so
these in-place swaps preserve it.

## The backend boundary

Every module imports `Backend` from `backend/index.js`, which picks an
implementation at load time based on `?mock` in the URL:

```
  ui/*, boot.js  ──►  backend/index.js  ──┬──►  supabase.js  ──►  Supabase
                          (URL switch)     └──►  mock.js      ──►  localStorage
```

Neither side can tell which one it got, which is the payoff for keeping the
contract narrow. `supabase.js` is the only module that imports Supabase or
knows about tables, columns and snake_case. It exposes:

```
connect()                          -> Promise<{ ok }>
getUid()                           -> Promise<string | null>
fetchProfile(uid)                  -> Promise<Object | null>
saveProfile(uid, profile)          -> Promise<void>
onMembers | onRecipes | onRatings  -> unsubscribe();  cb(Array)
addRecipe(data)                    -> Promise<void>
upsertRating(recipeId, uid, data)  -> Promise<void>
fetchFilterState(uid)              -> Promise<Object | null>
saveFilterState(uid, data)         -> Promise<void>
```

Rows are mapped to camelCase app objects on the way out and back to columns on
the way in — see `backend/mappers.js`, which is split out so those conversions
can be unit-tested without a client. No query builder or ORM object escapes
this module, so swapping the backend means rewriting the insides of these
functions and nothing else.

Realtime is deliberately coarse: `liveTable()` re-`SELECT`s the whole table on
any change notification. The dataset is one family's recipe box, so this is
simpler than reconciling individual row deltas and fast enough.

`mock.js` is the proof that the boundary holds — a second implementation of
the same nine methods backed by `localStorage`, used for local development.
It emulates realtime with an in-tab listener list plus the `storage` event for
cross-tab updates. It is *not* a fidelity test of Postgres: it has no
row-level security, so writes the real database would reject succeed against
the mock.

## Startup sequence

1. `main.js` calls `render()` immediately — paints the loading screen.
2. `init()` starts a 12s watchdog that flips `state.slowLoad` for a "taking
   longer than expected" message plus a retry button.
3. `Backend.connect()`; on failure, `state.capsMissing` → "Couldn't connect".
4. `Backend.getUid()` reuses or creates an anonymous session. `null` means
   anonymous sign-ins are disabled on the project → the sign-in-failed screen.
5. `afterSignedIn()` loads the profile and last-used phase filter, then
   subscribes to the three tables (guarded by `subscribed` so a retry does not
   double-subscribe).
6. If there is still no profile, `render()` forces the onboarding modal open
   and it cannot be dismissed.

## Circular imports

`ui/app.js`, the `ui/*` renderers and `boot.js` import each other in cycles —
for example `boot.js → ui/app.js → ui/screens.js → boot.js`. This is safe
because every cycle is closed by an `export function` declaration, which is
hoisted and only *called* after all modules have finished evaluating. Keep it
that way: do not convert these exports to `const fn = () => {}`, which is not
hoisted and would break at load time.

## Styles

CSS is split by concern, one file per area, concatenated in `<link>` order.
`tokens.css` must load first — it defines the custom properties (colour, type,
radius) every other stylesheet consumes, including the dark-scheme overrides.

Theming follows `prefers-color-scheme`, with `[data-theme="light"|"dark"]` on
the root element as an override hook. Nothing sets that attribute yet; it is
there for a future toggle.

## Testing

`tests/` holds a ~150-line browser-based harness (`describe` / `it` / `expect`)
and the suites. There is no runner to install: `tests/index.html` imports the
test files as modules and writes the results into the page and the tab title.

What is covered is the logic that is worth covering and cheap to reach — pure
functions over `state`, the row mappers, and the mock backend's compliance
with the Backend contract. The rendering layer is not tested; it is a large
surface of DOM assembly with little branching, and the cost of testing it
would exceed what it would catch.

Tests run against the same `state` singleton the app uses, so each one resets
it first. If the helpers in `lib/recipes.js` ever take parameters instead of
reading the singleton, these tests get shorter.

## Roles

`member` and `patient` are stored on the member row. Only `patient` sees the
rating form — the app states this in a banner rather than hiding it silently.
This is a UI convention, not a security boundary: the RLS policy in
`db/schema.sql` lets any authenticated user insert their own rating.

Patients also get a bell in the header whose badge counts recipes waiting for
their rating (`pendingRatings()` in `lib/recipes.js`): added by someone else,
created at or after the patient's `joinedAt`, and not yet rated by them.
There is no notifications table — the count is derived from `recipes` and
`ratings`, so it updates live through the existing subscriptions and clears
itself once the rating is saved.
