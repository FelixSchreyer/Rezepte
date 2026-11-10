// Modal plumbing: which modal is open (`state.modal`), the overlay/panel
// shell, and renderModalInPlace() for updates that must not disturb focus
// or scroll position in the rest of the page.

import { root, state } from "../state.js";
import { el } from "../lib/dom.js";
import { render } from "./app.js";
import { renderOnboardingForm } from "./onboarding.js";
import { renderAddForm } from "./add-recipe.js";
import { renderDetail } from "./detail.js";
import { renderAccount } from "./account.js";
import { renderShopping } from "./shopping.js";
import { renderCheckin } from "./checkin.js";
import { attachSwipeBack } from "./navigation.js";
import { recipePhases } from "../lib/recipes.js";
import { dayKey, isDayKey } from "../lib/checkins.js";

// Editing a recipe sits on top of its detail panel, so closing it goes back
// there rather than to the recipes.
export function closeModal() {
  var m = state.modal;
  if (m && m.type === "add" && m.editId) { openDetail(m.editId); return; }
  state.modal = null;
  render();
}

export function openAddRecipe() {
  state.modal = { type: "add", title: "", phase: "", tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", servings: "2", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [], filling: false, filled: false, fillError: "" };
  render();
}
// The add form, filled in from a saved recipe. `editId` switches it to
// editing: no quick fill or photo (the photo is changed on the recipe
// itself), and saving or closing returns to the recipe.
export function openEditRecipe(recipeId) {
  var r = state.recipes.find(function(x){ return x.id === recipeId; });
  if (!r) return;
  var tags = {};
  (r.tags || []).forEach(function(t){ tags[t] = true; });
  state.modal = {
    type: "add", editId: r.id,
    title: r.title || "", phase: recipePhases(r)[0] || "", tags: tags, customTagInput: "",
    ingredients: (r.ingredients || []).join("\n"), instructions: r.instructions || "",
    prepMinutes: r.prepMinutes ? String(r.prepMinutes) : "", servings: String(r.servings || 2),
    photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [], filling: false, filled: false, fillError: ""
  };
  render();
}
export function openDetail(recipeId) {
  state.modal = { type: "detail", recipeId: recipeId, ratingStars: 0, ratingTol: "", ratingComment: "" };
  render();
}
export function openShopping() {
  state.modal = { type: "shopping", error: "", tidying: false, confirmClear: false };
  render();
}

// "How are you today?" for `day` (a dayKey; today when missing, malformed
// or in the future — the reminder link carries it, see sw.js).
export function openCheckin(day) {
  var today = dayKey(Date.now());
  state.modal = { type: "checkin", day: isDayKey(day) && day <= today ? day : today, saving: "", error: "" };
  render();
}

// The account panel: a menu plus the pages it drills into — "menu",
// "ratings", "members", "details" or "reminder". name/role are the details form's draft.
export function openAccount(view) {
  var me = state.myProfile || {};
  state.modal = { type: "account", view: view || "menu", name: me.name || "", role: me.role || "", error: "" };
  render();
}

export function renderModal() {
  var m = state.modal;
  var centered = (m.type === "onboarding");
  var overlay = el("div", { class: "overlay show", attrs: { role: "dialog", "aria-modal": "true" }, on: { click: function(e){ if (e.target === overlay && m.type !== "onboarding") closeModal(); } } });
  overlay.dataset.key = modalKey(m);
  var panel = el("div", { class: "panel" + (centered ? " center" : "") });
  if (!centered) attachSwipeBack(panel);
  if (m.type === "onboarding") panel.appendChild(renderOnboardingForm(m));
  else if (m.type === "add") panel.appendChild(renderAddForm(m));
  else if (m.type === "detail") panel.appendChild(renderDetail(m));
  else if (m.type === "account") panel.appendChild(renderAccount(m));
  else if (m.type === "shopping") panel.appendChild(renderShopping(m));
  else if (m.type === "checkin") panel.appendChild(renderCheckin(m));
  overlay.appendChild(panel);
  return overlay;
}

// Which panel is showing: the same key means the same panel, just updated
// (a star tapped, a rating saved and synced back). A different key is a new
// panel — another recipe, another account page — which starts at the top.
function modalKey(m) {
  return m.type + ":" + (m.recipeId || m.editId || m.view || m.day || "");
}

// Re-rendering the same panel must not look like opening it again: no
// slide-in animation (a flicker on every tap) and no jump back to the top.
// Both render() and renderModalInPlace() take a snapshot of the open panel
// before tearing it down (a detached panel reports scrollTop 0) and hand it
// to restoreModal() once the new one is in the page.
export function snapshotModal() {
  var overlay = root.querySelector(".overlay");
  var panel = overlay && overlay.querySelector(".panel");
  return panel ? { key: overlay.dataset.key, scrollTop: panel.scrollTop } : null;
}

export function restoreModal(snap) {
  var overlay = root.querySelector(".overlay");
  var panel = overlay && overlay.querySelector(".panel");
  if (!snap || !panel || overlay.dataset.key !== snap.key) return;
  panel.classList.add("settled");
  panel.scrollTop = snap.scrollTop;
}

export function renderModalInPlace() {
  var snap = snapshotModal();
  var oldOverlay = root.querySelector(".overlay");
  var newOverlay = renderModal();
  if (oldOverlay) oldOverlay.replaceWith(newOverlay); else root.appendChild(newOverlay);
  restoreModal(snap);
}
