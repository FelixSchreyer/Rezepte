// Turns the recipes on the shopping list into one list of ingredients,
// adding up what is clearly the same thing. Pure: no state, no DOM.
//
// The rules are deliberately cautious. Two lines are only added up when
// their ingredient names match (after light normalising) and their units
// convert into each other (g/kg, ml/l, plain counts). Anything else stays
// on its own line — two lines of rice beat one wrong amount. "Tidy up with
// AI" in the shopping panel exists for the cases these rules leave alone.
//
// Recipes are kept in English (the quick fill translates), so the unit
// vocabulary is English plus the metric abbreviations.

// unit word -> [family, factor to the family's base unit]
var UNITS = {
  g: ["mass", 1], gram: ["mass", 1], grams: ["mass", 1], gr: ["mass", 1],
  kg: ["mass", 1000], kilo: ["mass", 1000], kilos: ["mass", 1000], kilogram: ["mass", 1000], kilograms: ["mass", 1000],
  ml: ["volume", 1], millilitre: ["volume", 1], milliliter: ["volume", 1], millilitres: ["volume", 1], milliliters: ["volume", 1],
  cl: ["volume", 10], dl: ["volume", 100],
  l: ["volume", 1000], litre: ["volume", 1000], liter: ["volume", 1000], litres: ["volume", 1000], liters: ["volume", 1000],
  tbsp: ["tbsp", 1], tablespoon: ["tbsp", 1], tablespoons: ["tbsp", 1],
  tsp: ["tsp", 1], teaspoon: ["tsp", 1], teaspoons: ["tsp", 1],
  cup: ["cup", 1], cups: ["cup", 1],
  can: ["can", 1], cans: ["can", 1], tin: ["can", 1], tins: ["can", 1],
  clove: ["clove", 1], cloves: ["clove", 1],
  pinch: ["pinch", 1], pinches: ["pinch", 1],
  bunch: ["bunch", 1], bunches: ["bunch", 1],
  slice: ["slice", 1], slices: ["slice", 1],
  pack: ["pack", 1], packs: ["pack", 1], packet: ["pack", 1], packets: ["pack", 1]
};

// How each family is written back out.
var UNIT_LABEL = { tbsp: "tbsp", tsp: "tsp", cup: "cup", can: "can", clove: "clove", pinch: "pinch", bunch: "bunch", slice: "slice", pack: "pack" };
var PLURAL_LABEL = { cup: "cups", can: "cans", clove: "cloves", pinch: "pinches", bunch: "bunches", slice: "slices", pack: "packs" };

var FRACTIONS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3 };

function parseNumber(s) {
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  var mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  var frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  var n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}

