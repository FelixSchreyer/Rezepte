// Tests for src/lib/shopping.js — reading amounts out of ingredient lines
// and adding up the shopping list. The rule these guard most: never add up
// things that aren't clearly the same, never produce a wrong amount.

import { describe, it, expect } from "./harness.js";
import { parseIngredient, aggregateIngredients, shoppingEntries } from "../src/lib/shopping.js";

function sum(texts, factor) {
  return aggregateIngredients(texts.map(function (t) { return { text: t, factor: factor || 1 }; }));
}

describe("parseIngredient", function () {
  it("reads amount, unit and name", function () {
    var p = parseIngredient("200 g white rice");
    expect(p.qty).toBe(200);
    expect(p.family).toBe("mass");
    expect(p.name).toBe("white rice");
  });

  it("converts to the unit family's base (kg to g, l to ml)", function () {
    expect(parseIngredient("1.5 kg potatoes").qty).toBe(1500);
    expect(parseIngredient("1 l water").qty).toBe(1000);
  });

  it("reads fractions and decimal commas", function () {
    expect(parseIngredient("½ tsp salt").qty).toBe(0.5);
    expect(parseIngredient("1/2 cup oats").qty).toBe(0.5);
    expect(parseIngredient("0,5 l milk").qty).toBe(500);
  });

  it("plans for the top of a range", function () {
    expect(parseIngredient("2-3 carrots").qty).toBe(3);
  });

  it("treats a number without unit as a count", function () {
    var p = parseIngredient("2 eggs");
    expect(p.family).toBe("count");
    expect(p.name).toBe("eggs");
  });

  it("drops preparation notes from the name", function () {
    expect(parseIngredient("1 onion, finely chopped").name).toBe("onion");
    expect(parseIngredient("200 g rice (washed)").name).toBe("rice");
  });

  it("leaves lines without an amount unquantified", function () {
    expect(parseIngredient("salt to taste").qty).toBeNull();
  });
});

describe("aggregateIngredients", function () {
  it("adds up the same ingredient", function () {
    expect(sum(["200 g pasta", "200 g pasta"])).toEqual(["400 g pasta"]);
  });

  it("adds across units of the same kind and shows big amounts in kg / l", function () {
    expect(sum(["600 g flour", "0.6 kg flour"])).toEqual(["1.2 kg flour"]);
    expect(sum(["500 ml milk", "1 l milk"])).toEqual(["1.5 l milk"]);
  });

  it("matches singular and plural, and keeps the plural for several", function () {
    expect(sum(["2 eggs", "1 egg"])).toEqual(["3 eggs"]);
  });

  it("ignores case and preparation notes when matching", function () {
    expect(sum(["1 Onion, diced", "2 onions"])).toEqual(["3 onions"]);
  });

  it("keeps amounts that don't convert apart instead of guessing", function () {
    expect(sum(["1 cup rice", "200 g rice"])).toEqual(["1 cup rice", "200 g rice"]);
  });

  it("keeps different ingredients apart, sorted by name", function () {
    expect(sum(["200 g rice", "100 g white rice"])).toEqual(["200 g rice", "100 g white rice"]);
  });

  it("drops an unquantified line when the same thing is on the list with an amount", function () {
    expect(sum(["salt to taste", "1 tsp salt"])).toEqual(["1 tsp salt"]);
  });

  it("keeps an unquantified line once", function () {
    expect(sum(["salt", "salt"])).toEqual(["salt"]);
  });

  it("adds up spoon fractions", function () {
    expect(sum(["½ tsp salt", "½ tsp salt"])).toEqual(["1 tsp salt"]);
  });

  it("scales by the factor and rounds things bought whole up", function () {
    expect(sum(["1 onion", "200 g rice"], 1.5)).toEqual(["2 onion", "300 g rice"]);
  });
});

describe("shoppingEntries", function () {
  var recipes = [
    { id: "a", servings: 4, ingredients: ["400 g pasta"] },
    { id: "b", servings: 2, ingredients: ["2 eggs"] }
  ];

  it("scales each recipe from the people it serves to the people it's cooked for", function () {
    var entries = shoppingEntries([{ recipeId: "a", people: 2 }, { recipeId: "b", people: 3 }], recipes);
    expect(aggregateIngredients(entries)).toEqual(["3 eggs", "200 g pasta"]);
  });

  it("assumes 2 people when a recipe or list entry has no count", function () {
    var entries = shoppingEntries([{ recipeId: "c" }], [{ id: "c", ingredients: ["100 g rice"] }]);
    expect(aggregateIngredients(entries)).toEqual(["100 g rice"]);
  });

  it("skips entries whose recipe is gone", function () {
    expect(shoppingEntries([{ recipeId: "zzz", people: 2 }], recipes)).toEqual([]);
  });
});
