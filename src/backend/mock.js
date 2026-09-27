// An in-browser stand-in for supabase.js, implementing the identical Backend
// contract against localStorage. No network, no account, no risk of writing to
// the family's real recipe box.
//
// Activate with ?mock in the URL — see index.js.
//
//   ?mock                 work as Alex (a patient, so the rating form shows)
//   ?mock&user=sam        work as Sam (a member — rating form hidden)
//   ?mock&user=nobody     an unknown name gets a fresh profile-less identity,
//                         which is how you reach the onboarding modal
//   ?mock&reset           wipe localStorage and reseed before starting
//   ?mock&latency=800     slow every call down, to see the loading states
//   ?mock&fail=connect    force the "Couldn't connect" screen
//   ?mock&fail=auth       force the "Couldn't sign you in" screen
//
// Realtime is emulated two ways: writes in this tab notify local subscribers
// directly, and the `storage` event notifies *other tabs*. Open two windows
// with different ?user= values to watch a rating appear live on both, which is
// the behaviour the real app gets from Supabase Realtime.

import { freshSeed, SEED_MEMBERS } from "./seed.js";

var STORE_KEY = "gut-and-grain-mock-v1";

function params() {
  return new URLSearchParams(window.location.search);
}

function option(name, fallback) {
  var v = params().get(name);
  return v === null ? fallback : v;
}

var LATENCY = Number(option("latency", 120)) || 0;
var FAIL = option("fail", "");

// Every method resolves through here, so the app meets the same asynchrony it
// would over a network and loading states are actually reachable.
function later(value) {
  return new Promise(function (resolve) {
    setTimeout(function () { resolve(value); }, LATENCY);
  });
}

function read() {
  try {
    var raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // Private browsing, disabled site data, or corrupt JSON — fall through to
    // a fresh seed so the app still runs.
  }
  var seeded = freshSeed();
  write(seeded);
  return seeded;
}

function write(db) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch (e) {
    // Nothing to do: the in-memory copy stays correct for this tab.
  }
}

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return "mock-" + Math.random().toString(36).slice(2, 10);
}

// ---------------- subscriptions ----------------

var listeners = { members: [], recipes: [], ratings: [] };

function rowsFor(table, db) {
  if (table === "members") return Object.keys(db.members).map(function (k) { return db.members[k]; });
  return db[table];
}

function emit(table) {
  var db = read();
  listeners[table].forEach(function (cb) { cb(rowsFor(table, db)); });
}

function emitAll() {
  Object.keys(listeners).forEach(emit);
}

function subscribe(table, cb) {
  listeners[table].push(cb);
  later().then(function () { cb(rowsFor(table, read())); });
  return function () {
    listeners[table] = listeners[table].filter(function (fn) { return fn !== cb; });
  };
}

// Another tab wrote to the same key — mirror the real app's cross-device sync.
window.addEventListener("storage", function (e) {
  if (e.key === STORE_KEY) emitAll();
});

// ---------------- identity ----------------

// A name in ?user= maps to that seeded member; anything unrecognised becomes a
// brand-new identity with no profile, which lands you in onboarding.
function resolveUid() {
  var who = (option("user", "alex") || "").toLowerCase();
  var match = SEED_MEMBERS.filter(function (m) {
    return m.id === "mock-user-" + who || m.name.toLowerCase().split(" ")[0] === who;
  })[0];
  return match ? match.id : "mock-user-" + (who || "anon");
}

// ---------------- the adapter ----------------

export const MockBackend = {
  connect: function () {
    if (FAIL === "connect") return later({ ok: false });
    if (params().has("reset")) {
      try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    }
    read();          // force a seed on first run
    showBadge();
    return later({ ok: true });
  },

  getUid: function () {
    if (FAIL === "auth") return later(null);
    return later(resolveUid());
  },

  fetchProfile: function (uid) {
    var db = read();
    return later(db.members[uid] || null);
  },

  saveProfile: function (uid, profile) {
    var db = read();
    var existing = db.members[uid] || {};
    db.members[uid] = {
      id: uid,
      name: profile.name,
      role: profile.role,
      joinedAt: profile.joinedAt,
      lastPhase: existing.lastPhase === undefined ? null : existing.lastPhase
    };
    write(db);
    emit("members");
    return later();
  },

  onMembers: function (cb) { return subscribe("members", cb); },
  onRecipes: function (cb) { return subscribe("recipes", cb); },
  onRatings: function (cb) { return subscribe("ratings", cb); },

  addRecipe: function (data) {
    var db = read();
    db.recipes.push({
      id: uuid(),
      title: data.title,
      phases: data.phases,
      tags: data.tags,
      ingredients: data.ingredients,
      instructions: data.instructions,
      prepMinutes: data.prepMinutes,
      addedBy: data.addedBy,
      addedByName: data.addedByName,
      createdAt: data.createdAt
    });
    write(db);
    emit("recipes");
    return later();
  },

  // Mirrors the unique (recipe_id, uid) constraint in db/schema.sql.
  upsertRating: function (recipeId, uid, data) {
    var db = read();
    var existing = db.ratings.filter(function (r) {
      return r.recipeId === recipeId && r.uid === uid;
    })[0];

    if (existing) {
      existing.stars = data.stars;
      existing.tolerance = data.tolerance;
      existing.comment = data.comment;
      existing.createdAt = data.createdAt;
    } else {
      db.ratings.push({
        id: uuid(),
        recipeId: recipeId,
        uid: uid,
        name: data.name,
        stars: data.stars,
        tolerance: data.tolerance,
        comment: data.comment,
        createdAt: data.createdAt
      });
    }
    write(db);
    emit("ratings");
    return later();
  },

  fetchFilterState: function (uid) {
    var db = read();
    var m = db.members[uid];
    return later(m && m.lastPhase ? { lastPhase: m.lastPhase } : null);
  },

  saveFilterState: function (uid, data) {
    var db = read();
    if (db.members[uid]) {
      db.members[uid].lastPhase = data.lastPhase;
      write(db);
    }
    return later();
  }
};

// ---------------- dev affordance ----------------

// A corner badge, so mock data is never mistaken for the real recipe box.
// Styles are injected here rather than added to styles/ — this is development
// scaffolding and has no business in the production stylesheets.
function showBadge() {
  // Only when the mock was activated from the URL — the test page calls
  // connect() directly and has no business growing a badge.
  if (!params().has("mock")) return;
  if (document.getElementById("mock-badge")) return;

  var style = document.createElement("style");
  style.textContent =
    "#mock-badge{position:fixed;left:12px;bottom:12px;z-index:9999;" +
    "font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;" +
    "background:#8B3A1F;color:#fff;padding:7px 10px;border-radius:999px;" +
    "box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.9;text-transform:uppercase}" +
    "#mock-badge span{opacity:.75;text-transform:none;font-weight:400}";
  document.head.appendChild(style);

  var badge = document.createElement("div");
  badge.id = "mock-badge";
  badge.title = "Local mock data in localStorage — the real Supabase project is untouched.";
  badge.innerHTML = "Mock data <span>· " + resolveUid().replace("mock-user-", "") + "</span>";
  document.body.appendChild(badge);
}
