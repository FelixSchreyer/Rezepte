// "Add a recipe" form: an optional quick fill (LLM: free text and/or photos
// of a printed recipe), then title, phases, tags, ingredients, instructions,
// prep time and, last, a photo of the dish.

import { PHASES } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { allTags } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { closeModal, renderModalInPlace } from "./modal.js";
import { photoPicker } from "./photo-picker.js";
import { SCAN_PHOTO } from "../lib/photos.js";

var MAX_SCANS = 3;
var CAMERA_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

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

  wrap.appendChild(renderPhotoField(m));

  if (m.error) wrap.appendChild(el("div", { class: "form-error", text: m.error }));

  wrap.appendChild(el("button", {
    class: "btn btn-primary btn-block",
    attrs: m.saving ? { type: "button", disabled: "" } : { type: "button" },
    text: m.saving ? "Saving…" : "Save recipe",
    on: { click: function(){ if (!m.saving) submitAddRecipe(m); } }
  }));
  return wrap;
}

// Free text (typed, or dictated with the keyboard's microphone) and/or
// photos of a printed or handwritten recipe -> the form fields below, via
// Backend.structureRecipe(). It only fills the form; the person checks it,
// picks the phases and saves as usual. Scans are never saved — they are not
// the recipe's photo.
function renderQuickFill(m) {
  var box = el("div", { class: "quick-fill" }, [
    el("div", { class: "quick-fill-head" }, [
      el("span", { class: "lbl", text: "Describe it, or scan it" }),
      el("span", { class: "hint", text: "Type or dictate with the microphone on your keyboard, or photograph a printed or handwritten recipe — any language. It gets sorted into the form below, in English." })
    ])
  ]);

  var area = el("textarea", { attrs: {
    placeholder: "e.g. Rice congee. 200 g rice, a chicken breast, a litre of water. Simmer the rice for an hour, poach the chicken in it for the last 20 minutes…",
    "aria-label": "Recipe in your own words"
  } });
  area.value = m.freeText;
  area.addEventListener("input", function(e){ m.freeText = e.target.value; });

  // The camera sits in the textarea's bottom-right corner.
  var field = el("div", { class: "quick-fill-field" }, [ area ]);
  if (m.scans.length < MAX_SCANS) {
    field.appendChild(photoPicker(m.scans.length ? "Scan another page" : "Scan a recipe", function(blob){
      m.scans.push({ blob: blob, preview: URL.createObjectURL(blob) });
      m.fillError = "";
      renderModalInPlace();
    }, function(msg){ m.fillError = msg; renderModalInPlace(); }, { size: SCAN_PHOTO, icon: CAMERA_SVG }));
  }
  box.appendChild(field);

  if (m.scans.length) box.appendChild(renderScans(m));

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

// Thumbnails of the scanned pages (up to MAX_SCANS — a recipe spread over a
// few cookbook pages), each removable.
function renderScans(m) {
  var row = el("div", { class: "scan-row" });
  m.scans.forEach(function(scan, i){
    row.appendChild(el("div", { class: "scan-thumb" }, [
      el("img", { attrs: { src: scan.preview, alt: "Recipe page " + (i + 1) } }),
      el("button", { class: "scan-remove", attrs: { type: "button", "aria-label": "Remove page " + (i + 1) }, text: "✕", on: { click: function(){
        URL.revokeObjectURL(scan.preview);
        m.scans.splice(i, 1);
        renderModalInPlace();
      } } })
    ]));
  });
  return row;
}

export function quickFill(m) {
  var text = m.freeText.trim();
  if (!text && !m.scans.length) { m.fillError = "Write, dictate or scan the recipe first."; renderModalInPlace(); return; }
  m.fillError = "";
  m.filling = true;
  renderModalInPlace();

  Backend.structureRecipe(text, allTags(), m.scans.map(function(s){ return s.blob; })).then(function(res){
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
    var code = err && err.code;
    m.fillError = code === "rate" ? "The free quota for today is used up. Try again later, or fill in the form by hand."
      : code === "busy" ? "Gemini is overloaded right now. Try again in a minute."
      : code === "large" ? "The photos are too large. Try fewer pages, or crop them closer to the recipe."
      : code === "missing" ? "Quick fill isn't set up yet: the structure-recipe function is missing in Supabase."
      : code === "denied" ? "Quick fill refused the request. Try signing out and in again."
      : "Couldn't sort this out right now. Fill in the form by hand, or try again in a moment.";
    renderModalInPlace();
  });
}

// The photo is held as a resized Blob on the draft and only uploaded when
// the recipe is saved, so abandoning the form leaves nothing behind.
// No heading: the "Add a photo" box, styled like the text fields around it,
// says enough on its own.
function renderPhotoField(m) {
  var field = el("div", { class: "field" });
  function setPhoto(blob) {
    if (m.photoPreview) URL.revokeObjectURL(m.photoPreview);
    m.photoBlob = blob;
    m.photoPreview = blob ? URL.createObjectURL(blob) : "";
    m.error = "";
    renderModalInPlace();
  }
  function fail(msg) { m.error = msg; renderModalInPlace(); }

  if (m.photoPreview) {
    field.appendChild(el("img", { class: "photo-preview", attrs: { src: m.photoPreview, alt: "Photo of the dish" } }));
    field.appendChild(el("div", { class: "photo-actions" }, [
      photoPicker("Change photo", setPhoto, fail),
      el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Remove", on: { click: function(){ setPhoto(null); } } })
    ]));
  } else {
    field.appendChild(photoPicker("Add a photo", setPhoto, fail, { look: "field", icon: CAMERA_SVG }));
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
    m.scans.forEach(function(scan){ URL.revokeObjectURL(scan.preview); });
    closeModal();
  }).catch(function(){
    m.saving = false;
    m.error = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
