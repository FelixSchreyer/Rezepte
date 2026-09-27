// Name + role form. Used twice: as the first-run onboarding modal, which
// creates the pending members row an admin then approves, and as the
// "Your details" page of the account panel (see account.js).

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { Backend } from "../backend/index.js";
import { signOut } from "../boot.js";
import { render } from "./app.js";
import { closeModal, renderModalInPlace } from "./modal.js";

// First run: cannot be dismissed, so it carries its own way out.
export function renderOnboardingForm(m) {
  var wrap = el("div");
  wrap.appendChild(el("div", { class: "panel-head" }, [ el("h2", { text: "Welcome to Gut & Grain" }) ]));
  wrap.appendChild(el("p", { style: "color:var(--ink-soft); font-size:14px; margin-top:-8px;", text: "Tell us who's cooking. An admin sees this when deciding to let you in." }));
  wrap.appendChild(renderProfileFields(m));
  wrap.appendChild(el("button", {
    class: "btn btn-ghost btn-block", style: "margin-top:8px;",
    attrs: { type: "button" }, text: "Sign out", on: { click: signOut }
  }));
  return wrap;
}

export function renderProfileFields(m) {
  var wrap = el("div");

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
    // From the account panel, go back to its menu; first run just closes.
    if (m.type === "account") { m.view = "menu"; m.error = ""; render(); }
    else closeModal();
  }).catch(function(){
    m.error = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
