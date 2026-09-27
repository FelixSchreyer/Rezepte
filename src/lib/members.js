// Derived views over the signed-in person's access and the member list.
// Pure read-only helpers: nothing here mutates state or touches the DOM.
//
// These only decide what the UI shows. The same rules are enforced in
// Postgres (db/schema.sql), so a tampered client still sees nothing.

import { state } from "../state.js";

export function isApproved() {
  return !!(state.myProfile && state.myProfile.status === "approved");
}

export function isAdmin() {
  return isApproved() && !!state.myProfile.isAdmin;
}

// Members in the given status, oldest request first — non-admins get [].
export function membersWithStatus(status) {
  if (!isAdmin()) return [];
  return Object.keys(state.members)
    .map(function(id){ return state.members[id]; })
    .filter(function(m){ return m.status === status; })
    .sort(function(a,b){ return (a.joinedAt||0) - (b.joinedAt||0); });
}

export function pendingMembers() {
  return membersWithStatus("pending");
}
