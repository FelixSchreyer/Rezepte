// The recipe list on the home screen: tag shelves or a results grid, the
// cards with their rating summaries, and the empty state.

import { PHASES, PHASE_MAP, TOL_MAP } from "../config.js";
import { root, state } from "../state.js";
import { el } from "../lib/dom.js";
import { allTags, filteredRecipes, ratingSummary, starString, recipePhases } from "../lib/recipes.js";
import { openDetail } from "./modal.js";
import { render } from "./app.js";

export function emptyCopy() {
  if (state.activePhase) {
    var label = PHASE_MAP[state.activePhase].short;
    return {
      big: "Nothing filed under " + label + " yet",
      small: "Add a recipe that works on " + label.toLowerCase() + " days, so it's ready before the next one starts."
    };
  }
  return {
    big: "The recipe box is empty",
    small: "Add the first recipe — tag it with the phase it suits so it's easy to find later."
  };
}

// Browsing (only the phase filter set): one sideways-scrolling shelf with
// every recipe, then one per tag that has any. Searching or picking tags in
// the filter is looking for something specific, so that shows a plain grid.
export function renderGrid() {
  var wrap = el("div", { class: "recipes" });
  var list = filteredRecipes();
  if (!list.length) {
    var copy = emptyCopy();
    wrap.appendChild(el("div", { class: "grid" }, [
      el("div", { class: "empty-state" }, [
        el("div", { class: "big", text: copy.big }),
        el("div", { text: copy.small })
      ])
    ]));
    return wrap;
  }

  var narrowed = state.search.trim() || Object.keys(state.activeTags).some(function(t){ return state.activeTags[t]; });
  if (narrowed) {
    var grid = el("div", { class: "grid" });
    list.forEach(function(r){ grid.appendChild(renderCard(r)); });
    wrap.appendChild(grid);
    return wrap;
  }

  wrap.appendChild(renderShelf("All recipes", list, null));
  allTags().forEach(function(tag){
    var tagged = list.filter(function(r){ return (r.tags||[]).indexOf(tag) !== -1; });
    if (tagged.length) wrap.appendChild(renderShelf(tag, tagged, tag));
  });
  return wrap;
}

// Every render() rebuilds the shelves from scratch, which would snap each
// one back to its first card — e.g. after opening and closing a recipe.
// The caller reads the positions before clearing the page and puts them
// back once the new shelves are in it. Shelves are matched by title.
export function shelfScrollPositions() {
  var pos = {};
  root.querySelectorAll(".shelf").forEach(function(s){
    pos[s.getAttribute("aria-label")] = s.querySelector(".shelf-track").scrollLeft;
  });
  return pos;
}

export function restoreShelfScroll(pos) {
  root.querySelectorAll(".shelf").forEach(function(s){
    var x = pos[s.getAttribute("aria-label")];
    if (x) s.querySelector(".shelf-track").scrollLeft = x;
  });
}

function renderShelf(title, list, tag) {
  var head = el("div", { class: "shelf-head" }, [
    el("h2", { text: title }),
    el("span", { class: "shelf-count", text: String(list.length) })
  ]);
  if (tag) {
    head.appendChild(el("button", { class: "btn btn-ghost btn-sm shelf-more", attrs: { type: "button", "aria-label": "See all " + title + " recipes" }, text: "See all", on: { click: function(){
      state.activeTags = {};
      state.activeTags[tag] = true;
      render();
      window.scrollTo(0, 0);
    } } }));
  }
  var track = el("div", { class: "shelf-track" });
  list.forEach(function(r){ track.appendChild(renderCard(r)); });
  return el("section", { class: "shelf", attrs: { "aria-label": title } }, [head, track]);
}

export function renderCard(r) {
  var earliest = PHASE_MAP[recipePhases(r)[0]];
  var primaryPhase = earliest || PHASES[4];
  var card = el("button", {
    class: "card",
    attrs: { type: "button", style: "" },
    style: "border-left-color:" + primaryPhase.color,
    on: { click: function(){ openDetail(r.id); } }
  });

  // Only the earliest phase: every later one is implied.
  var dots = el("div", { class: "phase-dots" });
  if (earliest) {
    dots.appendChild(el("span", { style: "background:" + earliest.color, attrs: { title: "Suitable from " + earliest.label } }));
    dots.appendChild(el("span", { class: "phase-name", text: earliest.short }));
  }

  var photoUrl = r.photoPath && state.photoUrls[r.photoPath];
  if (photoUrl) card.appendChild(el("img", { class: "card-photo", attrs: { src: photoUrl, alt: "", loading: "lazy" } }));

  card.appendChild(dots);
  card.appendChild(el("h3", { text: r.title || "Untitled recipe" }));
  if ((r.tags||[]).length) {
    card.appendChild(el("div", { class: "tags", text: (r.tags||[]).join(" · ") }));
  }
  card.appendChild(el("div", { class: "meta", text: (r.ingredients||[]).length + " ingredients" + (r.prepMinutes ? " · " + r.prepMinutes + " min" : "") }));

  var summary = ratingSummary(r.id);
  var ratingRow = el("div", { class: "rating-row" });
  if (summary) {
    ratingRow.appendChild(el("span", { class: "stars", text: starString(summary.avg) }));
    ratingRow.appendChild(el("span", { text: summary.avg.toFixed(1) + " · " + TOL_MAP[summary.tolerance].label + " · " + summary.count + " rating" + (summary.count > 1 ? "s" : "") }));
  } else {
    ratingRow.appendChild(el("span", { text: "No ratings yet" }));
  }
  card.appendChild(ratingRow);
  return card;
}
