// Full-screen states shown instead of the app: connecting, connection
// failed, and the two "signed in but not let in" states.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { retryInit, signOut } from "../boot.js";

export function renderCapsMissing() {
  return el("div", { class: "center-screen" }, [
    el("div", { class: "box" }, [
      el("h2", { text: "Couldn't connect" }),
      el("p", { text: "Gut & Grain couldn't reach its database. Check your internet connection, or try reloading the page." }),
      el("button", { class: "btn btn-primary", style: "margin-top:16px;", attrs: { type: "button" }, text: "Try again", on: { click: retryInit } })
    ])
  ]);
}

export function renderLoading() {
  var box = el("div", { class: "box" }, [
    el("h2", { text: "Setting the table…" }),
    el("p", { text: "Connecting to your shared recipe box." })
  ]);
  if (state.slowLoad) {
    box.appendChild(el("p", { style: "margin-top:10px;", text: "This is taking longer than expected." }));
    box.appendChild(el("button", { class: "btn btn-primary", style: "margin-top:6px;", attrs: { type: "button" }, text: "Try again", on: { click: retryInit } }));
  }
  return el("div", { class: "center-screen" }, [box]);
}

function signOutButton() {
  return el("button", { class: "btn", style: "margin-top:16px;", attrs: { type: "button" }, text: "Sign out", on: { click: signOut } });
}

// Signed up, profile saved, not yet let in. Switches to the app by itself
// the moment an admin approves (the members subscription delivers it).
export function renderPending() {
  return el("div", { class: "center-screen" }, [
    el("div", { class: "box" }, [
      el("h2", { text: "Waiting for approval" }),
      el("p", { text: "Thanks, " + state.myProfile.name + ". An admin needs to let you in before you can see the recipe box. This page opens by itself once they have." }),
      el("p", { class: "muted-small", text: "Signed in as " + state.myProfile.email }),
      signOutButton()
    ])
  ]);
}

export function renderRejected() {
  return el("div", { class: "center-screen" }, [
    el("div", { class: "box" }, [
      el("h2", { text: "No access" }),
      el("p", { text: "An admin hasn't given this account access to the recipe box. If you think that's a mistake, ask them directly." }),
      el("p", { class: "muted-small", text: "Signed in as " + state.myProfile.email }),
      signOutButton()
    ])
  ]);
}
