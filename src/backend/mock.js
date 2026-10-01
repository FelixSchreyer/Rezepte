// An in-browser stand-in for supabase.js, implementing the identical Backend
// contract against localStorage. No network, no account, no risk of writing to
// the family's real recipe box.
//
// Activate with ?mock in the URL — see index.js.
//
//   ?mock                 start signed out, at the sign-in screen. Seeded
//                         accounts: alex@ / sam@ / robin@ / jordan@example.com,
//                         password "password" (see seed.js)
//   ?mock&user=alex       start signed in as Alex (approved patient + admin)
//   ?mock&user=sam        start signed in as Sam (approved member)
//   ?mock&user=jordan     start signed in as Jordan (waiting for approval)
//   ?mock&user=nobody     an unknown name gets a fresh profile-less identity,
//                         which is how you reach the onboarding modal
//   ?mock&reset           wipe localStorage and reseed before starting
//   ?mock&latency=800     slow every call down, to see the loading states
//   ?mock&fail=connect    force the "Couldn't connect" screen
//   ?mock&fail=auth       make every sign-in and sign-up fail
//   ?mock&fail=llm        make "Fill in the form" fail
//
// Row-level security is NOT emulated: a pending member could read recipes
// here if the app asked. The one server-side rule the mock does enforce is
// set_member_status()'s "approved admins only, never on yourself".
//
// Realtime is emulated two ways: writes in this tab notify local subscribers
// directly, and the `storage` event notifies *other tabs*. Open two windows
// with different ?user= values to watch a rating appear live on both, which is
// the behaviour the real app gets from Supabase Realtime.

import { freshSeed, SEED_MEMBERS } from "./seed.js";

var STORE_KEY = "gut-and-grain-mock-v2";

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

function failLater(message) {
  return later().then(function () { throw new Error(message); });
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
    return true;
  } catch (e) {
    // Quota exceeded or storage disabled. Callers that can fail meaningfully
    // (photo uploads) check the return value; the rest carry on.
    return false;
  }
}

function uuid() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return "mock-" + Math.random().toString(36).slice(2, 10);
}

// ---------------- subscriptions ----------------

var listeners = { members: [], recipes: [], ratings: [], shopping: [] };

