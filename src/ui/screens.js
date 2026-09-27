// Full-screen fallback states shown instead of the app: connecting,
// connection failed, and (rarely) sign-in failed.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { retryInit } from "../boot.js";

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

// Only shown if the automatic, silent sign-in itself failed — normally
// nobody ever sees this screen.
export function renderSignInFailed() {
  return el("div", { class: "center-screen" }, [
    el("div", { class: "box" }, [
      el("h2", { text: "Couldn't sign you in" }),
      el("p", { text: "This usually means \"Anonymous sign-ins\" isn't turned on for the Supabase project yet (Authentication → Sign In / Providers → Anonymous Sign-Ins)." }),
      el("button", { class: "btn btn-primary", style: "margin-top:16px;", attrs: { type: "button" }, text: "Try again", on: { click: retryInit } })
    ])
  ]);
}
