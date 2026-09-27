// Sticky top bar: brand, "Add recipe" action, the notification bell
// (patients only) and the profile chip.

import { state } from "../state.js";
import { el, initials } from "../lib/dom.js";
import { pendingRatings } from "../lib/recipes.js";
import { openOnboarding, openAddRecipe, openNotifications } from "./modal.js";

var BELL_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

export function renderBell() {
  if (!state.myProfile || state.myProfile.role !== "patient") return null;
  var count = pendingRatings().length;
  var label = count ? count + " new recipe" + (count > 1 ? "s" : "") + " to rate" : "No new recipes to rate";
  var icon = el("span", { class: "bell-icon", attrs: { "aria-hidden": "true" } });
  icon.innerHTML = BELL_SVG;
  return el("button", {
    class: "bell", attrs: { type: "button", "aria-label": label, title: label },
    on: { click: openNotifications }
  }, [
    icon,
    count ? el("span", { class: "bell-badge", attrs: { "aria-hidden": "true" }, text: count > 9 ? "9+" : String(count) }) : null
  ]);
}

export function renderHeader() {
  var chip;
  if (state.myProfile) {
    chip = el("button", { class: "profile-chip", attrs: { type: "button" }, on: { click: function(){ openOnboarding(state.myProfile); } } }, [
      el("span", { class: "dot", text: initials(state.myProfile.name) }),
      el("span", { class: "who" }, [
        document.createTextNode(state.myProfile.name),
        el("span", { class: "role", text: state.myProfile.role === "patient" ? "Patient" : "Member" })
      ])
    ]);
  } else {
    chip = el("span");
  }

  return el("header", { class: "top" }, [
    el("div", { class: "top-row" }, [
      el("div", { class: "brand" }, [
        el("h1", { text: "Gut & Grain" }),
        el("span", { class: "tag", text: "your family's IBD-friendly recipe box" })
      ]),
      el("div", { class: "top-actions" }, [
        el("button", { class: "btn btn-primary", attrs: { type: "button" }, text: "+ Add recipe", on: { click: openAddRecipe } }),
        renderBell(),
        chip
      ])
    ])
  ]);
}
