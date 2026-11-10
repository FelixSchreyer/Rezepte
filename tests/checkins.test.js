// Tests for src/lib/checkins.js — days, the time picker's conversions, and
// when the daily check-in is due.

import { describe, it, expect } from "./harness.js";
import { state } from "../src/state.js";
import { checkinDue, checkinTime, cookedOn, dayKey, fromLocalInput, isDayKey, lastCooked, quickCookTimes, shiftDay, toLocalInput } from "../src/lib/checkins.js";

function local(y, mo, d, h, mi) { return new Date(y, mo - 1, d, h || 0, mi || 0).getTime(); }

function reset(patch) {
  state.uid = "u-pat";
  state.myProfile = { id: "u-pat", name: "Pat", role: "patient", status: "approved", checkinTime: null };
  state.recipes = [{ id: "r1", title: "Congee" }, { id: "r2", title: "Broth" }];
  state.cookEvents = [];
  state.checkins = [];
  Object.keys(patch || {}).forEach(function (k) { state[k] = patch[k]; });
}

describe("checkins — days", function () {
  it("names a day by its local date", function () {
    expect(dayKey(local(2026, 3, 5, 23, 59))).toBe("2026-03-05");
  });

  it("steps across month and year ends", function () {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("recognises a day key", function () {
    expect(isDayKey("2026-11-10")).toBe(true);
    expect(isDayKey("10.11.2026")).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });
});

describe("checkins — the cooked-time picker", function () {
  it("round-trips through the datetime-local format in local time", function () {
    var t = local(2026, 11, 9, 19, 5);
    expect(toLocalInput(t)).toBe("2026-11-09T19:05");
    expect(fromLocalInput("2026-11-09T19:05")).toBe(t);
  });

  it("returns null for an empty field", function () {
    expect(fromLocalInput("")).toBeNull();
  });

  it("only offers quick picks in the past", function () {
    var morning = local(2026, 11, 10, 9, 0);
    expect(quickCookTimes(morning).map(function (q) { return q.label; })).toEqual(["Yesterday, dinner", "Yesterday, lunch"]);
    var evening = local(2026, 11, 10, 20, 0);
    expect(quickCookTimes(evening)[0].at).toBe(local(2026, 11, 10, 12, 30));
  });
});

describe("checkins — cooked", function () {
  it("finds the newest time a recipe was cooked", function () {
    reset({ cookEvents: [
      { id: "a", recipeId: "r1", cookedAt: 10 },
      { id: "b", recipeId: "r1", cookedAt: 30 },
      { id: "c", recipeId: "r2", cookedAt: 50 }
    ] });
    expect(lastCooked("r1").id).toBe("b");
    expect(lastCooked("nope")).toBeNull();
  });

  it("lists a day's recipes earliest first, each once, skipping deleted ones", function () {
    reset({ cookEvents: [
      { id: "a", recipeId: "r2", cookedAt: local(2026, 11, 10, 19) },
      { id: "b", recipeId: "r1", cookedAt: local(2026, 11, 10, 8) },
      { id: "c", recipeId: "r1", cookedAt: local(2026, 11, 10, 13) },
      { id: "d", recipeId: "gone", cookedAt: local(2026, 11, 10, 9) },
      { id: "e", recipeId: "r2", cookedAt: local(2026, 11, 9, 19) }
    ] });
    expect(cookedOn("2026-11-10").map(function (r) { return r.title; })).toEqual(["Congee", "Broth"]);
  });
});

describe("checkins — due", function () {
  it("defaults the reminder to 20:00", function () {
    reset();
    expect(checkinTime()).toBe("20:00");
  });

  it("is due for a patient past their time with no check-in today", function () {
    reset();
    expect(checkinDue(local(2026, 11, 10, 19, 59))).toBe(false);
    expect(checkinDue(local(2026, 11, 10, 20, 0))).toBe(true);
  });

  it("follows the patient's own time", function () {
    reset();
    state.myProfile.checkinTime = "07:30";
    expect(checkinDue(local(2026, 11, 10, 8, 0))).toBe(true);
  });

  it("is not due once today has a check-in", function () {
    reset({ checkins: [{ uid: "u-pat", day: "2026-11-10", state: "good" }] });
    expect(checkinDue(local(2026, 11, 10, 21, 0))).toBe(false);
  });

  it("is never due for members", function () {
    reset();
    state.myProfile.role = "member";
    expect(checkinDue(local(2026, 11, 10, 21, 0))).toBe(false);
  });
});
