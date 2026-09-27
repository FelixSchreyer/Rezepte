// Application lifecycle: connect to the backend, restore the signed-in
// session, load this person's profile and preferences, then keep `state`
// in sync with the live tables — and tear all of that down on sign-out.
//
// This module is the only place that talks to Backend for reasons other
// than a direct user action.

import { state } from "./state.js";
import { Backend } from "./backend/index.js";
import { isApproved } from "./lib/members.js";
import { render } from "./ui/app.js";

// Members are subscribed as soon as someone is signed in: a pending member
// can see their own row, and that is how they notice being approved.
// Recipes and ratings only once approved — the database returns nothing
// before that, and a subscription made earlier would never load them.
var unsubscribers = [];
var membersSubscribed = false;
var contentSubscribed = false;

export function syncSubscriptions() {
  if (!state.uid) return;
  if (!membersSubscribed) {
    membersSubscribed = true;
    unsubscribers.push(Backend.onMembers(function (members) {
      var map = {};
      members.forEach(function (d) { map[d.id] = d; });
      state.members = map;
      if (state.uid && map[state.uid]) state.myProfile = map[state.uid];
      syncSubscriptions();
      render();
    }));
  }
  if (!contentSubscribed && isApproved()) {
    contentSubscribed = true;
    unsubscribers.push(Backend.onRecipes(function (recipes) {
      state.recipes = recipes;
      render();
      loadPhotoUrls();
    }));
    unsubscribers.push(Backend.onRatings(function (ratings) {
      state.ratings = ratings;
      render();
    }));
    unsubscribers.push(Backend.onShopping(function (items) {
      state.shopping = items;
      render();
    }));
  }
}

// Photos live in a private bucket, so each one needs a signed URL that
// expires after about a day. Fetch URLs for photos we have none for yet, and
// start over once the batch we hold is getting old (an app left open
// overnight, then woken up).
var PHOTO_URL_MAX_AGE = 20 * 60 * 60 * 1000;

export async function loadPhotoUrls() {
  if (Date.now() - state.photoUrlsAt > PHOTO_URL_MAX_AGE) {
    state.photoUrls = {};
    state.photoUrlsAt = Date.now();
  }
  var missing = state.recipes
    .map(function (r) { return r.photoPath; })
    .filter(function (p) { return p && !state.photoUrls[p]; });
  if (!missing.length) return;
  try {
    var urls = await Backend.photoUrls(missing);
    Object.keys(urls).forEach(function (p) { state.photoUrls[p] = urls[p]; });
    render();
  } catch (e) {
    // Photos stay hidden; the next recipes update tries again.
  }
}

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "visible" && state.uid && state.recipes.length) loadPhotoUrls();
});

function clearSubscriptions() {
  unsubscribers.forEach(function (off) { off(); });
  unsubscribers = [];
  membersSubscribed = false;
  contentSubscribed = false;
}

export async function afterSignedIn(uid) {
  state.uid = uid;
  state.myProfile = await Backend.fetchProfile(uid);

  var filterState = await Backend.fetchFilterState(uid);
  if (filterState && filterState.lastPhase) state.activePhase = filterState.lastPhase;

  syncSubscriptions();
  render();
}

export async function signOut() {
  clearSubscriptions();
  try { await Backend.signOut(); } catch (e) { /* signed out locally either way */ }
  state.uid = null;
  state.myProfile = null;
  state.members = {};
  state.recipes = [];
  state.ratings = [];
  state.shopping = [];
  state.shoppingTidy = null;
  state.photoUrls = {};
  state.photoUrlsAt = 0;
  state.activePhase = null;
  state.activeTags = {};
  state.search = "";
  state.modal = null;
  state.auth = { mode: "signin", email: "", password: "", error: "", busy: false };
  render();
}

export async function init() {
  var watchdog = setTimeout(function(){
    if (!state.ready && !state.capsMissing) { state.slowLoad = true; render(); }
  }, 12000);

  try {
    var conn = await Backend.connect();
    if (!conn.ok) { clearTimeout(watchdog); state.capsMissing = true; render(); return; }

    var uid = await Backend.getUid(); // null = signed out → sign-in screen
    clearTimeout(watchdog);
    state.ready = true;

    if (uid) {
      await afterSignedIn(uid);
    } else {
      state.uid = null;
      render();
    }
  } catch (e) {
    clearTimeout(watchdog);
    state.capsMissing = true;
    render();
  }
}

// Restart the whole connect/sign-in sequence — wired to the "Try again"
// buttons on the failure screens.
export function retryInit() {
  state.capsMissing = false;
  state.ready = false;
  state.slowLoad = false;
  render();
  init();
}
