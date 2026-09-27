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
    }));
    unsubscribers.push(Backend.onRatings(function (ratings) {
      state.ratings = ratings;
      render();
    }));
  }
}

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
