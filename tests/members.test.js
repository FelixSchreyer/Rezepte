// Tests for src/lib/members.js — who counts as approved or admin, and the
// member lists the admin panel is built from.

import { describe, it, expect } from "./harness.js";
import { state } from "../src/state.js";
import { isApproved, isAdmin, membersWithStatus, pendingMembers } from "../src/lib/members.js";

function member(over) {
  var base = { id: "u", email: "u@x.org", name: "U", role: "member", status: "approved", isAdmin: false, joinedAt: 0 };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}

function setState(me, others) {
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
