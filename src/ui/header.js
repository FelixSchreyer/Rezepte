// Sticky top bar: brand, "Add recipe" action and the avatar that opens the
// account panel. Anything waiting in that panel (recipes to rate, access
// requests) shows as one badge on the avatar.

import { state } from "../state.js";
import { el, initials } from "../lib/dom.js";
import { openAddRecipe, openAccount } from "./modal.js";
import { accountBadgeCount } from "./account.js";

export function renderProfileChip() {
  var me = state.myProfile;
  if (!me) return el("span");
  var count = accountBadgeCount();
  var label = "Account" + (count ? " — " + count + " waiting for you" : "");
  return el("button", {
    class: "profile-chip", attrs: { type: "button", "aria-label": label, title: label },
    on: { click: function(){ openAccount("menu"); } }
  }, [
    el("span", { class: "dot", text: initials(me.name) }),
    el("span", { class: "who" }, [
      document.createTextNode(me.name),
      el("span", { class: "role", text: me.role === "patient" ? "Patient" : "Member" })
    ]),
    count ? el("span", { class: "icon-badge", attrs: { "aria-hidden": "true" }, text: count > 9 ? "9+" : String(count) }) : null
  ]);
}

export function renderHeader() {
  return el("header", { class: "top" }, [
    el("div", { class: "top-row" }, [
      el("div", { class: "brand" }, [
        el("h1", { text: "Gut & Grain" }),
        el("span", { class: "tag", text: "your family's IBD-friendly recipe box" })
      ]),
      el("div", { class: "top-actions" }, [
        el("button", { class: "btn btn-primary add-btn", attrs: { type: "button", "aria-label": "Add recipe" }, on: { click: openAddRecipe } }, [
          document.createTextNode("+"),
          el("span", { class: "btn-label", text: " Add recipe" })
        ]),
        renderProfileChip()
      ])
    ])
  ]);
}
