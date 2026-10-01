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

- `renderGridInPlace()` — swaps only `.recipes` (shelves or results grid), used by the search field.
- `renderModalInPlace()` — swaps only `.overlay`, used by form validation and
  the star/tolerance pickers.

Modal draft state (a half-filled add-recipe form) lives on `state.modal`, so
these in-place swaps preserve it.

## Back navigation

`ui/navigation.js` gives the panels a "back": an account sub-page steps up to
the account menu, any other panel closes to the recipes. First-run
onboarding has no back.

Two ways reach it. `render()` ends with `syncHistory()`, which keeps one
browser-history entry per level of depth, so Safari's edge swipe, Android's
back button and the desktop back button step back through panels instead of
leaving the app (a `popstate` calls `goBack()`). And every sliding panel
listens for a swipe to the right, because the iOS home-screen web app has
no back gesture of its own; in the browser the left 24px are left to
Safari's gesture so the two don't both fire. History is only switched on
from `main.js`, so the test page never touches it.

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
getUid()                           -> Promise<string | null>   (null = signed out)
signUp | signIn(email, password)   -> Promise<{ uid } | { error }>
signOut()                          -> Promise<void>
fetchProfile(uid)                  -> Promise<Object | null>
createProfile(uid, profile)        -> Promise<void>   (new pending member)
saveProfile(uid, profile)          -> Promise<void>   (name + role only)
setMemberStatus(uid, status)       -> Promise<void>   (admins only)
uploadPhoto(uid, blob)             -> Promise<path>
photoUrls(paths)                   -> Promise<{ path: url }>
setRecipePhoto(recipeId, path)     -> Promise<void>
structureRecipe(text, tags, images) -> Promise<{ title, ingredients, instructions, prepMinutes, servings, tags }>
onShopping(cb)                     -> unsubscribe();  cb(Array)
setShoppingPeople(recipeId, people, uid) | removeFromShopping(recipeId) | clearShopping()
tidyShoppingList(lines)            -> Promise<string[]>
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

Every write rejects on failure. supabase-js resolves refused queries with
`{ error }` instead of throwing, so `supabase.js` checks each result — without
that, a write refused by row-level security looks like a success to the UI.

`mock.js` is the proof that the boundary holds — a second implementation of
the same methods backed by `localStorage`, used for local development.
It emulates realtime with an in-tab listener list plus the `storage` event for
cross-tab updates. It is *not* a fidelity test of Postgres: it has no
row-level security, so writes the real database would reject succeed against
the mock. It does mirror the few rules the UI depends on — new members start
pending, profile edits touch only name and role, and only an approved admin
may change someone else's status.

## Startup sequence

1. `main.js` calls `render()` immediately — paints the loading screen.
2. `init()` starts a 12s watchdog that flips `state.slowLoad` for a "taking
   longer than expected" message plus a retry button.
3. `Backend.connect()`; on failure, `state.capsMissing` → "Couldn't connect".
4. `Backend.getUid()` restores a stored session, verified with the server.
   `null` means signed out → the sign-in / create-account screen (`ui/auth.js`),
   which calls `afterSignedIn()` on success.
5. `afterSignedIn()` loads the profile and last-used phase filter, then calls
   `syncSubscriptions()`: members right away, recipes and ratings only once
   the profile is approved (see Access below). Flags guard against a retry
   double-subscribing; `signOut()` tears everything down and resets `state`.
6. `render()` then routes on the profile: none yet → the onboarding modal,
   which cannot be dismissed; `pending` → the waiting screen; `rejected` → the
   no-access screen; `approved` → the app.

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

## Access

A members row carries a `status` — `pending`, `approved` or `rejected` — and
an `is_admin` flag. Signing up only ever creates a pending, non-admin row; the
insert policy rejects anything else, and the column grants leave `status` and
`is_admin` out of what a member may update. The one way to change them is
`set_member_status()`, a `security definer` function that checks the caller is
an approved admin and not acting on themselves. The first admin is set by hand
in the SQL Editor.

Every read and write on `recipes` and `ratings` requires `is_approved()`, so a
pending or declined account gets nothing from the database, whatever the
client does. The UI mirrors this (`lib/members.js`), but it is not the
protection.

