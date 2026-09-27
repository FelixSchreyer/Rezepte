// The single source of truth for everything the UI draws, plus the DOM
// node it is drawn into. Modules mutate `state` directly and then call
// render() (see ui/app.js) to rebuild the view from it.

export var root = document.getElementById("root");

export var state = {
  ready: false,
  capsMissing: false,
  slowLoad: false,
  uid: null,
  myProfile: null,       // {id, email, name, role, status, isAdmin, joinedAt}
  auth: { mode: "signin", email: "", password: "", error: "", busy: false },
  members: {},           // uid -> {name, role}
  recipes: [],           // [{id, ...data}]
  photoUrls: {},         // photoPath -> displayable URL (see boot.js)
  photoUrlsAt: 0,        // when photoUrls was last filled from scratch
  ratings: [],           // [{id, recipeId, uid, name, stars, tolerance, comment}]
  shopping: [],          // [{recipeId, people, addedBy, addedAt}] — the family's list
  shoppingTidy: null,    // {source, items}: the AI-tidied list, while it still matches
  activePhase: null,
  activeTags: {},        // tag -> true
  tagMenuOpen: false,    // tag filter dropdown
  search: "",
  modal: null            // {type: 'onboarding'|'add'|'detail'|'account'|'shopping', ...}
};
