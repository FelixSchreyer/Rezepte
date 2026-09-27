// Sticky top bar: brand, "Add recipe" action, the shopping list (with how
// many recipes are on it) and the avatar that opens the account panel.
// Anything waiting in that panel (recipes to rate, access requests) shows
// as one badge on the avatar.

import { state } from "../state.js";
import { el, initials } from "../lib/dom.js";
import { openAddRecipe, openAccount, openShopping } from "./modal.js";
import { accountBadgeCount } from "./account.js";

var CART_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>';

export function renderCartButton() {
  var count = state.shopping.filter(function(s){
    return state.recipes.some(function(r){ return r.id === s.recipeId; });
  }).length;
  var label = "Shopping list" + (count ? " — " + count + " recipe" + (count > 1 ? "s" : "") : "");
  var icon = el("span", { class: "cart-icon", attrs: { "aria-hidden": "true" } });
  icon.innerHTML = CART_SVG;
  return el("button", {
    class: "cart-btn", attrs: { type: "button", "aria-label": label, title: label },
    on: { click: openShopping }
  }, [
    icon,
    count ? el("span", { class: "cart-count", attrs: { "aria-hidden": "true" }, text: count > 9 ? "9+" : String(count) }) : null
  ]);
}

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
        renderCartButton(),
        renderProfileChip()
      ])
    ])
  ]);
}
