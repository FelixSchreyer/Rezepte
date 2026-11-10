// Recipe detail panel and the rating form inside it (patients only).

import { PHASE_MAP, TOLERANCE, TOL_MAP } from "../config.js";
import { state } from "../state.js";
import { el, sinceLabel } from "../lib/dom.js";
import { ratingsFor, ratingSummary, starString, recipePhases } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { closeModal, openEditRecipe, renderModalInPlace } from "./modal.js";
import { photoPicker } from "./photo-picker.js";
import { peopleStepper, setPeople, shoppingItemFor } from "./shopping.js";
import { DEFAULT_SERVINGS } from "../lib/shopping.js";
import { fromLocalInput, lastCooked, quickCookTimes, toLocalInput } from "../lib/checkins.js";

export function renderDetail(m) {
  var r = state.recipes.find(function(x){ return x.id === m.recipeId; });
  var wrap = el("div");
  if (!r) {
    wrap.appendChild(el("div", { class: "panel-head" }, [
      el("h2", { text: "Recipe removed" }),
      el("button", { class: "close-x", text: "✕", on: { click: closeModal } })
    ]));
    return wrap;
  }

  wrap.appendChild(el("div", { class: "panel-head" }, [
    el("h2", { text: r.title }),
    el("button", { class: "close-x", attrs: { "aria-label": "Close" }, text: "✕", on: { click: closeModal } })
  ]));

  wrap.appendChild(renderDetailPhoto(m, r));

  // Only the earliest phase: every later one is implied.
  var earliest = PHASE_MAP[recipePhases(r)[0]];
  var dots = el("div", { class: "detail-phase-dots" });
  if (earliest) dots.appendChild(el("span", { style: "background:" + earliest.color, text: earliest.label, attrs: { title: "Suitable from this phase on" } }));
  wrap.appendChild(dots);

  if ((r.tags||[]).length) wrap.appendChild(el("div", { class: "tags", text: (r.tags||[]).join(" · ") }));
  var servings = r.servings || DEFAULT_SERVINGS;
  wrap.appendChild(el("div", { class: "meta-line", style: "margin-top:8px;", text: "Added by " + (r.addedByName || "someone") + " · Serves " + servings + (r.prepMinutes ? " · " + r.prepMinutes + " min" : "") }));
  wrap.appendChild(renderShoppingControl(m, r, servings));
  wrap.appendChild(renderCookControl(m, r));

  var ingSection = el("div", { class: "detail-section" }, [ el("h4", { text: "Ingredients" }) ]);
  var ul = el("ul", { class: "ingredient-list" });
  (r.ingredients||[]).forEach(function(i){ ul.appendChild(el("li", { text: i })); });
  ingSection.appendChild(ul);
  wrap.appendChild(ingSection);

  if (r.instructions) {
    wrap.appendChild(el("div", { class: "detail-section" }, [
      el("h4", { text: "Instructions" }),
      el("div", { class: "instructions", text: r.instructions })
    ]));
  }

  var summary = ratingSummary(r.id);
  var ratingSection = el("div", { class: "detail-section" }, [ el("h4", { text: "Ratings" }) ]);
  if (summary) {
    ratingSection.appendChild(el("div", { style: "margin-bottom:8px;" }, [
      el("span", { class: "stars", text: starString(summary.avg) }),
      document.createTextNode(" " + summary.avg.toFixed(1) + " · " + summary.count + " rating" + (summary.count > 1 ? "s" : ""))
    ]));
  }
  var rs = ratingsFor(r.id).sort(function(a,b){ return (b.createdAt||0) - (a.createdAt||0); });
  if (!rs.length) {
    ratingSection.appendChild(el("div", { style: "color:var(--ink-faint); font-size:14px;", text: "No ratings yet." }));
  }
  rs.forEach(function(rt){
    var item = el("div", { class: "rating-item" });
    var head = el("div", { class: "rhead" }, [
      el("span", { class: "who" }, [
        document.createTextNode(rt.name + " "),
        el("span", { class: "stars", text: starString(rt.stars) })
      ]),
      el("span", { class: "tol", text: TOL_MAP[rt.tolerance] ? TOL_MAP[rt.tolerance].label : "" })
    ]);
    item.appendChild(head);
    if (rt.comment) item.appendChild(el("div", { class: "comment", text: rt.comment }));
    ratingSection.appendChild(item);
  });
  wrap.appendChild(ratingSection);

  if (state.myProfile && state.myProfile.role === "patient") {
    wrap.appendChild(renderRatingForm(m, r));
  } else {
    wrap.appendChild(el("div", { class: "helper-banner", text: "Only the patient role can rate recipes. Switch your role from the profile chip if that's you." }));
  }

  wrap.appendChild(renderRecipeActions(m, r, rs.length));

  return wrap;
}

