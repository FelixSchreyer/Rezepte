// First-run (and later "Your details") form: name + role. On first run it
// creates the pending members row that an admin then approves.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { Backend } from "../backend/index.js";
import { signOut } from "../boot.js";
import { closeModal, renderModalInPlace } from "./modal.js";

export function renderOnboardingForm(m) {
  var wrap = el("div");
  var canDismiss = !!state.myProfile;
  var head = el("div", { class: "panel-head" }, [
    el("h2", { text: state.myProfile ? "Your details" : "Welcome to Gut & Grain" }),
    canDismiss ? el("button", { class: "close-x", attrs: { "aria-label": "Close" }, text: "✕", on: { click: closeModal } }) : null
  ]);
  wrap.appendChild(head);
  if (!state.myProfile) {
    wrap.appendChild(el("p", { style: "color:var(--ink-soft); font-size:14px; margin-top:-8px;", text: "Tell us who's cooking. An admin sees this when deciding to let you in." }));
  }

  var nameField = el("label", { class: "field" }, [
    el("span", { class: "lbl", text: "Your name" })
  ]);
  var nameInput = el("input", { attrs: { type: "text", placeholder: "e.g. Alex" } });
  nameInput.value = m.name;
  nameInput.addEventListener("input", function(e){ m.name = e.target.value; });
  nameField.appendChild(nameInput);
  wrap.appendChild(nameField);

  var roleField = el("label", { class: "field" }, [
    el("span", { class: "lbl" }, [document.createTextNode("Your role "), el("span", { class: "hint", text: "— patients can rate recipes" })])
  ]);
  var roleGrid = el("div", { class: "check-grid" });
  [["member","Member"], ["patient","Patient"]].forEach(function(pair){
    var pill = el("label", { class: "check-pill" }, [
      el("input", { attrs: { type: "radio", name: "role" } }),
      document.createTextNode(pair[1])
    ]);
    var input = pill.querySelector("input");
    input.checked = m.role === pair[0];
    pill.dataset.checked = String(m.role === pair[0]);
    input.addEventListener("change", function(){ m.role = pair[0]; renderModalInPlace(); });
    roleGrid.appendChild(pill);
  });
  roleField.appendChild(roleGrid);
  wrap.appendChild(roleField);

  if (m.error) wrap.appendChild(el("div", { class: "form-error", text: m.error }));

  wrap.appendChild(el("button", {
    class: "btn btn-primary btn-block",
    attrs: { type: "button" },
    text: state.myProfile ? "Save changes" : "Request access",
    on: { click: function(){ submitOnboarding(m); } }
  }));
  wrap.appendChild(el("button", {
    class: "btn btn-ghost btn-block", style: "margin-top:8px;",
    attrs: { type: "button" }, text: "Sign out", on: { click: signOut }
  }));
  return wrap;
}

export function submitOnboarding(m) {
  var name = m.name.trim();
  if (!name) { m.error = "Please enter a name."; renderModalInPlace(); return; }
  if (!m.role) { m.error = "Please choose a role."; renderModalInPlace(); return; }
  m.error = "";
  var existing = state.myProfile;
  var save = existing
    ? Backend.saveProfile(state.uid, { name: name, role: m.role })
    : Backend.createProfile(state.uid, { name: name, role: m.role, joinedAt: Date.now() });
  save.then(function(){
    return Backend.fetchProfile(state.uid);
  }).then(function(profile){
    // A fresh row normally arrives through the members subscription too;
    // fetching it here means the pending screen does not wait on realtime.
    if (profile) state.myProfile = profile;
    closeModal();
  }).catch(function(){
    m.error = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
