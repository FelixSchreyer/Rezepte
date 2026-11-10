// Tests for src/lib/members.js — who counts as approved or admin, and the
// member lists the admin panel is built from.

import { describe, it, expect } from "./harness.js";
import { state } from "../src/state.js";
import { isApproved, isAdmin, membersWithStatus, pendingMembers, phaseStatus, effectivePhase } from "../src/lib/members.js";

function member(over) {
  var base = { id: "u", email: "u@x.org", name: "U", role: "member", status: "approved", isAdmin: false, joinedAt: 0 };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}

function setState(me, others) {
  state.phaseChoice = null;
  state.uid = me ? me.id : null;
  state.myProfile = me || null;
  state.members = {};
  (others || []).concat(me ? [me] : []).forEach(function (m) { state.members[m.id] = m; });
}

describe("isApproved / isAdmin", function () {
  it("is false for both before a profile exists", function () {
    setState(null);
    expect(isApproved()).toBe(false);
    expect(isAdmin()).toBe(false);
  });

  it("is false for a pending member", function () {
    setState(member({ status: "pending" }));
    expect(isApproved()).toBe(false);
  });

  it("does not treat a pending admin flag as admin", function () {
    setState(member({ status: "pending", isAdmin: true }));
    expect(isAdmin()).toBe(false);
  });

  it("is admin only when approved and flagged", function () {
    setState(member({ isAdmin: true }));
    expect(isAdmin()).toBe(true);
    setState(member());
    expect(isAdmin()).toBe(false);
  });
});

describe("membersWithStatus", function () {
  var admin = member({ id: "admin", isAdmin: true });
  var late = member({ id: "late", status: "pending", joinedAt: 20 });
  var early = member({ id: "early", status: "pending", joinedAt: 10 });
  var gone = member({ id: "gone", status: "rejected" });

  it("lists pending people, oldest request first", function () {
    setState(admin, [late, early, gone]);
    expect(pendingMembers().map(function (m) { return m.id; })).toEqual(["early", "late"]);
  });

  it("filters by any status", function () {
    setState(admin, [late, early, gone]);
    expect(membersWithStatus("rejected").map(function (m) { return m.id; })).toEqual(["gone"]);
  });

  it("is empty for non-admins", function () {
    setState(member({ id: "sam" }), [late, early]);
    expect(pendingMembers()).toEqual([]);
  });
});

describe("phaseStatus / effectivePhase", function () {
  var patient = function (over) { return member(Object.assign({ id: "pat", name: "Alex Moreau", role: "patient" }, over)); };

  it("keeps one's own pick while no status is set", function () {
    setState(member({ id: "sam", lastPhase: "remission", lastPhaseAt: 10 }), [patient()]);
    expect(phaseStatus()).toBeNull();
    expect(effectivePhase()).toBe("remission");
  });

  it("follows a status set after one's own pick", function () {
    setState(member({ id: "sam", lastPhase: "remission", lastPhaseAt: 10 }), [patient({ currentPhase: "moderate", currentPhaseAt: 20 })]);
    expect(phaseStatus().phase).toBe("moderate");
    expect(phaseStatus().member.id).toBe("pat");
    expect(effectivePhase()).toBe("moderate");
  });

  it("keeps one's own pick made after the status", function () {
    setState(member({ id: "sam", lastPhase: "remission", lastPhaseAt: 30 }), [patient({ currentPhase: "moderate", currentPhaseAt: 20 })]);
    expect(effectivePhase()).toBe("remission");
  });

  it("counts a pick made on this device before the server echoes it", function () {
    setState(member({ id: "sam", lastPhase: "remission", lastPhaseAt: 10 }), [patient({ currentPhase: "moderate", currentPhaseAt: 20 })]);
    state.phaseChoice = { phase: "transition", at: 25 };
    expect(effectivePhase()).toBe("transition");
  });

  it("ignores a status on someone who isn't a patient", function () {
    setState(member({ id: "sam" }), [member({ id: "robin", currentPhase: "severe", currentPhaseAt: 20 })]);
    expect(phaseStatus()).toBeNull();
  });

  it("ignores a patient who isn't approved", function () {
    setState(member({ id: "sam" }), [patient({ status: "pending", currentPhase: "severe", currentPhaseAt: 20 })]);
    expect(phaseStatus()).toBeNull();
  });

  it("takes the newest status when there are several patients", function () {
    setState(member({ id: "sam" }), [
      patient({ id: "p1", currentPhase: "severe", currentPhaseAt: 20 }),
      patient({ id: "p2", currentPhase: "rebuilding", currentPhaseAt: 30 })
    ]);
    expect(phaseStatus().phase).toBe("rebuilding");
  });

  it("moves the patient's own filter when they set a status", function () {
    setState(patient({ lastPhase: "remission", lastPhaseAt: 10, currentPhase: "severe", currentPhaseAt: 20 }));
    expect(effectivePhase()).toBe("severe");
  });

  it("treats missing timestamps as never", function () {
    setState(member({ id: "sam", lastPhase: "remission" }), [patient({ currentPhase: "moderate", currentPhaseAt: 1 })]);
    expect(effectivePhase()).toBe("moderate");
  });
});