// Below the ratings, set apart by a rule: editing for every member, and
// deleting for those allowed to.
function renderRecipeActions(m, r, ratingCount) {
  var box = el("div", { class: "detail-actions" }, [
    el("button", { class: "btn btn-block", attrs: { type: "button" }, text: "Edit recipe", on: { click: function(){ openEditRecipe(r.id); } } })
  ]);
  if (canDelete(r)) box.appendChild(renderDeleteControl(m, r, ratingCount));
  return box;
}

// Whoever added a recipe, or an admin — the same rule db/schema.sql enforces.
export function canDelete(r) {
  var me = state.myProfile;
  return !!me && (r.addedBy === state.uid || !!me.isAdmin);
}

// Deleting is for everyone and takes the ratings with it, so it takes two
// taps, and the second one says what will be lost.
function renderDeleteControl(m, r, ratingCount) {
  var box = el("div", { class: "detail-delete" });
  var confirmText = "Tap again to delete for everyone" +
    (ratingCount ? " — its " + ratingCount + " rating" + (ratingCount > 1 ? "s" : "") + " will be lost too" : "");
  box.appendChild(el("button", {
    class: "btn btn-ghost btn-block detail-delete-btn",
    attrs: m.deleting ? { type: "button", disabled: "" } : { type: "button" },
    text: m.deleting ? "Deleting…" : (m.confirmDelete ? confirmText : "Delete recipe"),
    on: { click: function(){ if (!m.deleting) deleteRecipe(m, r); } }
  }));
  if (m.deleteError) box.appendChild(el("div", { class: "form-error", style: "margin:8px 0 0;", text: m.deleteError }));
  return box;
}

function deleteRecipe(m, r) {
  if (!m.confirmDelete) { m.confirmDelete = true; m.deleteError = ""; renderModalInPlace(); return; }
  m.confirmDelete = false;
  m.deleting = true;
  renderModalInPlace();
  Backend.deleteRecipe(r.id).then(function(){
    closeModal();
  }).catch(function(){
    m.deleting = false;
    m.deleteError = "Couldn't delete — check your connection and try again.";
    renderModalInPlace();
  });
}

// "Add to shopping list", or — once it's on — for how many people, and a
// way to take it off again. The list is the family's, shared live.
function renderShoppingControl(m, r, servings) {
  var item = shoppingItemFor(r.id);
  function fail() { m.shopError = "Couldn't update the shopping list — check your connection."; renderModalInPlace(); }
  var box = el("div", { class: "detail-shop" });
  if (!item) {
    box.appendChild(el("button", { class: "btn btn-sm", attrs: { type: "button" }, text: "+ Add to shopping list", on: { click: function(){
      m.shopError = "";
      setPeople(r.id, servings).catch(fail);
    } } }));
  } else {
    box.appendChild(el("span", { class: "detail-shop-label", text: "On the shopping list for" }));
    box.appendChild(peopleStepper(item.people || servings, function(n){ setPeople(r.id, n).catch(fail); }));
    box.appendChild(el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Remove", on: { click: function(){
      Backend.removeFromShopping(r.id).catch(fail);
    } } }));
  }
  if (m.shopError) box.appendChild(el("div", { class: "form-error", style: "margin:6px 0 0; flex-basis:100%;", text: m.shopError }));
  return box;
}

