// Recipe detail panel and the rating form inside it (patients only).

import { PHASE_MAP, TOLERANCE, TOL_MAP } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { ratingsFor, ratingSummary, starString, recipePhases } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { closeModal, openEditRecipe, renderModalInPlace } from "./modal.js";
import { photoPicker } from "./photo-picker.js";
import { peopleStepper, setPeople, shoppingItemFor } from "./shopping.js";
import { DEFAULT_SERVINGS } from "../lib/shopping.js";

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
    el("div", { class: "panel-head-actions" }, [
      el("button", { class: "btn btn-ghost btn-sm", attrs: { type: "button" }, text: "Edit", on: { click: function(){ openEditRecipe(r.id); } } }),
      el("button", { class: "close-x", attrs: { "aria-label": "Close" }, text: "✕", on: { click: closeModal } })
    ])
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

  return wrap;
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
