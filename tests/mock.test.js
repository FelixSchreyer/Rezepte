// Contract tests for src/backend/mock.js.
//
// The mock is only useful if it behaves like supabase.js, so these assert the
// contract rather than the implementation: promises everywhere, camelCase
// objects out, and the unique (recipe_id, uid) rule that db/schema.sql
// enforces in Postgres but the mock has to enforce by hand.
//
// The suite writes to the same localStorage key the mock uses, so it snapshots
// and restores it — running the tests will not wipe mock data you were
// working with in another tab.

import { describe, it, expect, beforeAll, afterAll } from "./harness.js";
import { MockBackend } from "../src/backend/mock.js";
import { SEED_RECIPES } from "../src/backend/seed.js";

var STORE_KEY = "gut-and-grain-mock-v1";
var ALEX = "mock-user-alex";
var saved = null;

function reset() {
  window.localStorage.removeItem(STORE_KEY);
}

describe("MockBackend — session", function () {
  beforeAll(function () {
    saved = window.localStorage.getItem(STORE_KEY);
    reset();
  });

  it("connects successfully", async function () {
    var res = await MockBackend.connect();
    expect(res.ok).toBe(true);
  });

  it("returns a stable uid", async function () {
    var a = await MockBackend.getUid();
    var b = await MockBackend.getUid();
    expect(a).toBe(b);
  });

  it("defaults to the seeded patient, so the rating form is reachable", async function () {
    var uid = await MockBackend.getUid();
    var profile = await MockBackend.fetchProfile(uid);
    expect(profile.role).toBe("patient");
  });

  it("returns null for an identity with no profile", async function () {
    expect(await MockBackend.fetchProfile("mock-user-nobody")).toBeNull();
  });
});

describe("MockBackend — profiles", function () {
  beforeAll(reset);

  it("saves a new profile and reads it back", async function () {
    await MockBackend.saveProfile("mock-user-new", { name: "Jo", role: "member", joinedAt: 42 });
    var p = await MockBackend.fetchProfile("mock-user-new");
    expect(p).toEqual({ id: "mock-user-new", name: "Jo", role: "member", joinedAt: 42, lastPhase: null });
  });

  it("updates an existing profile in place rather than duplicating it", async function () {
    await MockBackend.saveProfile("mock-user-new", { name: "Jo", role: "member", joinedAt: 42 });
    await MockBackend.saveProfile("mock-user-new", { name: "Jo Rivera", role: "patient", joinedAt: 42 });
    var p = await MockBackend.fetchProfile("mock-user-new");
    expect(p.name).toBe("Jo Rivera");
    expect(p.role).toBe("patient");
  });

  it("preserves lastPhase across a profile save", async function () {
    // saveProfile writes only name/role/joinedAt in the real backend too, so
    // an unrelated column must survive an edit from the onboarding form.
    await MockBackend.saveFilterState(ALEX, { lastPhase: "rebuilding" });
    await MockBackend.saveProfile(ALEX, { name: "Alex Moreau", role: "patient", joinedAt: 1 });
    var p = await MockBackend.fetchProfile(ALEX);
    expect(p.lastPhase).toBe("rebuilding");
  });
});

describe("MockBackend — filter state", function () {
  beforeAll(reset);

  it("is null before anything is saved", async function () {
    expect(await MockBackend.fetchFilterState(ALEX)).toBeNull();
  });

  it("round-trips the last phase", async function () {
    await MockBackend.saveFilterState(ALEX, { lastPhase: "moderate" });
    expect(await MockBackend.fetchFilterState(ALEX)).toEqual({ lastPhase: "moderate" });
  });

  it("goes back to null when the phase filter is cleared", async function () {
    await MockBackend.saveFilterState(ALEX, { lastPhase: "moderate" });
    await MockBackend.saveFilterState(ALEX, { lastPhase: null });
    expect(await MockBackend.fetchFilterState(ALEX)).toBeNull();
  });
});

