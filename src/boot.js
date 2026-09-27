// Application lifecycle: connect to the backend, establish the anonymous
// session, load this person's profile and preferences, then keep `state`
// in sync with the live tables.
//
// This module is the only place that talks to Backend for reasons other
// than a direct user action.

import { state } from "./state.js";
import { Backend } from "./backend/index.js";
import { render } from "./ui/app.js";

function subscribe() {
  Backend.onRecipes(function (recipes) {
    state.recipes = recipes;
    render();
  });

  Backend.onRatings(function (ratings) {
    state.ratings = ratings;
    render();
  });

  Backend.onMembers(function (members) {
    var map = {};
    members.forEach(function (d) { map[d.id] = d; });
    state.members = map;
    if (state.uid && map[state.uid]) state.myProfile = map[state.uid];
    render();
  });
}

var subscribed = false;

async function afterSignedIn(uid) {
  state.uid = uid;
  state.myProfile = await Backend.fetchProfile(uid);

  var filterState = await Backend.fetchFilterState(uid);
  if (filterState && filterState.lastPhase) state.activePhase = filterState.lastPhase;

  if (!subscribed) { subscribe(); subscribed = true; }
  render();
}

export async function init() {
  var watchdog = setTimeout(function(){
    if (!state.ready && !state.capsMissing) { state.slowLoad = true; render(); }
  }, 12000);

  try {
    var conn = await Backend.connect();
    if (!conn.ok) { clearTimeout(watchdog); state.capsMissing = true; render(); return; }

    var uid = await Backend.getUid(); // creates an anonymous session on first visit
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
