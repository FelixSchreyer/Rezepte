// The patient's daily check-in: "How are you today?" with three answers.
// One tap saves and closes; opening it again shows the answer, which can be
// changed. Reached from the reminder (push, see sw.js) or the account panel.

import { CHECKIN_STATES } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { checkinFor, cookedOn, dayKey, shiftDay } from "../lib/checkins.js";
import { Backend } from "../backend/index.js";
import { closeModal, renderModalInPlace } from "./modal.js";

function question(day) {
  var today = dayKey(Date.now());
  if (day === today) return "How are you today?";
  if (day === shiftDay(today, -1)) return "How were you yesterday?";
  var p = day.split("-").map(Number);
  return "How were you on " + new Date(p[0], p[1] - 1, p[2]).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }) + "?";
}

export function renderCheckin(m) {
  var wrap = el("div");
  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("h2", { text: question(m.day) }),
    el("button", { class: "close-x", attrs: { type: "button", "aria-label": "Close" }, text: "✕", on: { click: closeModal } })
  ]));

  var mine = checkinFor(state.uid, m.day);
  var chosen = m.saving || (mine && mine.state) || "";
  var choices = el("div", { class: "checkin-choices", attrs: { role: "radiogroup", "aria-label": question(m.day) } });
  CHECKIN_STATES.forEach(function(s){
    var b = el("button", {
      class: "checkin-choice", attrs: { type: "button", role: "radio", "aria-checked": String(chosen === s.id) },
      on: { click: function(){ if (!m.saving) save(m, s.id); } }
    }, [
      el("span", { class: "emoji", attrs: { "aria-hidden": "true" }, text: s.emoji }),
      el("span", { class: "label", text: s.label })
    ]);
    b.dataset.on = String(chosen === s.id);
    choices.appendChild(b);
  });
  wrap.appendChild(choices);
  if (m.error) wrap.appendChild(el("div", { class: "form-error", style: "margin:10px 0 0;", text: m.error }));

  // For context only: what the family marked as cooked that day.
  var cooked = cookedOn(m.day);
  wrap.appendChild(el("p", { class: "checkin-cooked", text: cooked.length
    ? "Cooked that day: " + cooked.map(function(r){ return r.title; }).join(", ")
    : "Nothing marked as cooked that day." }));

  // Forgot yesterday? It can still be added the next day.
  var yesterday = shiftDay(dayKey(Date.now()), -1);
  if (m.day !== yesterday && !checkinFor(state.uid, yesterday)) {
    wrap.appendChild(el("button", { class: "link-btn checkin-other", attrs: { type: "button" }, text: "Check in for yesterday", on: { click: function(){
      m.day = yesterday; m.error = ""; renderModalInPlace();
    } } }));
  }
  return wrap;
}

function save(m, id) {
  m.saving = id;
  m.error = "";
  renderModalInPlace();
  var me = state.myProfile || {};
  Backend.saveCheckin(state.uid, m.day, id, me.currentPhase || null).then(function(){
    if (state.modal === m) closeModal();
  }).catch(function(){
    m.saving = "";
    m.error = "Couldn't save — check your connection and try again.";
    if (state.modal === m) renderModalInPlace();
  });
}
