// "Daily reminder" page of the account panel (patients only): when the
// check-in question comes, and push notifications on this device.
//
// The time is stored on the patient's members row, so it holds on every
// device and also decides when the in-app reminder (the dot on the avatar)
// appears. Push is per device: a subscription lives in the browser, and
// push_subscriptions holds where to send it.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { checkinTime } from "../lib/checkins.js";
import { currentSubscription, pushAvailability, subscribe, unsubscribe } from "../lib/push.js";
import { Backend } from "../backend/index.js";
import { renderModalInPlace } from "./modal.js";

var UNAVAILABLE = {
  unconfigured: "Notifications aren't set up for this app yet. Until they are, the dot on your avatar reminds you.",
  install: "On iPhone, notifications only work when Gut & Grain is opened from the Home Screen: tap Share → Add to Home Screen, open it from there, and come back to this page.",
  unsupported: "This browser can't show notifications. The dot on your avatar still reminds you.",
  denied: "Notifications are blocked for this app. Allow them in the device's settings (Settings → Notifications → Gut & Grain), then come back here."
};

export function renderReminder(m) {
  var wrap = el("div");
  wrap.appendChild(el("p", { class: "reminder-lede", text: "Once a day you're asked how you're doing — one tap answers it. Over a few weeks, that shows what agrees with you." }));

  var time = el("input", { class: "reminder-time", attrs: { type: "time" } });
  time.value = checkinTime();
  time.addEventListener("change", function(e){
    var v = e.target.value;
    if (!/^\d{2}:\d{2}$/.test(v)) return;
    m.error = "";
    Backend.setCheckinTime(state.uid, v).catch(function(){
      m.error = "Couldn't save the time — check your connection.";
      if (state.modal === m) renderModalInPlace();
    });
  });
  wrap.appendChild(el("label", { class: "field" }, [ el("span", { class: "lbl", text: "Ask me at" }), time ]));

  wrap.appendChild(el("h4", { class: "reminder-h", text: "Notifications on this device" }));
  wrap.appendChild(renderPushControl(m));
  if (m.error) wrap.appendChild(el("div", { class: "form-error", style: "margin:10px 0 0;", text: m.error }));
  return wrap;
}

function renderPushControl(m) {
  var avail = pushAvailability();
  if (avail !== "ok") return el("p", { class: "reminder-note", text: UNAVAILABLE[avail] });

  // Whether this device is subscribed is only known asynchronously.
  if (m.pushOn === undefined) {
    if (!m.pushChecking) {
      m.pushChecking = true;
      currentSubscription().then(function(sub){ m.pushOn = !!sub; }, function(){ m.pushOn = false; }).then(function(){
        if (state.modal === m) renderModalInPlace();
      });
    }
    return el("p", { class: "reminder-note", text: "Checking…" });
  }

  var box = el("div", { class: "reminder-push" });
  box.appendChild(el("p", { class: "reminder-note", text: m.pushOn
    ? "On — a notification comes at the time above, unless you've already checked in."
    : "Off — the dot on your avatar still reminds you when the app is open." }));
  box.appendChild(el("button", {
    class: "btn btn-block" + (m.pushOn ? "" : " btn-primary"),
    attrs: m.pushBusy ? { type: "button", disabled: "" } : { type: "button" },
    text: m.pushBusy ? "One moment…" : (m.pushOn ? "Turn off notifications" : "Turn on notifications"),
    on: { click: function(){ if (!m.pushBusy) (m.pushOn ? turnOff : turnOn)(m); } }
  }));
  return box;
}

function turnOn(m) {
  // subscribe() asks for permission first — still inside the tap, as iOS
  // requires — so it is called before anything else happens.
  var pending = subscribe();
  m.pushBusy = true;
  m.error = "";
  renderModalInPlace();
  pending.then(function(sub){
    return Backend.savePushSubscription(state.uid, sub);
  }).then(function(){
    m.pushOn = true;
  }).catch(function(e){
    m.error = e && e.code === "denied"
      ? "Notifications weren't allowed. You can allow them in the device's settings."
      : "Couldn't turn notifications on — check your connection and try again.";
  }).then(function(){
    m.pushBusy = false;
    if (state.modal === m) renderModalInPlace();
  });
}

function turnOff(m) {
  m.pushBusy = true;
  m.error = "";
  renderModalInPlace();
  unsubscribe().then(function(endpoint){
    m.pushOn = false;
    // Gone from the browser either way; a leftover row is cleaned up by the
    // Edge Function the first time sending to it fails.
    if (endpoint) return Backend.deletePushSubscription(endpoint).catch(function(){});
  }).catch(function(){
    m.error = "Couldn't turn notifications off — try again.";
  }).then(function(){
    m.pushBusy = false;
    if (state.modal === m) renderModalInPlace();
  });
}
