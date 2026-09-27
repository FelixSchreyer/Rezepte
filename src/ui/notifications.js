// "Recipes to rate" page of the account panel (patients only): recipes
// added since the patient joined that they have not rated yet. Picking one
// opens its detail panel, where the rating form lives; once rated it drops
// off this list via the ratings feed.

import { PHASE_MAP } from "../config.js";
import { el } from "../lib/dom.js";
import { pendingRatings } from "../lib/recipes.js";
import { openDetail } from "./modal.js";

export function renderNotifications() {
  var wrap = el("div");
  var list = pendingRatings();
  if (!list.length) {
    wrap.appendChild(el("div", { class: "notif-empty", text: "You're all caught up — every new recipe has your rating." }));
    return wrap;
  }

  var ul = el("ul", { class: "notif-list" });
  list.forEach(function(r){
    var phase = PHASE_MAP[(r.phases||[])[0]];
    ul.appendChild(el("li", {}, [
      el("button", {
        class: "notif-item", attrs: { type: "button" },
        style: phase ? "border-left-color:" + phase.color : "",
        on: { click: function(){ openDetail(r.id); } }
      }, [
        el("span", { class: "title", text: r.title || "Untitled recipe" }),
        el("span", { class: "meta", text: "Added by " + (r.addedByName || "someone") + (r.createdAt ? " · " + new Date(r.createdAt).toLocaleDateString() : "") })
      ])
    ]));
  });
  wrap.appendChild(ul);
  return wrap;
}
