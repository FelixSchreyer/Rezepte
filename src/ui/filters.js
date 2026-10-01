// Phase dropdown, tag dropdown and the search field — everything that
// narrows down which recipes the grid shows.

import { PHASES, PHASE_MAP } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { allTags, suitsPhase } from "../lib/recipes.js";
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
    var count = state.recipes.filter(function(r){ return suitsPhase(r, p.id); }).length;
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

function activeTagList() {
  return Object.keys(state.activeTags).filter(function(t){ return state.activeTags[t]; });
}

function tagSummary(active) {
  if (!active.length) return "All tags";
  if (active.length === 1) return active[0];
  return active[0] + " + " + (active.length - 1) + " more";
}

// Tag filter as a dropdown with a checklist, styled like the phase dropdown.
// Whether it is open lives in `state.tagMenuOpen`, so it survives the full
// re-render every tick of a checkbox triggers.
export function renderTagFilter() {
  var active = activeTagList();
  var open = !!state.tagMenuOpen;

  var toggle = el("button", {
    class: "phase-dropdown tag-dropdown",
    attrs: { type: "button", "aria-haspopup": "true", "aria-expanded": String(open), "aria-label": "Filter by tag" },
    on: { click: function(){ state.tagMenuOpen = !open; render(); } }
  }, [
    el("span", { class: "tag-dropdown-count", text: active.length ? String(active.length) : "" }),
    el("span", { class: "tag-dropdown-label", text: tagSummary(active) })
  ]);
  toggle.dataset.active = String(active.length > 0);

  var wrap = el("div", { class: "tag-filter" }, [toggle]);

  if (open) {
    var list = el("div", { class: "tag-menu", attrs: { role: "group", "aria-label": "Tags" } });
    allTags().forEach(function(tag){
      var box = el("input", { attrs: { type: "checkbox" } });
      box.checked = !!state.activeTags[tag];
      box.addEventListener("change", function(){
        state.activeTags[tag] = box.checked;
        render();
      });
      list.appendChild(el("label", { class: "tag-option" }, [ box, document.createTextNode(tag) ]));
    });
    list.appendChild(el("div", { class: "tag-menu-actions" }, [
      el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Clear", on: { click: function(){
        state.activeTags = {};
        render();
      } } }),
      el("button", { class: "btn btn-primary btn-sm", attrs: { type: "button" }, text: "Done", on: { click: function(){
        state.tagMenuOpen = false;
        render();
      } } })
    ]));
    wrap.appendChild(list);
  }

  return el("div", { class: "phase-row" }, [
    el("span", { class: "lbl-inline", text: "Filter" }),
    wrap
  ]);
}

// Close the tag menu on a click anywhere outside it, or on Escape.
// composedPath() rather than target.closest(): a checkbox click re-renders
// before this runs, so the target is already detached from the page.
document.addEventListener("click", function(e){
  if (!state.tagMenuOpen) return;
  var inside = e.composedPath().some(function(n){ return n.classList && n.classList.contains("tag-filter"); });
  if (!inside) { state.tagMenuOpen = false; render(); }
});
document.addEventListener("keydown", function(e){
  if (e.key === "Escape" && state.tagMenuOpen) { state.tagMenuOpen = false; render(); }
});

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