A pending member can read their own members row, which is how the waiting
screen notices approval: the realtime update arrives on the members
subscription, `syncSubscriptions()` then subscribes to recipes and ratings,
and `render()` swaps in the app.

## Roles

`member` and `patient` are stored on the member row, independently of
admin. Only `patient` sees the rating form — the app states this in a banner
rather than hiding it silently. This is a UI convention, not a security
boundary: the RLS policies let any approved member insert their own rating.

## Photos

A recipe has at most one photo. The browser shrinks it first
(`lib/photos.js`: longest side 1600px, JPEG) and uploads it to the private
`recipe-photos` bucket in Supabase Storage, into a folder named after the
uploader — the storage policy insists on that. `recipes.photo_path` stores
where it went. Any approved member can add or replace a photo later from the
detail view; `photo_path` is the only column of a saved recipe anyone may
update.

Because the bucket is private, an `<img>` needs a signed URL. `boot.js`
(`loadPhotoUrls()`) asks for URLs for any photo it has none for whenever the
recipes change, keeps them in `state.photoUrls`, and starts over once they
are close to their 24h expiry — checked again when the app comes back to the
foreground. The mock keeps photos as data URLs inside its localStorage entry,
which holds only a handful.

A replaced photo's old file stays in the bucket; nothing deletes storage
objects yet.

## Quick fill (LLM)

The add-recipe form starts with a free-text box: people type the recipe the
way they would tell it, or dictate it with their keyboard's microphone, and
"Fill in the form" sorts it into title, ingredients, steps, time and tags —
in English whatever language went in, since the recipe box is kept in English.
They can also photograph a printed or handwritten recipe (up to three
pages, `SCAN_PHOTO` size in `lib/photos.js` so the print stays legible),
alone or together with text such as "half the amount". The scans go to the
model as inline images and are never stored — they are not the dish photo.
It only fills the draft — they review it and save as usual. Phases are left
to the family on purpose.

The model is Google Gemini, called from the `structure-recipe` Supabase Edge
Function (`supabase/functions/`), because the API key must stay off the
client. The function refuses anyone who is not an approved member, caps the
input size, asks Gemini for JSON against a schema, and re-validates what
comes back (tags only from the list the app sent). The mock answers with a
crude line-based guess so the flow works without a key.

## Shopping list

One list for the whole family (`shopping_items`, live like the other
tables). It stores only which recipes are planned and for how many people;
the ingredients are worked out in the browser from the recipes each time,
so the list never holds stale copies.

`lib/shopping.js` scales each recipe from the people it serves
(`recipes.servings`, default 2) to the people it's cooked for, then adds up
lines that are clearly the same thing: matching name (lower-cased, roughly
singular, preparation notes dropped) and a unit that converts (g/kg, ml/l,
counts, spoons). Everything else stays on its own line — a duplicate line is
better than a wrong amount. Things bought whole are rounded up.

"Tidy up with AI" sends those lines to the same Edge Function with
`task: "tidy-list"`, to merge synonyms the rules leave alone. The result is
only shown while it still matches the current list (`state.shoppingTidy`)
and can be undone; it is per device, not shared.

"Add to Reminders" opens an Apple Shortcut by name (`SHOPPING_SHORTCUT` in
`config.js`) through `shortcuts://run-shortcut`, passing one item per line.
A web page can't write to Reminders itself; each person sets the Shortcut up
once, and the steps are in the panel.

## The account panel

The avatar in the header opens a settings-style panel (`ui/account.js`): a
menu of grouped rows that drills into pages within the same modal —
"Recipes to rate" for patients, "Members & requests" for admins, "Your
details" for everyone, and "Sign out". `state.modal.view` says which page is
showing. Rows only appear for the people they apply to, and their counts add
up to the badge on the avatar, so nothing waiting is hidden behind a tap
without a hint.

"Recipes to rate" lists what `pendingRatings()` in `lib/recipes.js` returns:
added by someone else, created at or after the patient's `joinedAt`, and not
yet rated by them. There is no notifications table — the count is derived
from `recipes` and `ratings`, so it updates live through the existing
subscriptions and clears itself once the rating is saved.
