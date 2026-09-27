// Sticky top bar: brand, "Add recipe" action, the members button (admins
// only), the notification bell (patients only) and the profile chip.

import { state } from "../state.js";
import { el, initials } from "../lib/dom.js";
import { pendingRatings } from "../lib/recipes.js";
import { isAdmin, pendingMembers } from "../lib/members.js";
import { openOnboarding, openAddRecipe, openNotifications, openMembers } from "./modal.js";

var MEMBERS_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

var BELL_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';

// Round icon button with an optional count badge.
function iconButton(cls, svg, count, label, onClick) {
  var icon = el("span", { class: "icon-btn-icon", attrs: { "aria-hidden": "true" } });
  icon.innerHTML = svg;
  return el("button", {
    class: "icon-btn " + cls, attrs: { type: "button", "aria-label": label, title: label },
    on: { click: onClick }
  }, [
    icon,
    count ? el("span", { class: "icon-badge", attrs: { "aria-hidden": "true" }, text: count > 9 ? "9+" : String(count) }) : null
  ]);
}

export function renderBell() {
  if (!state.myProfile || state.myProfile.role !== "patient") return null;
  var count = pendingRatings().length;
  var label = count ? count + " new recipe" + (count > 1 ? "s" : "") + " to rate" : "No new recipes to rate";
  return iconButton("bell", BELL_SVG, count, label, openNotifications);
}

export function renderMembersButton() {
  if (!isAdmin()) return null;
  var count = pendingMembers().length;
  var label = count ? count + " access request" + (count > 1 ? "s" : "") : "Members";
  return iconButton("members-btn", MEMBERS_SVG, count, label, openMembers);
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
        renderMembersButton(),
        renderBell(),
        chip
      ])
    ])
  ]);
}
