// Smoke tests for the rendering layer.
//
// These are deliberately shallow — they assert that render() produces the
// right *kind* of DOM for a given state, not what it looks like. Their main
// value is that importing ui/app.js pulls in the entire UI module graph, so a
// broken import or a renamed export fails here rather than in the browser.

import { describe, it, expect } from "./harness.js";
import { state, root } from "../src/state.js";
import { render } from "../src/ui/app.js";
import { SEED_RECIPES } from "../src/backend/seed.js";

function setState(patch) {
  state.ready = true;
  state.capsMissing = false;
  state.slowLoad = false;
  state.uid = "mock-user-alex";
  state.myProfile = { name: "Alex Moreau", role: "patient", joinedAt: 1 };
  state.members = {};
  state.recipes = [];
  state.ratings = [];
  state.activePhase = null;
  state.activeTags = {};
  state.search = "";
  state.modal = null;
  Object.keys(patch || {}).forEach(function (k) { state[k] = patch[k]; });
}

describe("render — screens", function () {
  it("shows the loading screen before it is ready", function () {
    setState({ ready: false });
    render();
    expect(root.querySelectorAll(".center-screen")).toHaveLength(1);
    expect(root.querySelectorAll(".app")).toHaveLength(0);
  });

  it("shows the connection-failure screen when capsMissing", function () {
    setState({ capsMissing: true });
    render();
    expect(root.textContent).toContain("Couldn't connect");
  });

  it("shows the sign-in-failure screen when there is no uid", function () {
    setState({ uid: null });
    render();
    expect(root.textContent).toContain("Couldn't sign you in");
  });

  it("offers a retry button on the slow-load path", function () {
    setState({ ready: false, slowLoad: true });
    render();
    expect(root.textContent).toContain("taking longer than expected");
  });
});

describe("render — the recipe grid", function () {
  it("renders one card per recipe", function () {
    setState({ recipes: SEED_RECIPES });
    render();
    expect(root.querySelectorAll(".card")).toHaveLength(SEED_RECIPES.length);
  });

  it("renders the empty state when there are no recipes", function () {
    setState({ recipes: [] });
    render();
    expect(root.querySelectorAll(".card")).toHaveLength(0);
    expect(root.textContent).toContain("The recipe box is empty");
  });

  it("narrows the grid to the active phase", function () {
    setState({ recipes: SEED_RECIPES, activePhase: "remission" });
    render();
    var expected = SEED_RECIPES.filter(function (r) { return r.phases.indexOf("remission") !== -1; });
    expect(root.querySelectorAll(".card")).toHaveLength(expected.length);
  });

  it("uses the phase-specific empty copy when a filter excludes everything", function () {
    setState({ recipes: SEED_RECIPES, activePhase: "severe", search: "zzzznothing" });
    render();
    expect(root.textContent).toContain("Nothing filed under Severe yet");
  });

  it("renders the header and the filter controls alongside the grid", function () {
    setState({ recipes: SEED_RECIPES });
    render();
    expect(root.querySelectorAll("header.top")).toHaveLength(1);
    expect(root.querySelectorAll(".phase-dropdown select")).toHaveLength(1);
    expect(root.querySelectorAll(".search-wrap input")).toHaveLength(1);
  });
});

describe("render — modals", function () {
  it("renders the detail panel for an open recipe", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "detail", recipeId: "r-congee", ratingStars: 0, ratingTol: "", ratingComment: "" } });
    render();
    expect(root.querySelectorAll(".overlay")).toHaveLength(1);
    expect(root.textContent).toContain("Soft rice congee");
  });

  it("renders the add-recipe form", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "add", title: "", phases: {}, tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", error: "" } });
    render();
    expect(root.textContent).toContain("Add a recipe");
  });

  it("opens onboarding, without recursing, when the profile is missing", function () {
    // render() calls openOnboarding() when there is no profile, and
    // openOnboarding() calls render() straight back. Guard against that pair
    // becoming an infinite loop: a new user hits this path on first visit.
    setState({ recipes: SEED_RECIPES, myProfile: null });
    render();
    expect(root.querySelectorAll(".overlay")).toHaveLength(1);
    expect(root.textContent).toContain("Welcome to Gut & Grain");
  });
});
