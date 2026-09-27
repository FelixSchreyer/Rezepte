// First-run (and later "Your details") form: name + role.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { Backend } from "../backend/index.js";
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
    wrap.appendChild(el("p", { style: "color:var(--ink-soft); font-size:14px; margin-top:-8px;", text: "Tell us who's cooking, so ratings and recipes carry a name." }));
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
    text: state.myProfile ? "Save changes" : "Start cooking",
    on: { click: function(){ submitOnboarding(m); } }
  }));
  return wrap;
}

export function submitOnboarding(m) {
  var name = m.name.trim();
  if (!name) { m.error = "Please enter a name."; renderModalInPlace(); return; }
  if (!m.role) { m.error = "Please choose a role."; renderModalInPlace(); return; }
  m.error = "";
  var profile = { name: name, role: m.role, joinedAt: (state.myProfile && state.myProfile.joinedAt) || Date.now() };
  Backend.saveProfile(state.uid, profile).then(function(){
    state.myProfile = profile;
    closeModal();
  }).catch(function(){
    m.error = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
