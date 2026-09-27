// Contract tests for src/backend/mock.js.
//
// The mock is only useful if it behaves like supabase.js, so these assert the
// contract rather than the implementation: promises everywhere, camelCase
// objects out, and the rules db/schema.sql enforces in Postgres but the mock
// has to enforce by hand — unique (recipe_id, uid), new members start
// pending, and only admins may change someone's status.
//
// The suite writes to the same localStorage key the mock uses, so it snapshots
// and restores it — running the tests will not wipe mock data you were
// working with in another tab.

import { describe, it, expect, beforeAll, afterAll } from "./harness.js";
import { MockBackend } from "../src/backend/mock.js";
import { SEED_RECIPES, SEED_PASSWORD } from "../src/backend/seed.js";

var STORE_KEY = "gut-and-grain-mock-v2";
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

  it("starts signed out", async function () {
    expect(await MockBackend.getUid()).toBeNull();
  });

  it("signs in a seeded account with the right password", async function () {
    var res = await MockBackend.signIn("alex@example.com", SEED_PASSWORD);
    expect(res.uid).toBe(ALEX);
    expect(await MockBackend.getUid()).toBe(ALEX);
  });

  it("ignores case and surrounding spaces in the email", async function () {
    var res = await MockBackend.signIn("  Alex@Example.com ", SEED_PASSWORD);
    expect(res.uid).toBe(ALEX);
  });

  it("refuses a wrong password", async function () {
    await MockBackend.signOut();
    var res = await MockBackend.signIn("alex@example.com", "nope");
    expect(res.error).toBe("invalid");
    expect(await MockBackend.getUid()).toBeNull();
  });

  it("signs out", async function () {
    await MockBackend.signIn("alex@example.com", SEED_PASSWORD);
    await MockBackend.signOut();
    expect(await MockBackend.getUid()).toBeNull();
  });

  it("creates an account and signs straight into it", async function () {
    var res = await MockBackend.signUp("new@example.com", "secret1");
    expect(typeof res.uid).toBe("string");
    expect(await MockBackend.getUid()).toBe(res.uid);
  });

  it("refuses a second account for the same email", async function () {
    expect((await MockBackend.signUp("alex@example.com", "secret1")).error).toBe("exists");
  });

  it("refuses a password shorter than 6 characters", async function () {
    expect((await MockBackend.signUp("short@example.com", "12345")).error).toBe("weak");
  });
});

describe("MockBackend — profiles", function () {
  beforeAll(reset);

  it("creates a new member as pending, never admin, with the account's email", async function () {
    var uid = (await MockBackend.signUp("jo@example.com", "secret1")).uid;
    await MockBackend.createProfile(uid, { name: "Jo", role: "member", joinedAt: 42 });
    var p = await MockBackend.fetchProfile(uid);
    expect(p).toEqual({
      id: uid, email: "jo@example.com", name: "Jo", role: "member",
      status: "pending", isAdmin: false, joinedAt: 42, lastPhase: null
    });
  });

  it("refuses to create a second row for the same person", async function () {
    var failed = false;
    try { await MockBackend.createProfile(ALEX, { name: "Alex", role: "patient", joinedAt: 1 }); }
    catch (e) { failed = true; }
    expect(failed).toBe(true);
  });

  it("updates name and role but nothing else", async function () {
    await MockBackend.saveFilterState(ALEX, { lastPhase: "rebuilding" });
    await MockBackend.saveProfile(ALEX, { name: "Alex M.", role: "member", status: "approved", isAdmin: false });
    var p = await MockBackend.fetchProfile(ALEX);
    expect(p.name).toBe("Alex M.");
    expect(p.role).toBe("member");
    expect(p.isAdmin).toBe(true);
    expect(p.lastPhase).toBe("rebuilding");
  });
});

