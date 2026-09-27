// The family's shopping list: which recipes are planned and for how many
// people, the ingredients added up (lib/shopping.js), an optional AI tidy-up,
// and the export to Apple Reminders through a Shortcut.
//
// Reminders can't be written to from a web page, so "Add to Reminders" opens
// a Shortcut by name (shortcuts://run-shortcut) and hands it the list, one
// item per line. Each person sets that Shortcut up once — the steps are in
// the panel.

import { SHOPPING_SHORTCUT } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { aggregateIngredients, shoppingEntries, DEFAULT_SERVINGS } from "../lib/shopping.js";
import { Backend } from "../backend/index.js";
import { closeModal, renderModalInPlace } from "./modal.js";

var MAX_PEOPLE = 50;

// The list as the rules add it up — what gets exported unless an AI-tidied
// version of exactly this list exists.
export function shoppingLines() {
  return aggregateIngredients(shoppingEntries(state.shopping, state.recipes));
}

function currentLines() {
  var lines = shoppingLines();
  var tidy = state.shoppingTidy;
  if (tidy && tidy.source === JSON.stringify(lines)) return { lines: tidy.items, tidied: true };
  return { lines: lines, tidied: false };
}

export function shoppingItemFor(recipeId) {
  return state.shopping.filter(function(s){ return s.recipeId === recipeId; })[0] || null;
}

// [ − ]  3 people  [ + ]
export function peopleStepper(people, onChange) {
  function step(delta, label, disabled) {
    return el("button", {
      class: "stepper-btn", text: delta < 0 ? "−" : "+",
      attrs: disabled ? { type: "button", "aria-label": label, disabled: "" } : { type: "button", "aria-label": label },
      on: { click: function(){ onChange(people + delta); } }
    });
  }
  return el("div", { class: "stepper", attrs: { role: "group", "aria-label": "People" } }, [
    step(-1, "Fewer people", people <= 1),
    el("span", { class: "stepper-value", text: people + (people === 1 ? " person" : " people") }),
    step(1, "More people", people >= MAX_PEOPLE)
  ]);
}

export function setPeople(recipeId, people) {
  people = Math.max(1, Math.min(MAX_PEOPLE, people));
  return Backend.setShoppingPeople(recipeId, people, state.uid);
}

