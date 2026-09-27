// Sample data for the mock backend. Chosen to exercise the UI rather than to
// be good medical advice: every phase has at least one recipe, tags overlap so
// multi-tag filtering has something to narrow, one recipe carries a custom tag
// not in BASE_TAGS, and ratings cover all three tolerance levels plus a recipe
// with no ratings at all (so the "No ratings yet" path shows up).

var DAY = 24 * 60 * 60 * 1000;
var T0 = Date.UTC(2026, 0, 12);

// Alex is an approved patient *and* the admin; Jordan is waiting for approval,
// so the admin panel has something to act on.
export var SEED_MEMBERS = [
  { id: "mock-user-alex",   email: "alex@example.com",   name: "Alex Moreau",   role: "patient", status: "approved", isAdmin: true,  joinedAt: T0,            lastPhase: null },
  { id: "mock-user-sam",    email: "sam@example.com",    name: "Sam Moreau",    role: "member",  status: "approved", isAdmin: false, joinedAt: T0 + 1 * DAY,  lastPhase: null },
  { id: "mock-user-robin",  email: "robin@example.com",  name: "Robin Okafor",  role: "member",  status: "approved", isAdmin: false, joinedAt: T0 + 3 * DAY,  lastPhase: null },
  { id: "mock-user-jordan", email: "jordan@example.com", name: "Jordan Lindqvist", role: "member", status: "pending", isAdmin: false, joinedAt: T0 + 20 * DAY, lastPhase: null }
];

// Every seeded member can sign in with their email and this password.
export var SEED_PASSWORD = "password";

export var SEED_RECIPES = [
  {
    id: "r-congee",
    title: "Soft rice congee with poached chicken",
    phases: ["severe", "moderate"],
    tags: ["Gluten-free", "Lactose-free", "Low-fiber"],
    ingredients: ["200g white rice", "1 chicken breast", "1.5L water", "1 tsp salt", "1 spring onion, green part only"],
    instructions: "Rinse the rice until the water runs clear.\n\nSimmer rice and water at the lowest heat for 60–90 minutes, stirring now and then, until it collapses into porridge.\n\nPoach the chicken separately for 15 minutes, shred, and stir through. Salt to taste.",
    prepMinutes: 90,
    addedBy: "mock-user-sam",
    addedByName: "Sam Moreau",
    createdAt: T0 + 2 * DAY
  },
  {
    id: "r-broth",
    title: "Clear chicken and ginger broth",
    phases: ["severe"],
    tags: ["Gluten-free", "Lactose-free", "Low-FODMAP", "Low-fiber"],
    ingredients: ["1 chicken carcass", "2L water", "3 slices fresh ginger", "1 tsp salt"],
    instructions: "Cover the carcass with cold water, bring barely to a simmer, and skim.\n\nAdd ginger. Hold at a bare simmer for 3 hours. Strain through a fine sieve and salt lightly.",
    prepMinutes: 180,
    addedBy: "mock-user-sam",
    addedByName: "Sam Moreau",
    createdAt: T0 + 4 * DAY
  },
  {
    id: "r-eggs",
    title: "Slow-scrambled eggs with olive oil",
    phases: ["moderate", "rebuilding"],
    tags: ["Keto", "Low-Carb", "Gluten-free", "Lactose-free"],
    ingredients: ["3 eggs", "1 tbsp olive oil", "pinch of salt"],
    instructions: "Beat the eggs with the salt.\n\nCook in the oil over the lowest possible heat, stirring constantly, for 8–10 minutes until just set. No browning.",
    prepMinutes: 12,
    addedBy: "mock-user-alex",
    addedByName: "Alex Moreau",
    createdAt: T0 + 6 * DAY
  },
  {
    id: "r-squash",
    title: "Puréed butternut squash soup",
    phases: ["moderate", "rebuilding"],
    tags: ["Gluten-free", "Lactose-free", "Low-fiber", "Batch-cooks well"],
    ingredients: ["1 butternut squash, peeled and cubed", "500ml chicken broth", "1 tbsp olive oil", "salt"],
    instructions: "Roast the squash at 200°C for 35 minutes until soft.\n\nBlend with warm broth until completely smooth — pass through a sieve if any fibre remains. Season.",
    prepMinutes: 45,
    addedBy: "mock-user-robin",
    addedByName: "Robin Okafor",
    createdAt: T0 + 9 * DAY
  },
  {
    id: "r-salmon",
    title: "Baked salmon with mashed potato",
    phases: ["rebuilding", "transition"],
    tags: ["Gluten-free", "Low-fiber"],
    ingredients: ["2 salmon fillets", "4 potatoes, peeled", "2 tbsp olive oil", "salt", "lemon"],
    instructions: "Bake the salmon at 180°C for 15 minutes.\n\nBoil the potatoes until very soft, then mash with olive oil rather than butter. Serve with a squeeze of lemon.",
    prepMinutes: 35,
    addedBy: "mock-user-sam",
    addedByName: "Sam Moreau",
    createdAt: T0 + 12 * DAY
  },
  {
    id: "r-oats",
    title: "Overnight oats with peeled pear",
    phases: ["transition"],
    tags: ["Lactose-free", "Low-FODMAP"],
    ingredients: ["60g rolled oats", "200ml oat milk", "1 ripe pear, peeled and grated", "1 tsp maple syrup"],
    instructions: "Combine everything in a jar and refrigerate overnight.\n\nEat cold, or warm gently if that sits better.",
    prepMinutes: 5,
    addedBy: "mock-user-alex",
    addedByName: "Alex Moreau",
    createdAt: T0 + 15 * DAY
  },
  {
    id: "r-stirfry",
    title: "Chicken and courgette stir-fry",
    phases: ["remission"],
    tags: ["Low-Carb", "Gluten-free", "Lactose-free"],
    ingredients: ["2 chicken thighs, sliced", "1 courgette, peeled and sliced", "1 tbsp sesame oil", "1 tbsp tamari", "1 tsp grated ginger"],
    instructions: "Sear the chicken in the oil over high heat until cooked through.\n\nAdd courgette and ginger, stir-fry 3 minutes, then finish with the tamari.",
    prepMinutes: 20,
    addedBy: "mock-user-robin",
    addedByName: "Robin Okafor",
    createdAt: T0 + 18 * DAY
  },
  {
    id: "r-lentil",
    title: "Red lentil dal (remission only)",
    phases: ["remission"],
    tags: ["Gluten-free", "Lactose-free"],
    ingredients: ["200g red lentils", "600ml water", "1 tsp turmeric", "1 tsp cumin", "1 tbsp olive oil", "salt"],
    instructions: "Simmer the lentils in water with the turmeric for 25 minutes until completely broken down.\n\nBloom the cumin in the oil and stir through. Salt at the end.",
    prepMinutes: 30,
    addedBy: "mock-user-sam",
    addedByName: "Sam Moreau",
    createdAt: T0 + 21 * DAY
  }
];

