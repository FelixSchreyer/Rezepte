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

export function closeModal() { state.modal = null; render(); }

export function openAddRecipe() {
  state.modal = { type: "add", title: "", phases: {}, tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", filling: false, filled: false, fillError: "" };
  render();
}
export function openDetail(recipeId) {
  state.modal = { type: "detail", recipeId: recipeId, ratingStars: 0, ratingTol: "", ratingComment: "" };
  render();
}
// The account panel: a menu plus the pages it drills into — "menu",
// "ratings", "members" or "details". name/role are the details form's draft.
export function openAccount(view) {
  var me = state.myProfile || {};
  state.modal = { type: "account", view: view || "menu", name: me.name || "", role: me.role || "", error: "" };
  render();
}

export function renderModal() {
  var m = state.modal;
  var centered = (m.type === "onboarding");
  var overlay = el("div", { class: "overlay show", attrs: { role: "dialog", "aria-modal": "true" }, on: { click: function(e){ if (e.target === overlay && m.type !== "onboarding") closeModal(); } } });
  var panel = el("div", { class: "panel" + (centered ? " center" : "") });
  if (m.type === "onboarding") panel.appendChild(renderOnboardingForm(m));
  else if (m.type === "add") panel.appendChild(renderAddForm(m));
  else if (m.type === "detail") panel.appendChild(renderDetail(m));
  else if (m.type === "account") panel.appendChild(renderAccount(m));
  overlay.appendChild(panel);
  return overlay;
}

export function renderModalInPlace() {
  var oldOverlay = root.querySelector(".overlay");
  var newOverlay = renderModal();
  if (oldOverlay) oldOverlay.replaceWith(newOverlay); else root.appendChild(newOverlay);
}
