// The root render pass: clears #root and rebuilds the whole view from
// `state`. Every interaction ends by calling render() (or, for keystroke-
// rate updates, renderGridInPlace()).

import { root, state } from "../state.js";
import { el } from "../lib/dom.js";
import { renderCapsMissing, renderLoading, renderSignInFailed } from "./screens.js";
import { renderHeader } from "./header.js";
import { renderPhaseDropdown, renderFiltersRow, renderSearch } from "./filters.js";
import { renderGrid } from "./grid.js";
import { renderModal, openOnboarding } from "./modal.js";

export function render() {
  root.innerHTML = "";
  if (state.capsMissing) { root.appendChild(renderCapsMissing()); return; }
  if (!state.ready) { root.appendChild(renderLoading()); return; }
  if (!state.uid) { root.appendChild(renderSignInFailed()); return; }

  var app = el("div", { class: "app" });
  app.appendChild(renderHeader());
  app.appendChild(renderPhaseDropdown());
  app.appendChild(renderFiltersRow());
  app.appendChild(renderSearch());
  app.appendChild(renderGrid());
  root.appendChild(app);

  if (state.modal) {
    root.appendChild(renderModal());
  }

  if (!state.myProfile) {
    openOnboarding(null);
  }
}

export function renderGridInPlace() {
  var oldGrid = root.querySelector(".grid");
  var newGrid = renderGrid();
  if (oldGrid) oldGrid.replaceWith(newGrid);
}
