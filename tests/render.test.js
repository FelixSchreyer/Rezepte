// Smoke tests for the rendering layer.
//
// These are deliberately shallow — they assert that render() produces the
// right *kind* of DOM for a given state, not what it looks like. Their main
// value is that importing ui/app.js pulls in the entire UI module graph, so a
// broken import or a renamed export fails here rather than in the browser.

import { describe, it, expect } from "./harness.js";
import { state, root } from "../src/state.js";
import { render } from "../src/ui/app.js";
import { goBack } from "../src/ui/navigation.js";
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
  state.shopping = [];
  state.shoppingTidy = null;
  state.activePhase = null;
  state.activeTags = {};
  state.tagMenuOpen = false;
  state.photoUrls = {};
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
    setState({ recipes: SEED_RECIPES, activePhase: "severe" });
    render();
    var expected = SEED_RECIPES.filter(function (r) { return r.phases.indexOf("severe") !== -1; });
    expect(root.querySelectorAll(".card")).toHaveLength(expected.length);
  });

  it("shows every recipe under the last phase, since earlier phases carry over", function () {
    setState({ recipes: SEED_RECIPES, activePhase: "remission" });
    render();
    expect(root.querySelectorAll(".card")).toHaveLength(SEED_RECIPES.length);
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

describe("render — filters and photos", function () {
  it("stacks phase, tag filter, search and grid in that order", function () {
    setState({ recipes: SEED_RECIPES });
    render();
    var app = root.querySelector(".app");
    var order = Array.from(app.children).map(function (n) { return n.className.split(" ")[0]; });
    expect(order).toEqual(["top", "phase-row", "phase-row", "search-wrap", "grid"]);
    expect(app.children[2].querySelectorAll(".tag-dropdown")).toHaveLength(1);
  });

  it("keeps the tag checklist closed until opened", function () {
    setState({ recipes: SEED_RECIPES });
    render();
    expect(root.querySelectorAll(".tag-menu")).toHaveLength(0);
  });

  it("lists every tag as a checkbox when open, ticking the active ones", function () {
    setState({ recipes: SEED_RECIPES, tagMenuOpen: true, activeTags: { "Keto": true } });
    render();
    var boxes = root.querySelectorAll(".tag-menu input[type=checkbox]");
    expect(boxes.length > 0).toBe(true);
    var keto = Array.from(root.querySelectorAll(".tag-option")).filter(function (l) { return l.textContent === "Keto"; })[0];
    expect(keto.querySelector("input").checked).toBe(true);
  });

  it("names the active tag on the closed dropdown", function () {
    setState({ recipes: SEED_RECIPES, activeTags: { "Keto": true } });
    render();
    expect(root.querySelector(".tag-dropdown-label").textContent).toBe("Keto");
  });

  it("shows a recipe's photo on its card once its URL is known", function () {
    var withPhoto = SEED_RECIPES.map(function (r, i) {
      var copy = JSON.parse(JSON.stringify(r));
      if (i === 0) copy.photoPath = "u/p.jpg";
      return copy;
    });
    setState({ recipes: withPhoto, photoUrls: { "u/p.jpg": "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } });
    render();
    expect(root.querySelectorAll(".card .card-photo")).toHaveLength(1);
  });

  it("offers to add a photo in the detail view of a recipe without one", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "detail", recipeId: "r-congee", ratingStars: 0, ratingTol: "", ratingComment: "" } });
    render();
    expect(root.querySelector(".detail-photo .photo-pick").textContent).toBe("Add a photo");
  });
});

describe("render — shopping list", function () {
  function detail() {
    return { type: "detail", recipeId: "r-congee", ratingStars: 0, ratingTol: "", ratingComment: "" };
  }

  it("shows the cart with the number of planned recipes", function () {
    setState({ recipes: SEED_RECIPES, shopping: [{ recipeId: "r-congee", people: 2 }, { recipeId: "r-oats", people: 2 }] });
    render();
    expect(root.querySelector(".cart-btn .cart-count").textContent).toBe("2");
  });

  it("shows the cart without a count when the list is empty", function () {
    setState({ recipes: SEED_RECIPES });
    render();
    expect(root.querySelectorAll(".cart-btn")).toHaveLength(1);
    expect(root.querySelectorAll(".cart-count")).toHaveLength(0);
  });

  it("offers \"Add to shopping list\" on a recipe that isn't on it", function () {
    setState({ recipes: SEED_RECIPES, modal: detail() });
    render();
    expect(root.querySelector(".detail-shop").textContent).toContain("Add to shopping list");
  });

  it("shows the people stepper on a recipe that is on the list", function () {
    setState({ recipes: SEED_RECIPES, shopping: [{ recipeId: "r-congee", people: 3 }], modal: detail() });
    render();
    expect(root.querySelector(".detail-shop .stepper-value").textContent).toBe("3 people");
  });

  it("lists recipes and the added-up ingredients in the panel", function () {
    var recipes = [
      { id: "a", title: "Pasta A", phases: ["remission"], tags: [], servings: 2, ingredients: ["200 g pasta"] },
      { id: "b", title: "Pasta B", phases: ["remission"], tags: [], servings: 2, ingredients: ["200 g pasta"] }
    ];
    setState({ recipes: recipes, shopping: [{ recipeId: "a", people: 2 }, { recipeId: "b", people: 2 }], modal: { type: "shopping", error: "", tidying: false, confirmClear: false } });
    render();
    expect(root.querySelectorAll(".shop-recipe")).toHaveLength(2);
    var lines = Array.from(root.querySelectorAll(".shop-lines li")).map(function (li) { return li.textContent; });
    expect(lines).toEqual(["400 g pasta"]);
    expect(root.textContent).toContain("Add to Reminders");
    expect(root.textContent).toContain("Clear list");
  });

  it("uses the AI-tidied list while it still matches the recipes", function () {
    var recipes = [{ id: "a", title: "A", phases: ["remission"], tags: [], servings: 2, ingredients: ["200 g rice", "100 g white rice"] }];
    setState({
      recipes: recipes, shopping: [{ recipeId: "a", people: 2 }],
      shoppingTidy: { source: JSON.stringify(["200 g rice", "100 g white rice"]), items: ["300 g rice"] },
      modal: { type: "shopping", error: "", tidying: false, confirmClear: false }
    });
    render();
    var lines = Array.from(root.querySelectorAll(".shop-lines li")).map(function (li) { return li.textContent; });
    expect(lines).toEqual(["300 g rice"]);
    expect(root.textContent).toContain("Tidied up with AI");
  });

  it("asks for a second tap before clearing", function () {
    setState({ recipes: SEED_RECIPES, shopping: [{ recipeId: "r-congee", people: 2 }], modal: { type: "shopping", error: "", tidying: false, confirmClear: true } });
    render();
    expect(root.textContent).toContain("Tap again to clear the whole list");
  });

  it("explains how to fill the list when it's empty", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "shopping", error: "", tidying: false, confirmClear: false } });
    render();
    expect(root.textContent).toContain("Nothing planned yet");
  });
});

