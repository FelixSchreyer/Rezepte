// Phase dropdown, tag chips and the search field — everything that narrows
// down which recipes the grid shows.

import { PHASES, PHASE_MAP } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { allTags } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { render, renderGridInPlace } from "./app.js";

export function setActivePhase(id) {
  state.activePhase = id || null;
  if (state.uid) {
    Backend.saveFilterState(state.uid, { lastPhase: state.activePhase }).catch(function(){});
  }
  render();
}

export function renderPhaseDropdown() {
  var current = state.activePhase ? PHASE_MAP[state.activePhase] : null;
  var dropdown = el("div", { class: "phase-dropdown" });
  dropdown.appendChild(el("span", { class: "phase-dropdown-dot", style: "background:" + (current ? current.color : "var(--ink-faint)") }));

  var select = el("select", { attrs: { "aria-label": "Filter by phase" } });
  var allCount = state.recipes.length;
  select.appendChild(el("option", { text: "All phases (" + allCount + ")", attrs: { value: "" } }));
  PHASES.forEach(function(p){
    var count = state.recipes.filter(function(r){ return (r.phases||[]).indexOf(p.id) !== -1; }).length;
    select.appendChild(el("option", { text: p.label + " (" + count + ")", attrs: { value: p.id } }));
  });
  select.value = state.activePhase || "";
  select.addEventListener("change", function(e){ setActivePhase(e.target.value); });
  dropdown.appendChild(select);

  return el("div", { class: "phase-row" }, [
    el("span", { class: "lbl-inline", text: "Phase" }),
    dropdown
  ]);
}

export function renderFiltersRow() {
  var row = el("div", { class: "filters-row" });
  allTags().forEach(function(tag){
    var active = !!state.activeTags[tag];
    var chip = el("button", {
      class: "tag-chip",
      attrs: { type: "button", "aria-pressed": String(active) },
      text: tag,
      on: { click: function(){
        state.activeTags[tag] = !state.activeTags[tag];
        render();
      } }
    });
    chip.dataset.active = String(active);
    row.appendChild(chip);
  });
  return row;
}

export function renderSearch() {
  var wrap = el("div", { class: "search-wrap" });
  var input = el("input", { attrs: { type: "text", placeholder: "Search recipes or ingredients…", value: state.search, "aria-label": "Search recipes" } });
  input.value = state.search;
  input.addEventListener("input", function(e){
    state.search = e.target.value;
    renderGridInPlace();
  });
  wrap.appendChild(input);
  return wrap;
}
