// "Add a recipe" form: title, phases, tags, ingredients, instructions, prep time.

import { PHASES } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { allTags } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { closeModal, renderModalInPlace } from "./modal.js";

export function renderAddForm(m) {
  var wrap = el("div");
  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("h2", { text: "Add a recipe" }),
    el("button", { class: "close-x", attrs: { "aria-label": "Close" }, text: "✕", on: { click: closeModal } })
  ]));

  var titleField = el("label", { class: "field" }, [ el("span", { class: "lbl", text: "Title" }) ]);
  var titleInput = el("input", { attrs: { type: "text", placeholder: "e.g. Soft rice congee with poached chicken" } });
  titleInput.value = m.title;
  titleInput.addEventListener("input", function(e){ m.title = e.target.value; });
  titleField.appendChild(titleInput);
  wrap.appendChild(titleField);

  var phaseField = el("label", { class: "field" }, [ el("span", { class: "lbl" }, [document.createTextNode("Suited to phase "), el("span", { class: "hint", text: "— required, pick one or more" })]) ]);
  var phaseGrid = el("div", { class: "check-grid" });
  PHASES.forEach(function(p){
    var pill = el("label", { class: "check-pill" }, [
      el("input", { attrs: { type: "checkbox" } }),
      document.createTextNode(p.label)
    ]);
    var input = pill.querySelector("input");
    input.checked = !!m.phases[p.id];
    pill.dataset.checked = String(!!m.phases[p.id]);
    input.addEventListener("change", function(){
      m.phases[p.id] = input.checked;
      pill.dataset.checked = String(input.checked);
    });
    phaseGrid.appendChild(pill);
  });
  phaseField.appendChild(phaseGrid);
  wrap.appendChild(phaseField);

  var tagField = el("label", { class: "field" }, [ el("span", { class: "lbl" }, [document.createTextNode("Tags "), el("span", { class: "hint", text: "— required, pick or add" })]) ]);
  var tagGrid = el("div", { class: "check-grid" });
  function addTagPill(tag) {
    var pill = el("label", { class: "check-pill" }, [
      el("input", { attrs: { type: "checkbox" } }),
      document.createTextNode(tag)
    ]);
    var input = pill.querySelector("input");
    input.checked = !!m.tags[tag];
    pill.dataset.checked = String(!!m.tags[tag]);
    input.addEventListener("change", function(){
      m.tags[tag] = input.checked;
      pill.dataset.checked = String(input.checked);
    });
    tagGrid.appendChild(pill);
  }
  allTags().forEach(addTagPill);
  tagField.appendChild(tagGrid);

  var addTagRow = el("div", { class: "add-tag-row" });
  var newTagInput = el("input", { attrs: { type: "text", placeholder: "Add a custom tag" } });
  newTagInput.value = m.customTagInput;
  newTagInput.addEventListener("input", function(e){ m.customTagInput = e.target.value; });
  var addTagBtn = el("button", { class: "btn btn-sm", attrs: { type: "button" }, text: "Add", on: { click: function(){
    var t = m.customTagInput.trim();
    if (!t) return;
    m.tags[t] = true;
    m.customTagInput = "";
    addTagPill(t);
    newTagInput.value = "";
  } } });
  addTagRow.appendChild(newTagInput);
  addTagRow.appendChild(addTagBtn);
  tagField.appendChild(addTagRow);
  wrap.appendChild(tagField);

  var ingField = el("label", { class: "field" }, [ el("span", { class: "lbl" }, [document.createTextNode("Ingredients "), el("span", { class: "hint", text: "— required, one per line" })]) ]);
  var ingArea = el("textarea", { attrs: { placeholder: "200g white rice\n1 chicken breast\n1L water\nsalt" } });
  ingArea.value = m.ingredients;
  ingArea.addEventListener("input", function(e){ m.ingredients = e.target.value; });
  ingField.appendChild(ingArea);
  wrap.appendChild(ingField);

  var instField = el("label", { class: "field" }, [ el("span", { class: "lbl" }, [document.createTextNode("Instructions "), el("span", { class: "hint", text: "— optional" })]) ]);
  var instArea = el("textarea", { attrs: { placeholder: "Step by step…" } });
  instArea.value = m.instructions;
  instArea.addEventListener("input", function(e){ m.instructions = e.target.value; });
  instField.appendChild(instArea);
  wrap.appendChild(instField);

  var prepField = el("label", { class: "field" }, [ el("span", { class: "lbl" }, [document.createTextNode("Prep time in minutes "), el("span", { class: "hint", text: "— optional" })]) ]);
  var prepInput = el("input", { attrs: { type: "number", min: "0", placeholder: "20" } });
  prepInput.value = m.prepMinutes;
  prepInput.addEventListener("input", function(e){ m.prepMinutes = e.target.value; });
  prepField.appendChild(prepInput);
  wrap.appendChild(prepField);

  if (m.error) wrap.appendChild(el("div", { class: "form-error", text: m.error }));

  wrap.appendChild(el("button", { class: "btn btn-primary btn-block", attrs: { type: "button" }, text: "Save recipe", on: { click: function(){ submitAddRecipe(m); } } }));
  return wrap;
}

export function submitAddRecipe(m) {
  var title = m.title.trim();
  var phases = Object.keys(m.phases).filter(function(k){ return m.phases[k]; });
  var tags = Object.keys(m.tags).filter(function(k){ return m.tags[k]; });
  var ingredients = m.ingredients.split("\n").map(function(s){ return s.trim(); }).filter(Boolean);

  if (!title) { m.error = "Please give the recipe a title."; renderModalInPlace(); return; }
  if (!phases.length) { m.error = "Pick at least one phase."; renderModalInPlace(); return; }
  if (!tags.length) { m.error = "Pick or add at least one tag."; renderModalInPlace(); return; }
  if (!ingredients.length) { m.error = "List at least one ingredient."; renderModalInPlace(); return; }

  m.error = "";
  var data = {
    title: title,
    phases: phases,
    tags: tags,
    ingredients: ingredients,
    instructions: m.instructions.trim(),
    prepMinutes: m.prepMinutes ? Number(m.prepMinutes) : null,
    addedBy: state.uid,
    addedByName: (state.myProfile && state.myProfile.name) || "Someone",
    createdAt: Date.now()
  };
  Backend.addRecipe(data).then(function(){
    closeModal();
  }).catch(function(){
    m.error = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
