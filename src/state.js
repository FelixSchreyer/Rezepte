// The single source of truth for everything the UI draws, plus the DOM
// node it is drawn into. Modules mutate `state` directly and then call
// render() (see ui/app.js) to rebuild the view from it.

export var root = document.getElementById("root");

export var state = {
  ready: false,
  capsMissing: false,
  slowLoad: false,
  uid: null,
  myProfile: null,       // {name, role}
  members: {},           // uid -> {name, role}
  recipes: [],           // [{id, ...data}]
  ratings: [],           // [{id, recipeId, uid, name, stars, tolerance, comment}]
  activePhase: null,
  activeTags: {},        // tag -> true
  search: "",
  modal: null            // {type: 'onboarding'|'add'|'detail', ...}
};