export function renderShopping(m) {
  var wrap = el("div");
  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("h2", { text: "Shopping list" }),
    el("button", { class: "close-x", attrs: { type: "button", "aria-label": "Close" }, text: "✕", on: { click: closeModal } })
  ]));

  var byId = {};
  state.recipes.forEach(function(r){ byId[r.id] = r; });
  var items = state.shopping.filter(function(s){ return byId[s.recipeId]; });

  if (!items.length) {
    wrap.appendChild(el("p", { class: "notif-empty", text: "Nothing planned yet. Open a recipe and tap “Add to shopping list”." }));
    return wrap;
  }

  if (m.error) wrap.appendChild(el("div", { class: "form-error", style: "margin:0 0 14px;", text: m.error }));

  // Recipes, each with its people count.
  var recipes = el("div", { class: "detail-section" }, [ el("h4", { text: "Recipes" }) ]);
  var ul = el("ul", { class: "shop-recipes" });
  items.forEach(function(item){
    var r = byId[item.recipeId];
    ul.appendChild(el("li", { class: "shop-recipe" }, [
      el("div", { class: "shop-recipe-title" }, [
        el("span", { class: "name", text: r.title }),
        el("span", { class: "meta", text: "Recipe serves " + (r.servings || DEFAULT_SERVINGS) })
      ]),
      peopleStepper(item.people || DEFAULT_SERVINGS, function(n){
        setPeople(r.id, n).catch(function(){ m.error = "Couldn't update the list — check your connection."; renderModalInPlace(); });
      }),
      el("button", { class: "shop-remove", attrs: { type: "button", "aria-label": "Remove " + r.title }, text: "✕", on: { click: function(){
        Backend.removeFromShopping(r.id).catch(function(){ m.error = "Couldn't update the list — check your connection."; renderModalInPlace(); });
      } } })
    ]));
  });
  recipes.appendChild(ul);
  wrap.appendChild(recipes);

  // The added-up ingredients.
  var current = currentLines();
  var ingredients = el("div", { class: "detail-section" }, [ el("h4", { text: "To buy (" + current.lines.length + ")" }) ]);
  if (current.tidied) {
    ingredients.appendChild(el("div", { class: "shop-note" }, [
      document.createTextNode("Tidied up with AI — check it before exporting. "),
      el("button", { class: "link-btn", attrs: { type: "button" }, text: "Undo", on: { click: function(){ state.shoppingTidy = null; renderModalInPlace(); } } })
    ]));
  }
  var list = el("ul", { class: "shop-lines" });
  current.lines.forEach(function(line){ list.appendChild(el("li", { text: line })); });
  ingredients.appendChild(list);
  wrap.appendChild(ingredients);

  // Actions.
  var actions = el("div", { class: "shop-actions" });
  actions.appendChild(el("button", {
    class: "btn btn-primary btn-block", attrs: { type: "button" }, text: "Add to Reminders",
    on: { click: function(){ exportToReminders(current.lines); } }
  }));
  if (!current.tidied) {
    actions.appendChild(el("button", {
      class: "btn btn-block", attrs: m.tidying ? { type: "button", disabled: "" } : { type: "button" },
      text: m.tidying ? "Tidying up…" : "Tidy up with AI",
      on: { click: function(){ if (!m.tidying) tidyUp(m); } }
    }));
  }
  actions.appendChild(el("button", {
    class: "btn btn-ghost btn-block shop-clear", attrs: { type: "button" },
    text: m.confirmClear ? "Tap again to clear the whole list" : "Clear list",
    on: { click: function(){ clearList(m); } }
  }));
  wrap.appendChild(actions);

  wrap.appendChild(renderShortcutHelp());
  return wrap;
}

function exportToReminders(lines) {
  window.location.href = "shortcuts://run-shortcut?name=" + encodeURIComponent(SHOPPING_SHORTCUT) +
    "&input=text&text=" + encodeURIComponent(lines.join("\n"));
}

function tidyUp(m) {
  var lines = shoppingLines();
  m.tidying = true;
  m.error = "";
  renderModalInPlace();
  Backend.tidyShoppingList(lines).then(function(items){
    state.shoppingTidy = { source: JSON.stringify(lines), items: items };
    m.tidying = false;
    renderModalInPlace();
  }).catch(function(err){
    m.tidying = false;
    var code = err && err.code;
    m.error = code === "rate" ? "The free AI quota for today is used up. The list below is still fine to export."
      : code === "busy" ? "Gemini is overloaded right now. Try again in a minute — or export the list as it is."
      : "Couldn't tidy up right now. The list below is still fine to export.";
    renderModalInPlace();
  });
}

// Two taps, so a stray one doesn't wipe the family's list.
function clearList(m) {
  if (!m.confirmClear) { m.confirmClear = true; renderModalInPlace(); return; }
  m.confirmClear = false;
  Backend.clearShopping().then(function(){
    state.shoppingTidy = null;
  }).catch(function(){
    m.error = "Couldn't clear the list — check your connection.";
    renderModalInPlace();
  });
}

function renderShortcutHelp() {
  var steps = el("ol", { class: "shop-help-steps" }, [
    el("li", { text: "Open the Shortcuts app and create a new shortcut named exactly “" + SHOPPING_SHORTCUT + "”." }),
    el("li", { text: "Add “Split Text”: split the Shortcut Input by New Lines." }),
    el("li", { text: "Add “Repeat with Each” for the split text." }),
    el("li", { text: "Inside it, add “Add New Reminder” with the Repeat Item, in your shopping list (e.g. “Groceries”)." }),
    el("li", { text: "If the list arrives empty: tap the shortcut's input at the top and set it to receive Text." })
  ]);
  return el("details", { class: "shop-help" }, [
    el("summary", { text: "First time? Set up “Add to Reminders” (iPhone, iPad, Mac)" }),
    steps
  ]);
}
