// Phase dropdown, tag dropdown and the search field — everything that
// narrows down which recipes the grid shows.

import { PHASES, PHASE_MAP } from "../config.js";
import { state } from "../state.js";
import { el, sinceLabel } from "../lib/dom.js";
import { allTags, suitsPhase } from "../lib/recipes.js";
import { effectivePhase, phaseStatus } from "../lib/members.js";
import { Backend } from "../backend/index.js";
import { render, renderGridInPlace } from "./app.js";

// A pick of one's own: it holds until a patient sets a newer status (see
// effectivePhase() in lib/members.js), so it is saved with when it was made.
export function setActivePhase(id) {
  state.activePhase = id || null;
  state.phaseChoice = { phase: state.activePhase, at: Date.now() };
  if (state.uid) {
    Backend.saveFilterState(state.uid, { lastPhase: state.activePhase, lastPhaseAt: state.phaseChoice.at }).catch(function(){});
  }
  render();
}

var statusError = "";

// A patient's "How I'm doing": shared with everyone, and it moves every
// filter onto that phase, the patient's own included. Shown at once; put
// back if the save fails.
export function setPhaseStatus(id) {
  var me = state.myProfile;
  var before = { phase: me.currentPhase || null, at: me.currentPhaseAt || 0 };
  function apply(phase, at) {
    me.currentPhase = phase;
    me.currentPhaseAt = at;
    if (state.members[state.uid]) {
      state.members[state.uid].currentPhase = phase;
      state.members[state.uid].currentPhaseAt = at;
    }
    state.activePhase = effectivePhase();
  }
  var at = Date.now();
  statusError = "";
  apply(id, at);
  render();
  Backend.setPhaseStatus(state.uid, id, at).catch(function(){
    apply(before.phase, before.at);
    statusError = "Couldn't share your status — check your connection and try again.";
    render();
  });
}

// Under the phase filter: the patient's own status picker, and for everyone
// whose filter has moved away from the current status, a way back to it.
// Nothing at all for a member while no status is set.
export function renderPhaseStatus() {
  var me = state.myProfile;
  var isPatient = !!me && me.role === "patient";
  var status = phaseStatus();
  if (!isPatient && !status) return null;

  var box = el("div", { class: "phase-status" });
  var showBtn = status && state.activePhase !== status.phase
    ? el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Show", on: { click: function(){ setActivePhase(status.phase); } } })
    : null;
  var mine = status && status.member.id === state.uid;

  if (isPatient) {
    var select = el("select", { attrs: { "aria-label": "How I'm doing" } });
    var myPhase = me.currentPhase || "";
    if (!myPhase) select.appendChild(el("option", { text: "Not set", attrs: { value: "", disabled: "" } }));
    PHASES.forEach(function(p){ select.appendChild(el("option", { text: p.label, attrs: { value: p.id } })); });
    select.value = myPhase;
    select.addEventListener("change", function(e){ setPhaseStatus(e.target.value); });
    box.appendChild(el("div", { class: "phase-status-row" }, [
      el("span", { class: "lbl-inline", text: "How I'm doing" }),
      el("span", { class: "phase-status-select" }, [select]),
      myPhase ? el("span", { class: "phase-status-since", text: "since " + sinceLabel(me.currentPhaseAt) }) : null
    ]));
  }

  // Another patient's status, or one's own when the filter has moved off it.
  if (status && (!mine || showBtn)) {
    var who = mine ? "Your status" : status.member.name.split(" ")[0];
    box.appendChild(el("div", { class: "phase-status-row phase-status-hint" }, [
      el("span", { class: "phase-status-dot", style: "background:" + PHASE_MAP[status.phase].color }),
      el("span", { text: who + ": " + PHASE_MAP[status.phase].short + " · since " + sinceLabel(status.at) }),
      showBtn
    ]));
  }

  if (statusError) box.appendChild(el("div", { class: "form-error", style: "margin:6px 0 0;", text: statusError }));
  return box;
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