// Alex is the only patient, so every rating is theirs — same as the real app,
// where the rating form is shown to the patient role only.
export var SEED_RATINGS = [
  {
    id: "rt-1", recipeId: "r-congee", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 5, tolerance: "good", comment: "The one thing that always works on a bad day.",
    createdAt: T0 + 5 * DAY
  },
  {
    id: "rt-2", recipeId: "r-broth", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 4, tolerance: "good", comment: "Easy, though not exactly a meal.",
    createdAt: T0 + 7 * DAY
  },
  {
    id: "rt-3", recipeId: "r-eggs", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 4, tolerance: "medium", comment: "Fine in small portions. Half this much next time.",
    createdAt: T0 + 8 * DAY
  },
  {
    id: "rt-4", recipeId: "r-squash", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 5, tolerance: "good", comment: "",
    createdAt: T0 + 11 * DAY
  },
  {
    id: "rt-5", recipeId: "r-salmon", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 3, tolerance: "medium", comment: "Salmon was good, mash sat heavily.",
    createdAt: T0 + 14 * DAY
  },
  {
    id: "rt-6", recipeId: "r-oats", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 2, tolerance: "poor", comment: "Too much fibre even with the pear peeled. Not again during a flare.",
    createdAt: T0 + 17 * DAY
  },
  {
    id: "rt-7", recipeId: "r-lentil", uid: "mock-user-alex", name: "Alex Moreau",
    stars: 4, tolerance: "poor", comment: "Tasted great, regretted it later. Remission only, and half a bowl.",
    createdAt: T0 + 23 * DAY
  }
  // r-stirfry deliberately has no ratings, to exercise the empty path.
];

export function freshSeed() {
  var members = {};
  SEED_MEMBERS.forEach(function (m) { members[m.id] = JSON.parse(JSON.stringify(m)); });
  var accounts = {};
  SEED_MEMBERS.forEach(function (m) { accounts[m.email] = { uid: m.id, password: SEED_PASSWORD }; });
  return {
    session: null,
    accounts: accounts,
    members: members,
    recipes: JSON.parse(JSON.stringify(SEED_RECIPES)),
    ratings: JSON.parse(JSON.stringify(SEED_RATINGS))
  };
}