describe("back (swipe right / system back)", function () {
  it("closes a recipe back to the list", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "detail", recipeId: "r-congee", ratingStars: 0, ratingTol: "", ratingComment: "" } });
    render();
    goBack();
    expect(state.modal).toBeNull();
    expect(root.querySelectorAll(".overlay")).toHaveLength(0);
  });

  it("goes from an account sub-page to the account menu first", function () {
    setState({ modal: { type: "account", view: "details", name: "Alex Moreau", role: "patient", error: "" } });
    render();
    goBack();
    expect(state.modal.view).toBe("menu");
    goBack();
    expect(state.modal).toBeNull();
  });

  it("does nothing on the first-run onboarding, which can't be left", function () {
    setState({ myProfile: null });
    render();
    goBack();
    expect(state.modal.type).toBe("onboarding");
  });

  it("does nothing on the recipe list", function () {
    setState({ recipes: SEED_RECIPES });
    render();
    goBack();
    expect(state.modal).toBeNull();
    expect(root.querySelectorAll(".card").length > 0).toBe(true);
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

});

describe("render — account panel", function () {
  var fresh = { id: "fresh", title: "New soup", phases: ["remission"], tags: [], ingredients: [], addedBy: "mock-user-sam", addedByName: "Sam", createdAt: 10 };
  var newcomer = { id: "u-new", email: "n@x.org", name: "New Person", role: "member", status: "pending", isAdmin: false, joinedAt: 5 };

  function profile(over) {
    var p = { id: "mock-user-alex", email: "alex@example.com", name: "Alex Moreau", role: "patient", status: "approved", isAdmin: false, joinedAt: 1 };
    Object.keys(over || {}).forEach(function (k) { p[k] = over[k]; });
    return p;
  }
  function account(view) {
    return { type: "account", view: view, name: "Alex Moreau", role: "patient", error: "" };
  }
  function rowLabels() {
    return Array.from(root.querySelectorAll(".settings-row .settings-label")).map(function (n) { return n.textContent; });
  }

  it("keeps the header to the add button, the cart and the avatar", function () {
    setState({ recipes: [fresh] });
    render();
    expect(root.querySelectorAll(".top-actions > *")).toHaveLength(3);
  });

  it("badges the avatar with recipes to rate plus open requests", function () {
    var admin = profile({ isAdmin: true });
    setState({ recipes: [fresh], myProfile: admin, members: { "mock-user-alex": admin, "u-new": newcomer } });
    render();
    expect(root.querySelector(".profile-chip .icon-badge").textContent).toBe("2");
  });

  it("shows no badge when nothing is waiting", function () {
    setState({ recipes: [fresh], ratings: [{ id: "rt", recipeId: "fresh", uid: "mock-user-alex", stars: 4, tolerance: "good" }] });
    render();
    expect(root.querySelectorAll(".profile-chip .icon-badge")).toHaveLength(0);
  });

  it("does not count requests for non-admins or ratings for members", function () {
    setState({ recipes: [fresh], myProfile: profile({ role: "member" }), members: { "u-new": newcomer } });
    render();
    expect(root.querySelectorAll(".profile-chip .icon-badge")).toHaveLength(0);
  });

  it("offers a patient admin every row, with sign-out last", function () {
    var admin = profile({ isAdmin: true });
    setState({ myProfile: admin, members: { "mock-user-alex": admin }, modal: account("menu") });
    render();
    expect(rowLabels()).toEqual(["Recipes to rate", "Members & requests", "Your details", "Sign out"]);
  });

  it("offers a plain member only their details and sign-out", function () {
    setState({ myProfile: profile({ role: "member" }), modal: account("menu") });
    render();
    expect(rowLabels()).toEqual(["Your details", "Sign out"]);
  });

  it("shows the count on the row it belongs to", function () {
    setState({ recipes: [fresh], modal: account("menu") });
    render();
    expect(root.querySelector(".settings-count").textContent).toBe("1");
  });

  it("lists pending recipes on the ratings page, with a way back", function () {
    setState({ recipes: [fresh], modal: account("ratings") });
    render();
    expect(root.querySelectorAll(".notif-item")).toHaveLength(1);
    expect(root.textContent).toContain("New soup");
    expect(root.querySelectorAll(".back-btn")).toHaveLength(1);
  });

  it("lists pending people with approve and decline on the members page", function () {
    var admin = profile({ isAdmin: true });
    setState({ myProfile: admin, members: { "mock-user-alex": admin, "u-new": newcomer }, modal: account("members") });
    render();
    expect(root.textContent).toContain("New Person");
    expect(root.textContent).toContain("Let in");
    expect(root.textContent).toContain("Decline");
  });

  it("shows the name and role form on the details page", function () {
    setState({ modal: account("details") });
    render();
    expect(root.querySelector(".overlay input[type=text]").value).toBe("Alex Moreau");
    expect(root.textContent).toContain("Save changes");
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
    setState({ recipes: SEED_RECIPES, modal: { type: "add", title: "", phase: "", tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [], filling: false, filled: false, fillError: "" } });
    render();
    expect(root.textContent).toContain("Add a recipe");
  });

  it("asks for the earliest phase with a dropdown, not one pill per phase", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "add", title: "", phase: "", tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [], filling: false, filled: false, fillError: "" } });
    render();
    var select = root.querySelector(".overlay select");
    expect(select.options).toHaveLength(6);
    expect(select.value).toBe("");
    expect(root.textContent).toContain("Suitable from phase");
  });

  it("offers the free-text quick fill above the form", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "add", title: "", phase: "", tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [], filling: false, filled: false, fillError: "" } });
    render();
    expect(root.querySelectorAll(".quick-fill textarea")).toHaveLength(1);
    expect(root.textContent).toContain("Fill in the form");
    var camera = root.querySelector(".quick-fill-field .photo-pick-icon");
    expect(camera.getAttribute("aria-label")).toBe("Scan a recipe");
    expect(camera.textContent).toBe("");
  });

  it("puts \"Add a photo\" last, right before saving, styled as a field", function () {
    setState({ recipes: SEED_RECIPES, modal: { type: "add", title: "", phase: "", tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [], filling: false, filled: false, fillError: "" } });
    render();
    var save = Array.from(root.querySelectorAll(".overlay button")).filter(function (b) { return b.textContent === "Save recipe"; })[0];
    var before = save.previousElementSibling;
    expect(before.querySelector(".photo-pick-field").textContent).toBe("Add a photo");
    expect(before.querySelectorAll(".photo-pick-field .photo-pick-glyph svg")).toHaveLength(1);
    expect(before.querySelectorAll(".lbl")).toHaveLength(0);
  });

  it("shows scanned pages as thumbnails and stops offering more after three", function () {
    var page = { blob: null, preview: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" };
    setState({ recipes: SEED_RECIPES, modal: { type: "add", title: "", phase: "", tags: {}, customTagInput: "", ingredients: "", instructions: "", prepMinutes: "", photoBlob: null, photoPreview: "", saving: false, error: "", freeText: "", scans: [page, page, page], filling: false, filled: false, fillError: "" } });
    render();
    expect(root.querySelectorAll(".scan-thumb")).toHaveLength(3);
    expect(root.querySelectorAll(".quick-fill .photo-pick")).toHaveLength(0);
  });

  it("opens onboarding, without recursing, when the profile is missing", function () {
    // render() opens onboarding when there is no profile. It used to do that
    // through a helper that called render() straight back. Guard against that pair
    // becoming an infinite loop: a new user hits this path on first visit.
    setState({ recipes: SEED_RECIPES, myProfile: null });
    render();
    expect(root.querySelectorAll(".overlay")).toHaveLength(1);
    expect(root.textContent).toContain("Welcome to Gut & Grain");
  });
});
