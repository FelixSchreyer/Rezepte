// Tests for src/backend/mappers.js — the snake_case ↔ camelCase boundary.
//
// These matter more than they look: a Postgres column that is NULL arrives as
// null, and the UI assumes arrays are always arrays (it calls .indexOf and
// .join on them without guarding). The mappers are what make that assumption
// safe, so the null cases below are the point of this file.

import { describe, it, expect } from "./harness.js";
import { mapMember, mapRecipe, mapRating } from "../src/backend/mappers.js";

describe("mapMember", function () {
  it("renames the snake_case columns", function () {
    expect(mapMember({
      id: "u1", email: "a@x.org", name: "Alex", role: "patient", status: "approved", is_admin: true,
      joined_at: 1700000000000, last_phase: "moderate"
    })).toEqual({
      id: "u1", email: "a@x.org", name: "Alex", role: "patient", status: "approved", isAdmin: true,
      joinedAt: 1700000000000, lastPhase: "moderate"
    });
  });

  it("turns a missing is_admin into false", function () {
    expect(mapMember({ id: "u1", name: "Alex", role: "member", status: "pending" }).isAdmin).toBe(false);
  });

  it("passes a null last_phase through unchanged", function () {
    expect(mapMember({ id: "u1", name: "Alex", role: "member", joined_at: 1, last_phase: null }).lastPhase).toBeNull();
  });
});

describe("mapRecipe", function () {
  var row = {
    id: "r1",
    title: "Rice congee",
    phases: ["severe"],
    tags: ["Low-fiber"],
    ingredients: ["rice", "water"],
    instructions: "Simmer.",
    prep_minutes: 90,
    added_by: "u1",
    added_by_name: "Sam",
    photo_path: "u1/p.jpg",
    created_at: 1700000000000
  };

  it("maps every column to its app-side name", function () {
    expect(mapRecipe(row)).toEqual({
      id: "r1",
      title: "Rice congee",
      phases: ["severe"],
      tags: ["Low-fiber"],
      ingredients: ["rice", "water"],
      instructions: "Simmer.",
      prepMinutes: 90,
      addedBy: "u1",
      addedByName: "Sam",
      photoPath: "u1/p.jpg",
      createdAt: 1700000000000
    });
  });

  it("turns a missing photo into null", function () {
    expect(mapRecipe({ id: "r2" }).photoPath).toBeNull();
  });

  it("substitutes an empty array for null phases", function () {
    expect(mapRecipe({ phases: null }).phases).toEqual([]);
  });

  it("substitutes an empty array for null tags", function () {
    expect(mapRecipe({ tags: null }).tags).toEqual([]);
  });

  it("substitutes an empty array for null ingredients", function () {
    expect(mapRecipe({ ingredients: null }).ingredients).toEqual([]);
  });

  it("substitutes an empty string for null instructions", function () {
    expect(mapRecipe({ instructions: null }).instructions).toBe("");
  });

  it("leaves a null prep time as null rather than coercing it to 0", function () {
    // The UI tests prepMinutes for truthiness to decide whether to show
    // "· 20 min", so 0 and null must not become each other.
    expect(mapRecipe({ prep_minutes: null }).prepMinutes).toBeNull();
  });
});

describe("mapRating", function () {
  it("maps recipe_id to recipeId and keeps the rest", function () {
    expect(mapRating({
      id: "rt1", recipe_id: "r1", uid: "u1", name: "Alex",
      stars: 4, tolerance: "medium", comment: "ok", created_at: 1700000000000
    })).toEqual({
      id: "rt1", recipeId: "r1", uid: "u1", name: "Alex",
      stars: 4, tolerance: "medium", comment: "ok", createdAt: 1700000000000
    });
  });
});