describe("MockBackend — recipes", function () {
  beforeAll(reset);

  it("delivers the seed recipes to a subscriber", async function () {
    var got = null;
    var off = MockBackend.onRecipes(function (rows) { got = rows; });
    await MockBackend.addRecipe({
      title: "Probe", phases: ["remission"], tags: ["Keto"],
      ingredients: ["x"], instructions: "", prepMinutes: null,
      addedBy: ALEX, addedByName: "Alex", createdAt: 1
    });
    off();
    expect(got.length).toBe(SEED_RECIPES.length + 1);
  });

  it("gives a new recipe an id", async function () {
    var got = [];
    var off = MockBackend.onRecipes(function (rows) { got = rows; });
    await MockBackend.addRecipe({
      title: "Needs an id", phases: ["remission"], tags: ["Keto"],
      ingredients: ["x"], instructions: "", prepMinutes: null,
      addedBy: ALEX, addedByName: "Alex", createdAt: 2
    });
    off();
    var added = got.filter(function (r) { return r.title === "Needs an id"; })[0];
    expect(typeof added.id).toBe("string");
  });

  it("stops calling a subscriber after unsubscribe", async function () {
    var calls = 0;
    var off = MockBackend.onRecipes(function () { calls++; });
    await MockBackend.addRecipe({
      title: "Before", phases: ["remission"], tags: ["Keto"], ingredients: ["x"],
      instructions: "", prepMinutes: null, addedBy: ALEX, addedByName: "Alex", createdAt: 3
    });
    var seen = calls;
    off();
    await MockBackend.addRecipe({
      title: "After", phases: ["remission"], tags: ["Keto"], ingredients: ["x"],
      instructions: "", prepMinutes: null, addedBy: ALEX, addedByName: "Alex", createdAt: 4
    });
    expect(calls).toBe(seen);
  });
});

describe("MockBackend — ratings", function () {
  beforeAll(reset);

  function ratingData(over) {
    var base = { name: "Alex Moreau", stars: 4, tolerance: "good", comment: "", createdAt: 10 };
    Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
    return base;
  }

  it("adds a rating for a previously unrated recipe", async function () {
    var got = [];
    var off = MockBackend.onRatings(function (rows) { got = rows; });
    await MockBackend.upsertRating("r-stirfry", ALEX, ratingData({ stars: 5 }));
    off();
    var mine = got.filter(function (r) { return r.recipeId === "r-stirfry"; });
    expect(mine).toHaveLength(1);
  });

  it("updates in place on a second rating from the same person", async function () {
    var got = [];
    var off = MockBackend.onRatings(function (rows) { got = rows; });
    await MockBackend.upsertRating("r-stirfry", ALEX, ratingData({ stars: 5 }));
    await MockBackend.upsertRating("r-stirfry", ALEX, ratingData({ stars: 2, tolerance: "poor", comment: "changed my mind" }));
    off();
    var mine = got.filter(function (r) { return r.recipeId === "r-stirfry" && r.uid === ALEX; });
    expect(mine).toHaveLength(1);
    expect(mine[0].stars).toBe(2);
    expect(mine[0].comment).toBe("changed my mind");
  });

  it("keeps ratings from different people on the same recipe separate", async function () {
    var got = [];
    var off = MockBackend.onRatings(function (rows) { got = rows; });
    await MockBackend.upsertRating("r-stirfry", ALEX, ratingData({ stars: 5 }));
    await MockBackend.upsertRating("r-stirfry", "mock-user-sam", ratingData({ name: "Sam", stars: 3 }));
    off();
    var mine = got.filter(function (r) { return r.recipeId === "r-stirfry"; });
    expect(mine).toHaveLength(2);
  });
});

describe("MockBackend — shape of returned rows", function () {
  beforeAll(reset);

  it("returns recipes in camelCase, like the Supabase mappers do", async function () {
    var got = [];
    var off = MockBackend.onRecipes(function (rows) { got = rows; });
    await MockBackend.addRecipe({
      title: "Shape check", phases: ["remission"], tags: ["Keto"], ingredients: ["x"],
      instructions: "", prepMinutes: 20, addedBy: ALEX, addedByName: "Alex", createdAt: 5
    });
    off();
    var r = got.filter(function (x) { return x.title === "Shape check"; })[0];
    expect(r.prepMinutes).toBe(20);
    expect(r.addedByName).toBe("Alex");
    expect(r.prep_minutes).toBe(undefined);
  });

  it("returns ratings with recipeId, not recipe_id", async function () {
    var got = [];
    var off = MockBackend.onRatings(function (rows) { got = rows; });
    await MockBackend.upsertRating("r-oats", ALEX, { name: "Alex", stars: 1, tolerance: "poor", comment: "", createdAt: 6 });
    off();
    var rt = got.filter(function (r) { return r.recipeId === "r-oats" && r.uid === ALEX; })[0];
    expect(typeof rt.recipeId).toBe("string");
    expect(rt.recipe_id).toBe(undefined);
  });

  afterAll(function () {
    // Put back whatever the developer had before the suite ran.
    if (saved === null) window.localStorage.removeItem(STORE_KEY);
    else window.localStorage.setItem(STORE_KEY, saved);
  });
});