// "Cooked", for everyone: it counts as eaten by the patient. A tap logs it
// for now, then says so with "Change time" and "Undo"; holding the button
// goes straight to picking a time (yesterday's leftovers, a late entry).
//
//   m.cookNote    { id, at }       the event just logged, while its note shows
//   m.cookPicker  { id, value }    picking a time; id = the event to move, or
//                                  null to log a new one
var COOK_NOTE_MS = 8000;

function renderCookControl(m, r) {
  var box = el("div", { class: "detail-cook" });
  var btn = el("button", { class: "btn btn-sm cook-btn", attrs: { type: "button" }, text: "✓ Cooked" });
  if (m.cookBusy) btn.setAttribute("disabled", "");
  attachLongPress(btn, function(){ logCooked(m, r, Date.now()); }, function(){ openCookPicker(m, null, Date.now()); });
  box.appendChild(btn);

  var note = m.cookNote;
  if (note && !m.cookPicker) {
    box.appendChild(el("span", { class: "detail-cook-note" }, [
      document.createTextNode("Cooked · " + sinceLabel(note.at) + " — "),
      el("button", { class: "link-btn", attrs: { type: "button" }, text: "Change time", on: { click: function(){ openCookPicker(m, note.id, note.at); } } }),
      document.createTextNode(" · "),
      el("button", { class: "link-btn", attrs: { type: "button" }, text: "Undo", on: { click: function(){ undoCooked(m, note); } } })
    ]));
  } else if (!m.cookPicker) {
    var last = lastCooked(r.id);
    box.appendChild(el("span", { class: "detail-cook-last", text: last
      ? "Last cooked " + sinceLabel(last.cookedAt)
      : "Tap when it's cooked · hold to pick a time" }));
  }
  if (m.cookPicker) box.appendChild(renderCookPicker(m, r));
  if (m.cookError) box.appendChild(el("div", { class: "form-error", style: "margin:6px 0 0; flex-basis:100%;", text: m.cookError }));
  return box;
}

function renderCookPicker(m, r) {
  var picker = m.cookPicker;
  var box = el("div", { class: "cook-picker" }, [ el("div", { class: "cook-picker-q", text: "When was it cooked?" }) ]);
  var chips = el("div", { class: "cook-picker-chips" });
  quickCookTimes(Date.now()).forEach(function(q){
    chips.appendChild(el("button", { class: "btn btn-sm", attrs: { type: "button" }, text: q.label, on: { click: function(){ saveCookTime(m, r, q.at); } } }));
  });
  box.appendChild(chips);

  var input = el("input", { attrs: { type: "datetime-local", max: toLocalInput(Date.now()), "aria-label": "Date and time cooked" } });
  input.value = picker.value;
  input.addEventListener("input", function(e){ picker.value = e.target.value; });
  box.appendChild(el("div", { class: "cook-picker-row" }, [
    input,
    el("button", { class: "btn btn-primary btn-sm", attrs: { type: "button" }, text: "Save", on: { click: function(){
      var at = fromLocalInput(picker.value);
      if (at === null) { m.cookError = "Pick a date and time."; renderModalInPlace(); return; }
      saveCookTime(m, r, at);
    } } }),
    el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Cancel", on: { click: function(){
      m.cookPicker = null; m.cookError = ""; renderModalInPlace();
    } } })
  ]));
  return box;
}

function openCookPicker(m, id, at) {
  m.cookPicker = { id: id, value: toLocalInput(at) };
  m.cookError = "";
  renderModalInPlace();
}

