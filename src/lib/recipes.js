// Derived views over `state` — filtering, tag collection and rating maths.
// Pure read-only helpers: nothing here mutates state or touches the DOM.

import { BASE_TAGS, PHASES } from "../config.js";
import { state } from "../state.js";

// Phases are ordered strictest → most relaxed, so a recipe that works in one
// phase also works in every later one. A recipe's effective phases are its
// earliest stored phase and everything after it — this also covers older
// recipes saved before that rule, which may list only some later phases.
function phaseIndex(id) {
  for (var i = 0; i < PHASES.length; i++) if (PHASES[i].id === id) return i;
  return -1;
}

export function recipePhases(r) {
  var earliest = PHASES.length;
  (r.phases || []).forEach(function(pid){
    var i = phaseIndex(pid);
    if (i !== -1 && i < earliest) earliest = i;
  });
  return PHASES.slice(earliest).map(function(p){ return p.id; });
}

export function suitsPhase(r, phaseId) {
  return recipePhases(r).indexOf(phaseId) !== -1;
}

export function allTags() {
  var set = {};
  BASE_TAGS.forEach(function(t){ set[t] = true; });
  state.recipes.forEach(function(r){ (r.tags||[]).forEach(function(t){ set[t] = true; }); });
  return Object.keys(set);
}

export function ratingsFor(recipeId) {
  return state.ratings.filter(function(r){ return r.recipeId === recipeId; });
}

export function ratingSummary(recipeId) {
  var rs = ratingsFor(recipeId);
  if (!rs.length) return null;
  var sum = 0, tolCount = { good: 0, medium: 0, poor: 0 };
  rs.forEach(function(r){ sum += (r.stars||0); tolCount[r.tolerance] = (tolCount[r.tolerance]||0) + 1; });
  var avg = sum / rs.length;
  var bestTol = "good";
  Object.keys(tolCount).forEach(function(k){ if (tolCount[k] > (tolCount[bestTol]||0)) bestTol = k; });
  return { avg: avg, count: rs.length, tolerance: bestTol };
}

// Recipes waiting for the signed-in patient's rating — what the header bell
// counts. Only recipes added by someone else since the patient joined count:
// the recipe box that existed before they arrived is not "new", and they do
// not need telling about a recipe they added themselves. Non-patients never
// have pending ratings. Newest first.
export function pendingRatings() {
  var me = state.myProfile;
  if (!me || me.role !== "patient") return [];
  var since = me.joinedAt || 0;
  var rated = {};
  state.ratings.forEach(function(r){ if (r.uid === state.uid) rated[r.recipeId] = true; });
  return state.recipes.filter(function(r){
    return !rated[r.id] && r.addedBy !== state.uid && (r.createdAt||0) >= since;
  }).sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
}

export function filteredRecipes() {
  var tagFilters = Object.keys(state.activeTags).filter(function(t){ return state.activeTags[t]; });
  var q = state.search.trim().toLowerCase();
  return state.recipes.filter(function(r){
    if (state.activePhase && !suitsPhase(r, state.activePhase)) return false;
    for (var i = 0; i < tagFilters.length; i++) {
      if ((r.tags||[]).indexOf(tagFilters[i]) === -1) return false;
    }
    if (q) {
      var hay = (r.title || "").toLowerCase() + " " + (r.ingredients||[]).join(" ").toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
}

export function starString(avg) {
  var full = Math.round(avg);
  var s = "";
  for (var i = 0; i < 5; i++) s += (i < full ? "★" : "☆");
  return s;
}
