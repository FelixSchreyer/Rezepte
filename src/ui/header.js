// Sticky top bar: brand, "Add recipe" action and the profile chip.

import { state } from "../state.js";
import { el, initials } from "../lib/dom.js";
import { openOnboarding, openAddRecipe } from "./modal.js";

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
        chip
      ])
    ])
  ]);
}
