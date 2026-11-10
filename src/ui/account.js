// The account panel behind the avatar: a settings-style menu of grouped rows
// that drills into pages inside the same panel, with a back button.
//
//   menu      who you are + the rows below
//   ratings   recipes waiting for your rating   (patients only)
//   reminder  daily check-in time + push        (patients only)
//   members   access requests + member list     (admins only)
//   details   name + role
//
// Rows only appear for people they apply to; the counts on them add up to
// the badge on the avatar (see accountBadgeCount()).

import { state } from "../state.js";
import { el, initials } from "../lib/dom.js";
import { pendingRatings } from "../lib/recipes.js";
import { checkinDue, dayKey } from "../lib/checkins.js";
import { isAdmin, pendingMembers } from "../lib/members.js";
import { signOut } from "../boot.js";
import { render } from "./app.js";
import { closeModal, openCheckin } from "./modal.js";
import { goBack } from "./navigation.js";
import { renderNotifications } from "./notifications.js";
import { renderMembers } from "./members.js";
import { renderProfileFields } from "./onboarding.js";
import { renderReminder } from "./reminder.js";

var ICONS = {
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  members: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  checkin: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  signout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
};

function icon(name) {
  var span = el("span", { class: "settings-icon", attrs: { "aria-hidden": "true" } });
  span.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + '</svg>';
  return span;
}

function ratingsCount() {
  return state.myProfile && state.myProfile.role === "patient" ? pendingRatings().length : 0;
}

// 1 once it's past the patient's reminder time and today has no check-in.
function checkinCount() {
  return checkinDue(Date.now()) ? 1 : 0;
}

function requestsCount() {
  return isAdmin() ? pendingMembers().length : 0;
}

// Everything in the panel that wants attention — shown on the avatar.
export function accountBadgeCount() {
  return ratingsCount() + checkinCount() + requestsCount();
}

var PAGES = {
  ratings: { title: "Recipes to rate", body: function(){ return renderNotifications(); } },
  members: { title: "Members & requests", body: function(m){ return renderMembers(m); } },
  details: { title: "Your details", body: function(m){ return renderProfileFields(m); } },
  reminder: { title: "Daily reminder", body: function(m){ return renderReminder(m); } }
};

export function renderAccount(m) {
  var page = PAGES[m.view];
  if (!page) return renderMenu();

  var wrap = el("div");
  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("div", { class: "panel-head-stack" }, [
      el("button", { class: "back-btn", attrs: { type: "button" }, text: "‹ Back", on: { click: goBack } }),
      el("h2", { text: page.title })
    ]),
    closeButton()
  ]));
  wrap.appendChild(page.body(m));
  return wrap;
}

function renderMenu() {
  var me = state.myProfile;
  var wrap = el("div");

  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("div", { class: "account-id" }, [
      el("span", { class: "account-avatar", attrs: { "aria-hidden": "true" }, text: initials(me.name) }),
      el("div", { class: "account-who" }, [
        el("span", { class: "name", text: me.name }),
        el("span", { class: "meta", text: (me.role === "patient" ? "Patient" : "Member") + (me.isAdmin ? " · Admin" : "") }),
        me.email ? el("span", { class: "meta", text: me.email }) : null
      ])
    ]),
    closeButton()
  ]));

  var activity = [];
  if (me.role === "patient") {
    activity.push(actionRow("checkin", "How are you today?", checkinCount(), function(){ openCheckin(dayKey(Date.now())); }));
    activity.push(row("bell", "Recipes to rate", ratingsCount(), "ratings"));
  }
  if (isAdmin()) activity.push(row("members", "Members & requests", requestsCount(), "members"));
  if (activity.length) wrap.appendChild(group(activity));

  var settings = [ row("person", "Your details", 0, "details") ];
  if (me.role === "patient") settings.push(row("clock", "Daily reminder", 0, "reminder"));
  wrap.appendChild(group(settings));

  wrap.appendChild(group([
    el("button", { class: "settings-row danger", attrs: { type: "button" }, on: { click: signOut } }, [
      icon("signout"),
      el("span", { class: "settings-label", text: "Sign out" })
    ])
  ]));
  return wrap;
}

function group(rows) {
  return el("ul", { class: "settings-group" }, rows.map(function(r){ return el("li", {}, [r]); }));
}

// A row that drills into one of the PAGES.
function row(iconName, label, count, view) {
  return actionRow(iconName, label, count, function(){
    var m = state.modal;
    m.view = view;
    m.error = "";
    // Start the details form from the saved profile, not an old draft.
    if (view === "details") { m.name = state.myProfile.name; m.role = state.myProfile.role; }
    // Whether push is on is checked afresh each time the page opens.
    if (view === "reminder") { m.pushOn = undefined; m.pushChecking = false; m.pushBusy = false; }
    render();
  });
}

function actionRow(iconName, label, count, onClick) {
  return el("button", { class: "settings-row", attrs: { type: "button" }, on: { click: onClick } }, [
    icon(iconName),
    el("span", { class: "settings-label", text: label }),
    count ? el("span", { class: "settings-count", attrs: { "aria-label": count + " open" }, text: count > 99 ? "99+" : String(count) }) : null,
    el("span", { class: "settings-chevron", attrs: { "aria-hidden": "true" }, text: "›" })
  ]);
}

function closeButton() {
  return el("button", { class: "close-x", attrs: { type: "button", "aria-label": "Close" }, text: "✕", on: { click: closeModal } });
}
