// "Back" for the panels: one step up from wherever you are — an account
// sub-page goes to the account menu, any other panel closes to the recipes.
//
// Two ways in:
//
// 1. Browser history. Every open panel (and account sub-page) is one history
//    entry, so the system back gesture in Safari, Android's back button and
//    the desktop back button step back through panels instead of leaving the
//    app. syncHistory() runs after each render and pushes or pops entries
//    until their number matches how deep the UI is.
//
// 2. A swipe to the right on the panel, for the home-screen web app, where
//    iOS has no back gesture of its own. The panel follows the finger and
//    either slides away or springs back.

import { state } from "../state.js";
import { render } from "./app.js";
import { closeModal } from "./modal.js";

// How many "back" steps the current UI has.
function depth() {
  var m = state.modal;
  if (!m || m.type === "onboarding") return 0;   // onboarding can't be left
  if (m.type === "account" && m.view && m.view !== "menu") return 2;
  return 1;
}

export function goBack() {
  var m = state.modal;
  if (!m || m.type === "onboarding") return;
  if (m.type === "account" && m.view && m.view !== "menu") {
    m.view = "menu";
    m.error = "";
    render();
    return;
  }
  closeModal();
}

// ---------------- 1. browser history ----------------

var enabled = false;     // only the real app, not the test page
var pushed = 0;          // history entries we currently own
var ignorePops = 0;      // pops we caused ourselves, via history.go()

export function enableHistory() {
  enabled = true;
  window.addEventListener("popstate", function () {
    if (ignorePops > 0) { ignorePops--; return; }
    if (pushed > 0) pushed--;
    goBack();
  });
}

export function syncHistory() {
  if (!enabled) return;
  var want = depth();
  while (pushed < want) {
    history.pushState({ gutAndGrain: pushed + 1 }, "");
    pushed++;
  }
  if (pushed > want) {
    // Closed from inside the app (✕, Save, "‹ Back"): drop our entries, so
    // the next system back doesn't land on a panel that is already gone.
    var n = pushed - want;
    ignorePops++;
    pushed = want;
    history.go(-n);
  }
}

// ---------------- 2. swipe right ----------------

var START_SLOP = 10;       // px before deciding between swipe and scroll
var DISTANCE = 90;         // px to the right that counts as "back"
var SPEED = 0.5;           // px/ms that counts as a flick
var EDGE = 24;             // px at the left edge left to Safari's own gesture

function isStandalone() {
  return window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
}

function startsInField(target) {
  return !!(target.closest && target.closest("input, textarea, select, [contenteditable]"));
}

export function attachSwipeBack(panel) {
  var startX = 0, startY = 0, startT = 0, dx = 0;
  var mode = null;   // null = undecided, "swipe", "scroll"

  panel.addEventListener("touchstart", function (e) {
    mode = "scroll";
    if (e.touches.length !== 1 || depth() === 0 || startsInField(e.target)) return;
    var t = e.touches[0];
    // In the browser, Safari's edge swipe already means back (via history).
    if (!isStandalone() && t.clientX < EDGE) return;
    startX = t.clientX; startY = t.clientY; startT = Date.now(); dx = 0;
    mode = null;
  }, { passive: true });

  panel.addEventListener("touchmove", function (e) {
    if (mode === "scroll") return;
    var t = e.touches[0];
    var mx = t.clientX - startX, my = t.clientY - startY;
    if (mode === null) {
      if (Math.abs(mx) < START_SLOP && Math.abs(my) < START_SLOP) return;
      mode = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.5) ? "swipe" : "scroll";
      if (mode === "scroll") return;
      panel.classList.add("dragging");
    }
    e.preventDefault();   // no vertical scroll while swiping sideways
    dx = Math.max(0, mx);
    panel.style.transform = "translateX(" + dx + "px)";
  }, { passive: false });

  function end() {
    if (mode !== "swipe") { mode = null; return; }
    mode = null;
    panel.classList.remove("dragging");
    var fast = dx / Math.max(1, Date.now() - startT) > SPEED && dx > 30;
    if (dx < DISTANCE && !fast) {
      panel.style.transform = "";   // spring back (CSS transition)
      return;
    }
    if (depth() === 1) {
      // Closing: let the panel slide off first, then go.
      panel.style.transform = "translateX(100%)";
      setTimeout(goBack, 180);
    } else {
      panel.style.transform = "";
      goBack();
    }
  }
  panel.addEventListener("touchend", end);
  panel.addEventListener("touchcancel", end);
}
