// "Members & requests" page of the account panel (admins only): let
// pending people in, turn them away, or take access back from someone. The buttons call set_member_status() in
// Postgres, which re-checks that the caller is an admin — hiding this panel
// from everyone else is a convenience, not the protection.

import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { membersWithStatus } from "../lib/members.js";
import { Backend } from "../backend/index.js";
import { renderModalInPlace } from "./modal.js";

var ROLE_LABEL = { patient: "Patient", member: "Member" };

export function renderMembers(m) {
  var wrap = el("div");
  if (m.error) wrap.appendChild(el("div", { class: "form-error", style: "margin:0 0 14px;", text: m.error }));

  var pending = membersWithStatus("pending");
  wrap.appendChild(section("Waiting for approval", pending,
    "Nobody is waiting right now.",
    function(p){ return [
      actionButton(m, p, "approved", "Let in", "btn btn-primary btn-sm"),
      actionButton(m, p, "rejected", "Decline", "btn btn-sm")
    ]; }));

  wrap.appendChild(section("Has access", membersWithStatus("approved"),
    "",
    function(p){
      if (p.id === state.uid) return [ el("span", { class: "member-you", text: "You" }) ];
      return [ actionButton(m, p, "rejected", "Remove access", "btn btn-ghost btn-sm") ];
    }));

  var rejected = membersWithStatus("rejected");
  if (rejected.length) {
    wrap.appendChild(section("Declined", rejected, "",
      function(p){ return [ actionButton(m, p, "approved", "Let in", "btn btn-sm") ]; }));
  }
  return wrap;
}

function section(title, people, emptyText, actions) {
  var s = el("div", { class: "detail-section" }, [ el("h4", { text: title }) ]);
  if (!people.length) {
    if (emptyText) s.appendChild(el("div", { class: "notif-empty", text: emptyText }));
    return s;
  }
  var ul = el("ul", { class: "member-list" });
  people.forEach(function(p){
    ul.appendChild(el("li", { class: "member-row" }, [
      el("div", { class: "member-who" }, [
        el("span", { class: "name", text: p.name + (p.isAdmin ? " · Admin" : "") }),
        el("span", { class: "meta", text: (ROLE_LABEL[p.role] || p.role) + " · " + (p.email || "no email") })
      ]),
      el("div", { class: "member-actions" }, actions(p))
    ]));
  });
  s.appendChild(ul);
  return s;
}

function actionButton(m, person, status, label, cls) {
  return el("button", { class: cls, attrs: { type: "button" }, text: label, on: { click: function(){
    m.error = "";
    Backend.setMemberStatus(person.id, status).then(function(){
      // The members subscription re-renders with the new status; nothing
      // else to do here.
    }).catch(function(){
      m.error = "Couldn't update " + person.name + " — check your connection and try again.";
      renderModalInPlace();
    });
  } } });
}
