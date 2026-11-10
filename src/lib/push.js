// Web push for the daily check-in reminder: is it possible on this device,
// is it on, and turning it on and off. The sending side is the daily-checkin
// Edge Function; sw.js shows what it sends.
//
// On an iPhone, web push only exists for a web app opened from the Home
// Screen (iOS 16.4+), and the permission prompt only appears in answer to a
// tap — so subscribe() must be the first thing a click handler calls.

import { VAPID_PUBLIC_KEY } from "../config.js";

export function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

// iPadOS reports itself as a Mac, but a Mac has no touch screen.
function isIos() {
  return /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// "ok" | "unconfigured" (no VAPID key in config.js) | "install" (iOS, not
// from the Home Screen) | "unsupported" | "denied" (blocked in settings)
export function pushAvailability() {
  if (!VAPID_PUBLIC_KEY) return "unconfigured";
  if (isIos() && !isStandalone()) return "install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  var reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function base64UrlToBytes(s) {
  var b64 = (s + "===".slice((s.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  var raw = atob(b64);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Asks for permission, registers sw.js and subscribes. Resolves with what
// Backend.savePushSubscription() stores; rejects with .code "denied" when
// the person said no.
export async function subscribe() {
  var permission = await Notification.requestPermission();
  if (permission !== "granted") {
    var err = new Error("notifications not allowed");
    err.code = "denied";
    throw err;
  }
  var reg = await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  var sub = await reg.pushManager.getSubscription() ||
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) });
  var json = sub.toJSON();
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin"
  };
}

// Resolves with the endpoint that was switched off, or null if none was on.
export async function unsubscribe() {
  var sub = await currentSubscription();
  if (!sub) return null;
  var endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

// cb(day) when the reminder is tapped while the app is already open.
export function onReminderTap(cb) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", function (e) {
    if (e.data && e.data.type === "checkin") cb(e.data.day);
  });
}
