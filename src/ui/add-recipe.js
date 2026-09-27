// "Add a recipe" form: an optional free-text quick fill (LLM), then title,
// photo, phases, tags, ingredients, instructions, prep time.

import { PHASES } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { allTags } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { closeModal, renderModalInPlace } from "./modal.js";
import { photoPicker } from "./photo-picker.js";

export function renderAddForm(m) {
  var wrap = el("div");
  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("h2", { text: "Add a recipe" }),
    el("button", { class: "close-x", attrs: { "aria-label": "Close" }, text: "✕", on: { click: closeModal } })
  ]));

  wrap.appendChild(renderQuickFill(m));

  var titleField = el("label", { class: "field" }, [ el("span", { class: "lbl", text: "Title" }) ]);
  var titleInput = el("input", { attrs: { type: "text", placeholder: "e.g. Soft rice congee with poached chicken" } });
  titleInput.value = m.title;
  titleInput.addEventListener("input", function(e){ m.title = e.target.value; });
  titleField.appendChild(titleInput);
  wrap.appendChild(titleField);

  wrap.appendChild(renderPhotoField(m));

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

  wrap.appendChild(el("button", {
    class: "btn btn-primary btn-block",
    attrs: m.saving ? { type: "button", disabled: "" } : { type: "button" },
    text: m.saving ? "Saving…" : "Save recipe",
    on: { click: function(){ if (!m.saving) submitAddRecipe(m); } }
  }));
  return wrap;
}

// Free text (typed, or dictated with the keyboard's microphone) -> the form
// fields below, via Backend.structureRecipe(). It only fills the form; the
// person checks it, picks the phases and saves as usual.
function renderQuickFill(m) {
  var box = el("div", { class: "quick-fill" }, [
    el("div", { class: "quick-fill-head" }, [
      el("span", { class: "lbl", text: "Describe it in your own words" }),
      el("span", { class: "hint", text: "Type or dictate with the microphone on your keyboard — ingredients and steps get sorted into the form below." })
    ])
  ]);

  var area = el("textarea", { attrs: {
    placeholder: "e.g. Rice congee. 200 g rice, a chicken breast, a litre of water. Simmer the rice for an hour, poach the chicken in it for the last 20 minutes…",
    "aria-label": "Recipe in your own words"
  } });
  area.value = m.freeText;
  area.addEventListener("input", function(e){ m.freeText = e.target.value; });
  box.appendChild(area);

  if (m.fillError) box.appendChild(el("div", { class: "form-error", style: "margin:8px 0 0;", text: m.fillError }));
  if (m.filled && !m.fillError) box.appendChild(el("div", { class: "quick-fill-done", text: "Filled in below — check everything, then pick the phases yourself." }));

  box.appendChild(el("button", {
    class: "btn btn-sm", style: "margin-top:10px;",
    attrs: m.filling ? { type: "button", disabled: "" } : { type: "button" },
    text: m.filling ? "Sorting it out…" : "Fill in the form",
    on: { click: function(){ if (!m.filling) quickFill(m); } }
  }));
  return box;
}

export function quickFill(m) {
  var text = m.freeText.trim();
  if (!text) { m.fillError = "Write or dictate the recipe first."; renderModalInPlace(); return; }
  m.fillError = "";
  m.filling = true;
  renderModalInPlace();

  Backend.structureRecipe(text, allTags()).then(function(res){
    // Overwrite with whatever came back, but never blank out a field the
    // model had nothing for. Tags are added, never removed; phases stay.
    if (res.title) m.title = res.title;
    if (res.ingredients && res.ingredients.length) m.ingredients = res.ingredients.join("\n");
    if (res.instructions) m.instructions = res.instructions;
    if (res.prepMinutes) m.prepMinutes = String(res.prepMinutes);
    (res.tags || []).forEach(function(t){ m.tags[t] = true; });
    m.filling = false;
    m.filled = true;
    renderModalInPlace();
  }).catch(function(err){
    m.filling = false;
    m.fillError = err && err.code === "rate"
      ? "The free quota for today is used up. Try again later, or fill in the form by hand."
      : "Couldn't sort this out right now. Fill in the form by hand, or try again in a moment.";
    renderModalInPlace();
  });
}

// The photo is held as a resized Blob on the draft and only uploaded when
// the recipe is saved, so abandoning the form leaves nothing behind.
function renderPhotoField(m) {
  var field = el("div", { class: "field" }, [
    el("span", { class: "lbl" }, [document.createTextNode("Photo "), el("span", { class: "hint", text: "— optional" })])
  ]);
  function setPhoto(blob) {
    if (m.photoPreview) URL.revokeObjectURL(m.photoPreview);
    m.photoBlob = blob;
    m.photoPreview = blob ? URL.createObjectURL(blob) : "";
    m.error = "";
    renderModalInPlace();
  }
  function fail(msg) { m.error = msg; renderModalInPlace(); }

  if (m.photoPreview) {
    field.appendChild(el("img", { class: "photo-preview", attrs: { src: m.photoPreview, alt: "" } }));
    field.appendChild(el("div", { class: "photo-actions" }, [
      photoPicker("Change photo", setPhoto, fail),
      el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Remove", on: { click: function(){ setPhoto(null); } } })
    ]));
  } else {
    field.appendChild(photoPicker("Add a photo", setPhoto, fail));
  }
  return field;
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
  m.saving = true;
  renderModalInPlace();
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
  var upload = m.photoBlob ? Backend.uploadPhoto(state.uid, m.photoBlob) : Promise.resolve(null);
  upload.then(function(photoPath){
    data.photoPath = photoPath;
    return Backend.addRecipe(data);
  }).then(function(){
    if (m.photoPreview) URL.revokeObjectURL(m.photoPreview);
    closeModal();
  }).catch(function(){
    m.saving = false;
    m.error = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