describe("MockBackend — member status", function () {
  beforeAll(reset);

  var JORDAN = "mock-user-jordan";
  var SAM = "mock-user-sam";

  async function attempt(fn) {
    try { await fn(); return true; } catch (e) { return false; }
  }

  it("lets an admin approve a pending member", async function () {
    await MockBackend.signIn("alex@example.com", SEED_PASSWORD);
    await MockBackend.setMemberStatus(JORDAN, "approved");
    expect((await MockBackend.fetchProfile(JORDAN)).status).toBe("approved");
  });

  it("lets an admin take access away again", async function () {
    await MockBackend.signIn("alex@example.com", SEED_PASSWORD);
    await MockBackend.setMemberStatus(JORDAN, "rejected");
    expect((await MockBackend.fetchProfile(JORDAN)).status).toBe("rejected");
  });

  it("refuses a non-admin", async function () {
    await MockBackend.signIn("sam@example.com", SEED_PASSWORD);
    expect(await attempt(function () { return MockBackend.setMemberStatus(JORDAN, "approved"); })).toBe(false);
  });

  it("refuses an admin changing their own status", async function () {
    await MockBackend.signIn("alex@example.com", SEED_PASSWORD);
    expect(await attempt(function () { return MockBackend.setMemberStatus(ALEX, "rejected"); })).toBe(false);
  });

  it("refuses an unknown status", async function () {
    await MockBackend.signIn("alex@example.com", SEED_PASSWORD);
    expect(await attempt(function () { return MockBackend.setMemberStatus(SAM, "pending"); })).toBe(false);
  });

  it("refuses when signed out", async function () {
    await MockBackend.signOut();
    expect(await attempt(function () { return MockBackend.setMemberStatus(JORDAN, "approved"); })).toBe(false);
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

describe("MockBackend — photos", function () {
  beforeAll(reset);

  function jpeg() { return new Blob(["not really a jpeg"], { type: "image/jpeg" }); }

  it("stores an upload under the uploader's folder", async function () {
    var path = await MockBackend.uploadPhoto(ALEX, jpeg());
    expect(path.indexOf(ALEX + "/")).toBe(0);
  });

  it("returns a displayable URL for an uploaded path, and nothing for unknown ones", async function () {
    var path = await MockBackend.uploadPhoto(ALEX, jpeg());
    var urls = await MockBackend.photoUrls([path, "nobody/missing.jpg"]);
    expect(urls[path].indexOf("data:image/jpeg")).toBe(0);
    expect(urls["nobody/missing.jpg"]).toBe(undefined);
  });

  it("attaches a photo to an existing recipe", async function () {
    var got = [];
    var off = MockBackend.onRecipes(function (rows) { got = rows; });
    var path = await MockBackend.uploadPhoto(ALEX, jpeg());
    await MockBackend.setRecipePhoto("r-congee", path);
    off();
    expect(got.filter(function (r) { return r.id === "r-congee"; })[0].photoPath).toBe(path);
  });

  it("saves a photo path given with a new recipe", async function () {
    var got = [];
    var off = MockBackend.onRecipes(function (rows) { got = rows; });
    await MockBackend.addRecipe({
      title: "With photo", phases: ["remission"], tags: ["Keto"], ingredients: ["x"],
      instructions: "", prepMinutes: null, addedBy: ALEX, addedByName: "Alex",
      photoPath: ALEX + "/x.jpg", createdAt: 7
    });
    off();
    expect(got.filter(function (r) { return r.title === "With photo"; })[0].photoPath).toBe(ALEX + "/x.jpg");
  });
});

describe("MockBackend — quick fill", function () {
  it("answers in the shape the Edge Function returns", async function () {
    var res = await MockBackend.structureRecipe("Rice congee\n200 g rice\n1 chicken breast\nSimmer for 60 minutes.", ["Low-fiber"]);
    expect(res.title).toBe("Rice congee");
    expect(res.ingredients).toEqual(["200 g rice", "1 chicken breast"]);
    expect(res.instructions).toBe("1. Simmer for 60 minutes.");
    expect(res.prepMinutes).toBe(60);
    expect(res.tags).toEqual([]);
  });

  it("only suggests tags from the list it was given", async function () {
    var res = await MockBackend.structureRecipe("Keto bowl, gluten-free\n- 2 eggs", ["Keto", "Gluten-free", "Low-fiber"]);
    expect(res.tags).toEqual(["Keto", "Gluten-free"]);
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
