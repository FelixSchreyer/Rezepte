// Tests for src/lib/recipes.js — the pure logic behind filtering and ratings.
//
// These helpers read the shared `state` singleton rather than taking arguments,
// so each test sets up state via setState() first. That is a fair test of the
// real code path; if the helpers are ever refactored to take parameters, these
// tests get simpler, not harder.

import { describe, it, expect } from "./harness.js";
import { state } from "../src/state.js";
import { allTags, ratingsFor, ratingSummary, filteredRecipes, pendingRatings, starString, recipePhases, suitsPhase } from "../src/lib/recipes.js";

function setState(patch) {
  state.recipes = [];
  state.ratings = [];
  state.activePhase = null;
  state.activeTags = {};
  state.search = "";
  state.uid = null;
  state.myProfile = null;
  Object.keys(patch || {}).forEach(function (k) { state[k] = patch[k]; });
}

function recipe(over) {
  var base = {
    id: "x", title: "Untitled", phases: ["remission"], tags: [],
    ingredients: [], instructions: "", prepMinutes: null, createdAt: 0
  };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}

function rating(over) {
  var base = { id: "rt", recipeId: "x", uid: "u", name: "A", stars: 5, tolerance: "good", comment: "", createdAt: 0 };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}

describe("allTags", function () {
  it("returns the base tags when there are no recipes", function () {
    setState({});
    expect(allTags()).toEqual(["Low-Carb", "Gluten-free", "Lactose-free", "Breakfast", "Lunch", "Dinner"]);
  });

  it("includes custom tags introduced by recipes", function () {
    setState({ recipes: [recipe({ tags: ["Batch-cooks well"] })] });
    expect(allTags()).toContain("Batch-cooks well");
  });

  it("does not duplicate a tag that is already a base tag", function () {
    setState({ recipes: [recipe({ tags: ["Keto"] }), recipe({ tags: ["Keto"] })] });
    var keto = allTags().filter(function (t) { return t === "Keto"; });
    expect(keto).toHaveLength(1);
  });

  it("tolerates a recipe with no tags field", function () {
    setState({ recipes: [{ id: "a" }] });
    expect(allTags()).toHaveLength(6);
  });
});

describe("ratingsFor", function () {
  it("returns only the ratings for the given recipe", function () {
    setState({ ratings: [rating({ recipeId: "a" }), rating({ recipeId: "b" }), rating({ recipeId: "a" })] });
    expect(ratingsFor("a")).toHaveLength(2);
  });

  it("returns an empty array for an unrated recipe", function () {
    setState({ ratings: [rating({ recipeId: "a" })] });
    expect(ratingsFor("zzz")).toEqual([]);
  });
});

describe("ratingSummary", function () {
  it("is null when the recipe has no ratings", function () {
    setState({});
    expect(ratingSummary("a")).toBeNull();
  });

  it("averages the stars", function () {
    setState({ ratings: [rating({ stars: 5 }), rating({ stars: 2 })] });
    expect(ratingSummary("x").avg).toBeCloseTo(3.5);
  });

  it("counts the ratings", function () {
    setState({ ratings: [rating({ stars: 5 }), rating({ stars: 2 }), rating({ stars: 4 })] });
    expect(ratingSummary("x").count).toBe(3);
  });

  it("reports the majority tolerance", function () {
    setState({
      ratings: [
        rating({ tolerance: "poor" }),
        rating({ tolerance: "poor" }),
        rating({ tolerance: "good" })
      ]
    });
    expect(ratingSummary("x").tolerance).toBe("poor");
  });

  it("treats a missing star value as zero rather than NaN", function () {
    setState({ ratings: [rating({ stars: 4 }), rating({ stars: undefined })] });
    expect(ratingSummary("x").avg).toBeCloseTo(2);
  });

  it("breaks a tolerance tie towards the better outcome", function () {
    // Documents current behaviour: 'good' is the seed value and only a strictly
    // larger count displaces it, so a 1–1 tie stays 'good'.
    setState({ ratings: [rating({ tolerance: "good" }), rating({ tolerance: "poor" })] });
    expect(ratingSummary("x").tolerance).toBe("good");
  });
});

describe("recipePhases", function () {
  it("runs from the earliest stored phase through every later one", function () {
    expect(recipePhases({ phases: ["rebuilding"] })).toEqual(["rebuilding", "transition", "remission"]);
  });

  it("fills gaps in older recipes that list only some later phases", function () {
    expect(recipePhases({ phases: ["remission", "moderate"] })).toEqual(["moderate", "rebuilding", "transition", "remission"]);
  });

  it("returns nothing for a recipe without (known) phases", function () {
    expect(recipePhases({ phases: [] })).toEqual([]);
    expect(recipePhases({ phases: ["unknown"] })).toEqual([]);
    expect(recipePhases({})).toEqual([]);
  });

  it("counts a recipe as suiting later phases but not earlier ones", function () {
    expect(suitsPhase({ phases: ["moderate"] }, "remission")).toBe(true);
    expect(suitsPhase({ phases: ["moderate"] }, "severe")).toBe(false);
  });
});

