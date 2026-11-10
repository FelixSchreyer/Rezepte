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

// The patient's phase status ("How I'm doing"): the newest one any approved
// patient has set, as { phase, at, member } — or null if none is set.
// Others' current_phase is ignored: setting it is a patient's thing, the
// same UI convention as rating (see docs/architecture.md → Roles).
export function phaseStatus() {
  var best = null;
  Object.keys(state.members).forEach(function(id){
    var m = state.members[id];
    if (m.status !== "approved" || m.role !== "patient" || !m.currentPhase) return;
    var at = m.currentPhaseAt || 0;
    if (!best || at > best.at) best = { phase: m.currentPhase, at: at, member: m };
  });
  return best;
}

// The phase filter this person should see: their own last pick, unless a
// patient has set a status since — the newer of the two wins. A pick made on
// this device (state.phaseChoice) counts even before the server echoes it.
export function effectivePhase() {
  var me = state.myProfile || {};
  var own = { phase: me.lastPhase || null, at: me.lastPhaseAt || 0 };
  if (state.phaseChoice && state.phaseChoice.at > own.at) own = state.phaseChoice;
  var status = phaseStatus();
  return status && status.at > own.at ? status.phase : own.phase;
}