function cookFailed(m) {
  m.cookBusy = false;
  m.cookError = "Couldn't save — check your connection and try again.";
  if (state.modal === m) renderModalInPlace();
}

// The note goes away by itself after a while, unless it was replaced.
function showCookNote(m, note) {
  m.cookBusy = false;
  m.cookPicker = null;
  m.cookNote = note;
  if (state.modal === m) renderModalInPlace();
  setTimeout(function(){
    if (m.cookNote !== note || m.cookPicker) return;
    m.cookNote = null;
    if (state.modal === m) renderModalInPlace();
  }, COOK_NOTE_MS);
}

function logCooked(m, r, at) {
  if (m.cookBusy) return;
  m.cookBusy = true;
  m.cookError = "";
  renderModalInPlace();
  Backend.addCookEvent(r.id, state.uid, at).then(function(id){
    showCookNote(m, { id: id, at: at });
  }).catch(function(){ cookFailed(m); });
}

function saveCookTime(m, r, at) {
  if (at > Date.now() + 60000) { m.cookError = "That's still in the future."; renderModalInPlace(); return; }
  var id = m.cookPicker && m.cookPicker.id;
  if (!id) { m.cookPicker = null; logCooked(m, r, at); return; }
  m.cookBusy = true;
  m.cookError = "";
  renderModalInPlace();
  Backend.moveCookEvent(id, at).then(function(){
    showCookNote(m, { id: id, at: at });
  }).catch(function(){ cookFailed(m); });
}

function undoCooked(m, note) {
  m.cookNote = null;
  renderModalInPlace();
  Backend.deleteCookEvent(note.id).catch(function(){
    m.cookNote = note;
    cookFailed(m);
  });
}

// Tap or hold. Holding shows a bar filling along the button (CSS
// .pressing) and fires after HOLD_MS; moving the finger past SLOP is a
// scroll and cancels. iOS's own long-press reactions (text selection, the
// callout) are switched off in CSS and through contextmenu. A keyboard
// "click" is always a tap.
//
// The click that follows a hold must not count as a tap. It may land on a
// fresh button — the hold re-renders the panel, and iOS sends the click to
// whatever is under the finger on release — so the "just held" mark lives
// here, outside any one button, and the next press clears it.
var HOLD_MS = 500;
var SLOP = 10;
var heldAt = 0;

function attachLongPress(node, onTap, onHold) {
  var timer = null, x = 0, y = 0;
  function cancel() {
    clearTimeout(timer);
    timer = null;
    node.classList.remove("pressing");
  }
  node.addEventListener("pointerdown", function(e){
    if (e.button !== 0 || node.disabled) return;
    heldAt = 0;
    x = e.clientX; y = e.clientY;
    node.classList.add("pressing");
    timer = setTimeout(function(){
      timer = null;
      heldAt = Date.now();
      node.classList.remove("pressing");
      if (navigator.vibrate) navigator.vibrate(10);
      onHold();
    }, HOLD_MS);
  });
  node.addEventListener("pointermove", function(e){
    if (timer && (Math.abs(e.clientX - x) > SLOP || Math.abs(e.clientY - y) > SLOP)) cancel();
  });
  node.addEventListener("pointerup", function(){ if (timer) cancel(); });
  node.addEventListener("pointercancel", cancel);
  node.addEventListener("pointerleave", cancel);
  node.addEventListener("contextmenu", function(e){ e.preventDefault(); });
  node.addEventListener("click", function(){
    if (heldAt && Date.now() - heldAt < 5000) { heldAt = 0; return; }
    onTap();
  });
}

