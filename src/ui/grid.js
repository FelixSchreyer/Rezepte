// The recipe grid: cards, their rating summaries, and the empty state.

import { PHASES, PHASE_MAP, TOL_MAP } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { filteredRecipes, ratingSummary, starString } from "../lib/recipes.js";
import { openDetail } from "./modal.js";

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

export function renderGrid() {
  var grid = el("div", { class: "grid" });
  var list = filteredRecipes();
  if (!list.length) {
    var copy = emptyCopy();
    grid.appendChild(el("div", { class: "empty-state" }, [
      el("div", { class: "big", text: copy.big }),
      el("div", { text: copy.small })
    ]));
    return grid;
  }
  list.forEach(function(r){ grid.appendChild(renderCard(r)); });
  return grid;
}

export function renderCard(r) {
  var primaryPhase = PHASE_MAP[(r.phases||[])[0]] || PHASES[4];
  var card = el("button", {
    class: "card",
    attrs: { type: "button", style: "" },
    style: "border-left-color:" + primaryPhase.color,
    on: { click: function(){ openDetail(r.id); } }
  });

  var dots = el("div", { class: "phase-dots" });
  (r.phases || []).forEach(function(pid){
    var p = PHASE_MAP[pid];
    if (!p) return;
    dots.appendChild(el("span", { style: "background:" + p.color, attrs: { title: p.label } }));
  });

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
