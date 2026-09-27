// Derived views over `state` — filtering, tag collection and rating maths.
// Pure read-only helpers: nothing here mutates state or touches the DOM.

import { BASE_TAGS } from "../config.js";
import { state } from "../state.js";

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

export function filteredRecipes() {
  var tagFilters = Object.keys(state.activeTags).filter(function(t){ return state.activeTags[t]; });
  var q = state.search.trim().toLowerCase();
  return state.recipes.filter(function(r){
    if (state.activePhase && (r.phases||[]).indexOf(state.activePhase) === -1) return false;
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
