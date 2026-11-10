// Derived views over what was cooked when (state.cookEvents) and how the
// patient was doing each day (state.checkins). Read-only, no DOM.
//
// Days are the device's local calendar date as "YYYY-MM-DD" — what the
// patient means by "today" — and times are Date.now() milliseconds, like
// every other timestamp in the app.

import { state } from "../state.js";
import { DEFAULT_CHECKIN_TIME } from "../config.js";

function pad(n) { return (n < 10 ? "0" : "") + n; }

export function dayKey(ts) {
  var d = new Date(ts);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

// dayKey of the day `n` days after `day` (negative goes back).
export function shiftDay(day, n) {
  var p = day.split("-").map(Number);
  return dayKey(new Date(p[0], p[1] - 1, p[2] + n, 12).getTime());
}

export function isDayKey(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// <input type="datetime-local"> speaks "YYYY-MM-DDTHH:MM" in local time.
// Parsed by hand: older Safari read that format as UTC.
export function toLocalInput(ts) {
  var d = new Date(ts);
  return dayKey(ts) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

export function fromLocalInput(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s || "");
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
}

function at(day, hours, minutes) {
  var p = day.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2], hours, minutes).getTime();
}

// One-tap answers for "when was it cooked?", newest first; only ones in
// the past.
export function quickCookTimes(now) {
  var today = dayKey(now);
  var yesterday = shiftDay(today, -1);
  return [
    { label: "Today, lunch", at: at(today, 12, 30) },
    { label: "Yesterday, dinner", at: at(yesterday, 19, 0) },
    { label: "Yesterday, lunch", at: at(yesterday, 12, 30) }
  ].filter(function (q) { return q.at <= now; });
}

export function lastCooked(recipeId) {
  var best = null;
  state.cookEvents.forEach(function (c) {
    if (c.recipeId === recipeId && (!best || c.cookedAt > best.cookedAt)) best = c;
  });
  return best;
}

// The recipes cooked on a day, earliest first, each once.
export function cookedOn(day) {
  var seen = {};
  return state.cookEvents
    .filter(function (c) { return dayKey(c.cookedAt) === day; })
    .sort(function (a, b) { return a.cookedAt - b.cookedAt; })
    .map(function (c) { return state.recipes.find(function (r) { return r.id === c.recipeId; }); })
    .filter(function (r) {
      if (!r || seen[r.id]) return false;
      seen[r.id] = true;
      return true;
    });
}

export function checkinFor(uid, day) {
  return state.checkins.find(function (c) { return c.uid === uid && c.day === day; }) || null;
}

export function isPatient() {
  var me = state.myProfile;
  return !!me && me.status === "approved" && me.role === "patient";
}

// "HH:MM" — when this patient's reminder goes out.
export function checkinTime() {
  var t = state.myProfile && state.myProfile.checkinTime;
  return /^\d{2}:\d{2}$/.test(t || "") ? t : DEFAULT_CHECKIN_TIME;
}

// The in-app reminder: a patient, past their reminder time, with no
// check-in for today yet.
export function checkinDue(now) {
  if (!isPatient()) return false;
  var d = new Date(now);
  var t = checkinTime().split(":").map(Number);
  if (d.getHours() * 60 + d.getMinutes() < t[0] * 60 + t[1]) return false;
  return !checkinFor(state.uid, dayKey(now));
}
