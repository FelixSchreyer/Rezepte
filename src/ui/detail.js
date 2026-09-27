// Recipe detail panel and the rating form inside it (patients only).

import { PHASE_MAP, TOLERANCE, TOL_MAP } from "../config.js";
import { state } from "../state.js";
import { el } from "../lib/dom.js";
import { ratingsFor, ratingSummary, starString } from "../lib/recipes.js";
import { Backend } from "../backend/index.js";
import { closeModal, renderModalInPlace } from "./modal.js";

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

  var dots = el("div", { class: "detail-phase-dots" });
  (r.phases||[]).forEach(function(pid){
    var p = PHASE_MAP[pid];
    if (!p) return;
    dots.appendChild(el("span", { style: "background:" + p.color, text: p.label }));
  });
  wrap.appendChild(dots);

  if ((r.tags||[]).length) wrap.appendChild(el("div", { class: "tags", text: (r.tags||[]).join(" · ") }));
  wrap.appendChild(el("div", { class: "meta-line", style: "margin-top:8px;", text: "Added by " + (r.addedByName || "someone") + (r.prepMinutes ? " · " + r.prepMinutes + " min" : "") }));

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