// "1 onion, finely chopped" -> "onion"; "rice (washed)" -> "rice";
// "of flour" -> "flour". What you buy, not how you prepare it.
function cleanName(s) {
  return s
    .replace(/\([^)]*\)/g, " ")
    .split(",")[0]
    .replace(/^of\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Lowercase and roughly singular, only for deciding what matches.
function nameKey(name) {
  return name.toLowerCase().split(" ").map(function (w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + "y";
    if (w.length > 4 && /oes$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /[^s]s$/.test(w)) return w.slice(0, -1);
    return w;
  }).join(" ");
}

var NUMBER = "(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[½¼¾⅓⅔])";
var LEADING = new RegExp("^" + NUMBER + "\\s*(?:-\\s*" + NUMBER + ")?\\s*(.*)$");

// "200 g white rice" -> { qty: 200, family: "mass", name: "white rice" }
// "salt to taste"    -> { qty: null, family: null, name: "salt to taste" }
export function parseIngredient(text) {
  var raw = String(text || "").trim();
  var m = LEADING.exec(raw);
  if (!m) {
    var bare = cleanName(raw);
    return { qty: null, family: null, name: bare, key: nameKey(bare) };
  }
  // "2-3 carrots": plan for the upper end.
  var qty = parseNumber(m[2] || m[1]);
  var rest = m[3];
  var family = "count";
  var factor = 1;
  var unitMatch = /^([a-zA-Z]+)\.?\s+(.*)$/.exec(rest) || /^([a-zA-Z]+)$/.exec(rest);
  if (unitMatch && UNITS[unitMatch[1].toLowerCase()]) {
    var u = UNITS[unitMatch[1].toLowerCase()];
    family = u[0];
    factor = u[1];
    rest = unitMatch[2] || "";
  }
  var name = cleanName(rest);
  if (qty === null || !name) return { qty: null, family: null, name: cleanName(raw), key: nameKey(cleanName(raw)) };
  return { qty: qty * factor, family: family, name: name, key: nameKey(name) };
}

function round(n) {
  return String(Math.round(n * 100) / 100);
}

// Scaling for more or fewer people leaves odd amounts; round them the way
// you would shop. Things bought whole are rounded up — 1.5 onions is 2.
var BOUGHT_WHOLE = { count: true, can: true, clove: true, bunch: true, slice: true, pack: true };

function shopRound(qty, family) {
  if (BOUGHT_WHOLE[family]) return Math.ceil(qty - 1e-9);
  if (family === "mass" || family === "volume") return qty >= 1000 ? Math.round(qty / 10) * 10 : Math.round(qty);
  return Math.round(qty * 4) / 4;   // spoons, cups, pinches: quarters
}

function formatAmount(qty, family) {
  qty = shopRound(qty, family);
  if (family === "mass") return qty >= 1000 ? round(qty / 1000) + " kg" : round(qty) + " g";
  if (family === "volume") return qty >= 1000 ? round(qty / 1000) + " l" : round(qty) + " ml";
  if (family === "count") return round(qty);
  var label = qty > 1 && PLURAL_LABEL[family] ? PLURAL_LABEL[family] : UNIT_LABEL[family];
  return round(qty) + " " + label;
}

// entries: [{ text: "200 g pasta", factor: 1.5 }, ...] — factor scales the
// amount (people cooked for / people the recipe serves).
// returns: display lines, alphabetical, e.g. ["3 eggs", "400 g pasta", "salt"]
export function aggregateIngredients(entries) {
  var groups = {};   // key|family -> { qty, family, names[], key }
  var order = [];
  var unquantified = {};   // key -> name

  entries.forEach(function (e) {
    var p = parseIngredient(e.text);
    if (!p.name) return;
    if (p.qty === null) {
      if (!unquantified[p.key]) unquantified[p.key] = p.name;
      return;
    }
    var id = p.key + "|" + p.family;
    if (!groups[id]) { groups[id] = { qty: 0, family: p.family, names: [], key: p.key }; order.push(id); }
    groups[id].qty += p.qty * (e.factor || 1);
    groups[id].names.push(p.name);
  });

  var lines = order.map(function (id) {
    var g = groups[id];
    // For several of something, prefer a plural spelling if one was used.
    var name = g.names[0];
    if (g.family === "count" && shopRound(g.qty, g.family) > 1) {
      name = g.names.filter(function (n) { return nameKey(n) !== n.toLowerCase(); })[0] || name;
    }
    return { key: g.key, text: formatAmount(g.qty, g.family) + " " + name };
  });

  // "salt to taste" adds nothing when "1 tsp salt" is already on the list.
  var quantifiedKeys = {};
  lines.forEach(function (l) { quantifiedKeys[l.key] = true; });
  Object.keys(unquantified).forEach(function (key) {
    if (!quantifiedKeys[key] && !quantifiedKeys[nameKey(key.replace(/ to taste$/, ""))]) {
      lines.push({ key: key, text: unquantified[key] });
    }
  });

  return lines
    .sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; })
    .map(function (l) { return l.text; });
}

export var DEFAULT_SERVINGS = 2;

// The recipes on the list, expanded into { text, factor } entries: each
// recipe scaled from the people it serves to the people it is cooked for.
export function shoppingEntries(items, recipes) {
  var byId = {};
  recipes.forEach(function (r) { byId[r.id] = r; });
  var out = [];
  items.forEach(function (item) {
    var r = byId[item.recipeId];
    if (!r) return;
    var factor = (item.people || DEFAULT_SERVINGS) / (r.servings || DEFAULT_SERVINGS);
    (r.ingredients || []).forEach(function (text) { out.push({ text: text, factor: factor }); });
  });
  return out;
}
