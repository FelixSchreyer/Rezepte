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
  state.myProfile = { id: "mock-user-alex", email: "alex@example.com", name: "Alex Moreau", role: "patient", status: "approved", isAdmin: false, joinedAt: 1 };
  state.auth = { mode: "signin", email: "", password: "", error: "", busy: false };
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

  it("shows the sign-in screen when nobody is signed in", function () {
    setState({ uid: null });
    render();
    expect(root.querySelectorAll("input[type=email]")).toHaveLength(1);
    expect(root.querySelectorAll("input[type=password]")).toHaveLength(1);
    expect(root.querySelectorAll(".app")).toHaveLength(0);
  });

  it("switches the sign-in screen to account creation", function () {
    setState({ uid: null, auth: { mode: "signup", email: "", password: "", error: "", busy: false } });
    render();
    expect(root.textContent).toContain("Create account");
    expect(root.querySelector("input[type=password]").getAttribute("autocomplete")).toBe("new-password");
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

describe("render — access", function () {
  function profile(over) {
    var p = { id: "mock-user-alex", email: "alex@example.com", name: "Alex Moreau", role: "patient", status: "approved", isAdmin: false, joinedAt: 1 };
    Object.keys(over || {}).forEach(function (k) { p[k] = over[k]; });
    return p;
  }

  it("shows the waiting screen, and no recipes, while pending", function () {
    setState({ recipes: SEED_RECIPES, myProfile: profile({ status: "pending" }) });
    render();
    expect(root.textContent).toContain("Waiting for approval");
    expect(root.querySelectorAll(".app")).toHaveLength(0);
    expect(root.querySelectorAll(".card")).toHaveLength(0);
  });

  it("shows the no-access screen when declined", function () {
    setState({ recipes: SEED_RECIPES, myProfile: profile({ status: "rejected" }) });
    render();
    expect(root.textContent).toContain("No access");
    expect(root.querySelectorAll(".card")).toHaveLength(0);
  });

  it("shows admins the members button with the number of open requests", function () {
    setState({
      myProfile: profile({ isAdmin: true }),
      members: {
        "mock-user-alex": profile({ isAdmin: true }),
        "u-new": { id: "u-new", email: "n@x.org", name: "New", role: "member", status: "pending", isAdmin: false, joinedAt: 5 }
      }
    });
    render();
    expect(root.querySelectorAll(".members-btn")).toHaveLength(1);
    expect(root.querySelector(".members-btn .icon-badge").textContent).toBe("1");
  });

  it("does not show the members button to non-admins", function () {
    setState({ members: { "u-new": { id: "u-new", name: "New", role: "member", status: "pending" } } });
    render();
    expect(root.querySelectorAll(".members-btn")).toHaveLength(0);
  });

  it("lists pending people with approve and decline in the members panel", function () {
    setState({
      myProfile: profile({ isAdmin: true }),
      members: {
        "mock-user-alex": profile({ isAdmin: true }),
        "u-new": { id: "u-new", email: "n@x.org", name: "New Person", role: "member", status: "pending", isAdmin: false, joinedAt: 5 }
      },
      modal: { type: "members", error: "" }
    });
    render();
    expect(root.textContent).toContain("New Person");
    expect(root.textContent).toContain("Let in");
    expect(root.textContent).toContain("Decline");
  });
});

describe("render — notification bell", function () {
  var fresh = { id: "fresh", title: "New soup", phases: ["remission"], tags: [], ingredients: [], addedBy: "mock-user-sam", addedByName: "Sam", createdAt: 10 };

  it("shows a badge with the number of unrated new recipes for a patient", function () {
    setState({ recipes: [fresh] });
    render();
    expect(root.querySelectorAll(".bell")).toHaveLength(1);
    expect(root.querySelector(".bell .icon-badge").textContent).toBe("1");
  });

  it("shows the bell without a badge when nothing is pending", function () {
    setState({ recipes: [fresh], ratings: [{ id: "rt", recipeId: "fresh", uid: "mock-user-alex", stars: 4, tolerance: "good" }] });
    render();
    expect(root.querySelectorAll(".bell")).toHaveLength(1);
    expect(root.querySelectorAll(".bell .icon-badge")).toHaveLength(0);
  });

  it("does not show the bell to members", function () {
    setState({ recipes: [fresh], myProfile: { name: "Sam Moreau", role: "member", status: "approved", joinedAt: 1 } });
    render();
    expect(root.querySelectorAll(".bell")).toHaveLength(0);
  });

  it("lists pending recipes in the notifications panel", function () {
    setState({ recipes: [fresh], modal: { type: "notifications" } });
    render();
    expect(root.querySelectorAll(".notif-item")).toHaveLength(1);
    expect(root.textContent).toContain("New soup");
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