function rowsFor(table, db) {
  if (table === "members") return Object.keys(db.members).map(function (k) { return db.members[k]; });
  return db[table] || [];
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
function resolveUid(who) {
  who = (who || "").toLowerCase();
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
    var db = read();   // force a seed on first run
    // ?user= behaves like having signed in as that person on this device.
    if (params().has("user")) { db.session = resolveUid(option("user", "")); write(db); }
    showBadge();
    return later({ ok: true });
  },

  getUid: function () {
    return later(read().session || null);
  },

  signUp: function (email, password) {
    if (FAIL === "auth") return later({ error: "network" });
    email = (email || "").trim().toLowerCase();
    if ((password || "").length < 6) return later({ error: "weak" });
    var db = read();
    if (db.accounts[email]) return later({ error: "exists" });
    var uid = uuid();
    db.accounts[email] = { uid: uid, password: password };
    db.session = uid;
    write(db);
    return later({ uid: uid });
  },

  signIn: function (email, password) {
    if (FAIL === "auth") return later({ error: "network" });
    var db = read();
    var account = db.accounts[(email || "").trim().toLowerCase()];
    if (!account || account.password !== password) return later({ error: "invalid" });
    db.session = account.uid;
    write(db);
    return later({ uid: account.uid });
  },

  signOut: function () {
    var db = read();
    db.session = null;
    write(db);
    return later();
  },

  fetchProfile: function (uid) {
    var db = read();
    return later(db.members[uid] || null);
  },

  // Mirrors the insert policy: a new member is always pending, never admin.
  createProfile: function (uid, profile) {
    var db = read();
    if (db.members[uid]) return failLater("members row already exists");
    var email = Object.keys(db.accounts).filter(function (e) { return db.accounts[e].uid === uid; })[0];
    db.members[uid] = {
      id: uid,
      email: email || "",
      name: profile.name,
      role: profile.role,
      status: "pending",
      isAdmin: false,
      joinedAt: profile.joinedAt,
      lastPhase: null
    };
    write(db);
    emit("members");
    return later();
  },

  // Only name and role, like the column grants in db/schema.sql.
  saveProfile: function (uid, profile) {
    var db = read();
    if (!db.members[uid]) return failLater("no members row to update");
    db.members[uid].name = profile.name;
    db.members[uid].role = profile.role;
    write(db);
    emit("members");
    return later();
  },

  // Mirrors set_member_status() in db/schema.sql.
  setMemberStatus: function (uid, status) {
    var db = read();
    var me = db.members[db.session];
    if (!me || me.status !== "approved" || !me.isAdmin) return failLater("only admins can change member status");
    if (uid === db.session) return failLater("admins cannot change their own status");
    if (status !== "approved" && status !== "rejected") return failLater("invalid status: " + status);
    if (db.members[uid]) db.members[uid].status = status;
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
      servings: data.servings || 2,
      addedBy: data.addedBy,
      addedByName: data.addedByName,
      photoPath: data.photoPath || null,
      createdAt: data.createdAt
    });
    write(db);
    emit("recipes");
    return later();
  },

  // Photos are kept as data URLs inside the same localStorage entry, so a
  // handful fit before the browser's ~5 MB quota runs out. Good enough for
  // trying the feature; write() failing past that is caught below.
  uploadPhoto: function (uid, blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    }).then(function (dataUrl) {
      var db = read();
      var path = uid + "/" + uuid() + ".jpg";
      db.photos = db.photos || {};
      db.photos[path] = dataUrl;
      if (!write(db)) throw new Error("mock storage is full");
      return later(path);
    });
  },

  photoUrls: function (paths) {
    var photos = read().photos || {};
    var out = {};
    paths.forEach(function (p) { if (photos[p]) out[p] = photos[p]; });
    return later(out);
  },

  onShopping: function (cb) { return subscribe("shopping", cb); },

  // Mirrors shopping_items: one row per recipe, so a second add updates it.
  setShoppingPeople: function (recipeId, people, uid) {
    var db = read();
    db.shopping = db.shopping || [];
    var row = db.shopping.filter(function (s) { return s.recipeId === recipeId; })[0];
    if (row) row.people = people;
    else db.shopping.push({ recipeId: recipeId, people: people, addedBy: uid, addedAt: Date.now() });
    write(db);
    emit("shopping");
    return later();
  },

  removeFromShopping: function (recipeId) {
    var db = read();
    db.shopping = (db.shopping || []).filter(function (s) { return s.recipeId !== recipeId; });
    write(db);
    emit("shopping");
    return later();
  },

  clearShopping: function () {
    var db = read();
    db.shopping = [];
    write(db);
    emit("shopping");
    return later();
  },

  // No LLM: pretend to tidy by dropping exact duplicates, so the button can
  // be tried without a Gemini key.
  tidyShoppingList: function (lines) {
    if (FAIL === "llm") return failLater("mock llm failure");
    var seen = {};
    return later((lines || []).filter(function (l) {
      var k = l.toLowerCase();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }));
  },

  // No LLM here: a crude line-based guess, so the quick-fill flow can be
  // tried without a Gemini key. Lines that start with an amount or a bullet
  // become ingredients, the first other line the title, the rest steps.
  structureRecipe: function (text, tags, images) {
    if (FAIL === "llm") return failLater("mock llm failure");
    // The mock can't read photos; with nothing but photos, answer with a
    // fixed sample so the scan flow can still be clicked through.
    if (!(text || "").trim() && images && images.length) {
      return later({
        title: "Scanned recipe (mock)",
        ingredients: ["200 g white rice", "1 chicken breast", "1 L water"],
        instructions: "1. Simmer the rice in the water for an hour.\n2. Poach the chicken in it for the last 20 minutes.",
        prepMinutes: 70,
        servings: 4,
        tags: []
      });
    }
    var lines = (text || "").split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
    var title = "";
    var ingredients = [];
    var steps = [];
    lines.forEach(function (l) {
      if (/^([-•*]|\d+\s*(g|kg|ml|l|el|tl|tbsp|tsp|cup|stück|x)?\b)/i.test(l) && !/^\d+\./.test(l)) {
        ingredients.push(l.replace(/^[-•*]\s*/, ""));
      } else if (!title) {
        title = l;
      } else {
        steps.push(l);
      }
    });
    var minutes = /(\d+)\s*(min|minuten|minutes)\b/i.exec(text || "");
    var lower = (text || "").toLowerCase();
    return later({
      title: title,
      ingredients: ingredients,
      instructions: steps.map(function (s, i) { return (i + 1) + ". " + s.replace(/^\d+\.\s*/, ""); }).join("\n"),
      prepMinutes: minutes ? Number(minutes[1]) : null,
      servings: (function () { var s = /serves\s+(\d+)|(\d+)\s+(people|persons|servings|personen)/i.exec(text || ""); return s ? Number(s[1] || s[2]) : null; })(),
      tags: (tags || []).filter(function (t) { return lower.indexOf(t.toLowerCase()) !== -1; })
    });
  },

  updateRecipe: function (recipeId, data) {
    var db = read();
    var recipe = db.recipes.filter(function (r) { return r.id === recipeId; })[0];
    if (!recipe) return failLater("no such recipe");
    recipe.title = data.title;
    recipe.phases = data.phases;
    recipe.tags = data.tags;
    recipe.ingredients = data.ingredients;
    recipe.instructions = data.instructions;
    recipe.prepMinutes = data.prepMinutes;
    recipe.servings = data.servings || 2;
    write(db);
    emit("recipes");
    return later();
  },

  setRecipePhoto: function (recipeId, path) {
    var db = read();
    var recipe = db.recipes.filter(function (r) { return r.id === recipeId; })[0];
    if (!recipe) return failLater("no such recipe");
    recipe.photoPath = path;
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
    "box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.9;text-transform:uppercase}";
  document.head.appendChild(style);

  var badge = document.createElement("div");
  badge.id = "mock-badge";
  badge.title = "Local mock data in localStorage — the real Supabase project is untouched.";
  badge.textContent = "Mock data";
  document.body.appendChild(badge);
}
