// The root render pass: clears #root and rebuilds the whole view from
// `state`. Every interaction ends by calling render() (or, for keystroke-
// rate updates, renderGridInPlace()).

import { root, state } from "../state.js";
import { el } from "../lib/dom.js";
import { isApproved } from "../lib/members.js";
import { renderCapsMissing, renderLoading, renderPending, renderRejected } from "./screens.js";
import { renderAuth } from "./auth.js";
import { renderHeader } from "./header.js";
import { renderPhaseDropdown, renderTagFilter, renderSearch } from "./filters.js";
import { renderGrid } from "./grid.js";
import { renderModal } from "./modal.js";

export function render() {
  root.innerHTML = "";
  if (state.capsMissing) { root.appendChild(renderCapsMissing()); return; }
  if (!state.ready) { root.appendChild(renderLoading()); return; }
  if (!state.uid) { root.appendChild(renderAuth()); return; }

  // Signed in but no members row yet: name + role first. The modal is set
  // here directly — going through an open*() helper would call render()
  // straight back and recurse.
  if (!state.myProfile) {
    if (!(state.modal && state.modal.type === "onboarding")) {
      state.modal = { type: "onboarding", name: "", role: "", error: "" };
    }
    root.appendChild(renderModal());
    return;
  }
  if (state.myProfile.status === "rejected") { root.appendChild(renderRejected()); return; }
  if (!isApproved()) { root.appendChild(renderPending()); return; }

  var app = el("div", { class: "app" });
  app.appendChild(renderHeader());
  app.appendChild(renderPhaseDropdown());
  app.appendChild(renderTagFilter());
  app.appendChild(renderSearch());
  app.appendChild(renderGrid());
  root.appendChild(app);

  if (state.modal) {
    root.appendChild(renderModal());
  }
}

export function renderGridInPlace() {
  var oldGrid = root.querySelector(".grid");
  var newGrid = renderGrid();
  if (oldGrid) oldGrid.replaceWith(newGrid);
}