describe("filteredRecipes", function () {
  var congee = recipe({ id: "congee", title: "Rice congee", phases: ["severe", "moderate"], tags: ["Low-fiber", "Gluten-free"], ingredients: ["white rice", "chicken"], createdAt: 100 });
  var dal    = recipe({ id: "dal",    title: "Red lentil dal", phases: ["remission"], tags: ["Gluten-free"], ingredients: ["red lentils", "turmeric"], createdAt: 300 });
  var eggs   = recipe({ id: "eggs",   title: "Scrambled eggs", phases: ["moderate"], tags: ["Keto", "Gluten-free"], ingredients: ["eggs", "olive oil"], createdAt: 200 });

  it("returns everything when nothing is filtered", function () {
    setState({ recipes: [congee, dal, eggs] });
    expect(filteredRecipes()).toHaveLength(3);
  });

  it("sorts newest first", function () {
    setState({ recipes: [congee, dal, eggs] });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["dal", "eggs", "congee"]);
  });

  it("filters by phase", function () {
    setState({ recipes: [congee, dal, eggs], activePhase: "moderate" });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["eggs", "congee"]);
  });

  it("includes recipes filed under an earlier phase", function () {
    setState({ recipes: [congee, dal, eggs], activePhase: "remission" });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["dal", "eggs", "congee"]);
  });

  it("requires ALL active tags, not any", function () {
    setState({ recipes: [congee, dal, eggs], activeTags: { "Gluten-free": true, "Keto": true } });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["eggs"]);
  });

  it("ignores tags that were toggled back off", function () {
    setState({ recipes: [congee, dal, eggs], activeTags: { "Keto": false } });
    expect(filteredRecipes()).toHaveLength(3);
  });

  it("searches titles", function () {
    setState({ recipes: [congee, dal, eggs], search: "congee" });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["congee"]);
  });

  it("searches ingredients too", function () {
    setState({ recipes: [congee, dal, eggs], search: "turmeric" });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["dal"]);
  });

  it("is case insensitive and ignores surrounding whitespace", function () {
    setState({ recipes: [congee, dal, eggs], search: "  RICE  " });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["congee"]);
  });

  it("combines phase, tag and search filters", function () {
    setState({
      recipes: [congee, dal, eggs],
      activePhase: "moderate",
      activeTags: { "Gluten-free": true },
      search: "eggs"
    });
    expect(filteredRecipes().map(function (r) { return r.id; })).toEqual(["eggs"]);
  });

  it("returns nothing when the filters exclude everything", function () {
    setState({ recipes: [congee, dal, eggs], activePhase: "severe", search: "dal" });
    expect(filteredRecipes()).toEqual([]);
  });
});

describe("pendingRatings", function () {
  var patient = { name: "Alex", role: "patient", joinedAt: 100 };
  var fresh = recipe({ id: "fresh", addedBy: "sam", createdAt: 200 });
  var older = recipe({ id: "older", addedBy: "sam", createdAt: 50 });
  var mine = recipe({ id: "mine", addedBy: "me", createdAt: 300 });

  it("lists new recipes by others that the patient has not rated", function () {
    setState({ uid: "me", myProfile: patient, recipes: [fresh, older, mine] });
    expect(pendingRatings().map(function (r) { return r.id; })).toEqual(["fresh"]);
  });

  it("drops a recipe once the patient has rated it", function () {
    setState({ uid: "me", myProfile: patient, recipes: [fresh], ratings: [rating({ recipeId: "fresh", uid: "me" })] });
    expect(pendingRatings()).toEqual([]);
  });

  it("ignores ratings by other people", function () {
    setState({ uid: "me", myProfile: patient, recipes: [fresh], ratings: [rating({ recipeId: "fresh", uid: "sam" })] });
    expect(pendingRatings()).toHaveLength(1);
  });

  it("sorts newest first", function () {
    var newer = recipe({ id: "newer", addedBy: "sam", createdAt: 400 });
    setState({ uid: "me", myProfile: patient, recipes: [fresh, newer] });
    expect(pendingRatings().map(function (r) { return r.id; })).toEqual(["newer", "fresh"]);
  });

  it("is always empty for members", function () {
    setState({ uid: "me", myProfile: { name: "Sam", role: "member", joinedAt: 0 }, recipes: [fresh] });
    expect(pendingRatings()).toEqual([]);
  });

  it("is empty before a profile exists", function () {
    setState({ uid: "me", recipes: [fresh] });
    expect(pendingRatings()).toEqual([]);
  });
});

describe("starString", function () {
  it("renders five glyphs regardless of value", function () {
    expect(starString(0)).toHaveLength(5);
    expect(starString(5)).toHaveLength(5);
  });

  it("fills to the rounded average", function () {
    expect(starString(3)).toBe("★★★☆☆");
  });

  it("rounds a fractional average to the nearest star", function () {
    expect(starString(3.5)).toBe("★★★★☆");
    expect(starString(3.4)).toBe("★★★☆☆");
  });

  it("renders an empty row for zero", function () {
    expect(starString(0)).toBe("☆☆☆☆☆");
  });
});