// Any approved member can add a photo to a recipe, or replace it. The rest
// of the recipe is changed through "Edit" (see db/schema.sql).
function renderDetailPhoto(m, r) {
  var box = el("div", { class: "detail-photo" });
  var url = r.photoPath && state.photoUrls[r.photoPath];
  if (url) box.appendChild(el("img", { attrs: { src: url, alt: "" } }));
  else if (r.photoPath) box.appendChild(el("div", { class: "photo-loading", text: "Loading photo…" }));

  if (m.photoBusy) {
    box.appendChild(el("div", { class: "photo-status", text: "Uploading…" }));
  } else {
    box.appendChild(photoPicker(r.photoPath ? "Change photo" : "Add a photo", function(blob){
      m.photoBusy = true;
      m.photoError = "";
      renderModalInPlace();
      Backend.uploadPhoto(state.uid, blob).then(function(path){
        return Backend.setRecipePhoto(r.id, path);
      }).then(function(){
        m.photoBusy = false;
        renderModalInPlace();
      }).catch(function(){
        m.photoBusy = false;
        m.photoError = "Couldn't upload the photo — check your connection and try again.";
        renderModalInPlace();
      });
    }, function(msg){ m.photoError = msg; renderModalInPlace(); }));
  }
  if (m.photoError) box.appendChild(el("div", { class: "form-error", style: "margin:8px 0 0;", text: m.photoError }));
  return box;
}

export function renderRatingForm(m, r) {
  var existing = state.ratings.find(function(rt){ return rt.recipeId === r.id && rt.uid === state.uid; });
  if (m.ratingStars === 0 && existing) { m.ratingStars = existing.stars; m.ratingTol = existing.tolerance; m.ratingComment = existing.comment || ""; }

  var section = el("div", { class: "detail-section" }, [ el("h4", { text: existing ? "Update your rating" : "Rate this recipe" }) ]);

  var picker = el("div", { class: "star-picker", attrs: { role: "radiogroup", "aria-label": "Star rating" } });
  for (var i = 1; i <= 5; i++) {
    (function(val){
      var b = el("button", { attrs: { type: "button", "aria-label": val + " stars" }, text: "★" });
      b.dataset.on = String(val <= m.ratingStars);
      b.addEventListener("click", function(){ m.ratingStars = val; renderModalInPlace(); });
      picker.appendChild(b);
    })(i);
  }
  section.appendChild(picker);

  var tolRow = el("div", { class: "tol-picker", style: "margin-top:10px;" });
  TOLERANCE.forEach(function(t){
    var b = el("button", { class: "tol-btn", attrs: { type: "button" }, text: t.label });
    b.dataset.on = String(m.ratingTol === t.id);
    b.addEventListener("click", function(){ m.ratingTol = t.id; renderModalInPlace(); });
    tolRow.appendChild(b);
  });
  section.appendChild(tolRow);

  var commentArea = el("textarea", { attrs: { placeholder: "Anything worth noting? (optional)" }, style: "margin-top:10px;" });
  commentArea.value = m.ratingComment;
  commentArea.addEventListener("input", function(e){ m.ratingComment = e.target.value; });
  section.appendChild(commentArea);

  if (m.ratingError) section.appendChild(el("div", { class: "form-error", text: m.ratingError }));

  section.appendChild(el("button", {
    class: "btn btn-primary btn-block", style: "margin-top:12px;",
    attrs: { type: "button" }, text: existing ? "Update rating" : "Save rating",
    on: { click: function(){ submitRating(m, r); } }
  }));
  return section;
}

export function submitRating(m, r) {
  if (!m.ratingStars) { m.ratingError = "Pick a star rating."; renderModalInPlace(); return; }
  if (!m.ratingTol) { m.ratingError = "Pick how well it was tolerated."; renderModalInPlace(); return; }
  m.ratingError = "";
  var data = {
    recipeId: r.id,
    uid: state.uid,
    name: state.myProfile.name,
    stars: m.ratingStars,
    tolerance: m.ratingTol,
    comment: m.ratingComment.trim(),
    createdAt: Date.now()
  };
  Backend.upsertRating(r.id, state.uid, data).then(function(){
    renderModalInPlace();
  }).catch(function(){
    m.ratingError = "Couldn't save — check your connection and try again.";
    renderModalInPlace();
  });
}
