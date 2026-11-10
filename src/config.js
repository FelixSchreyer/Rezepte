// Static configuration: backend credentials and the domain vocabulary
// (illness phases, dietary tags, tolerance levels) the whole app shares.
//
// The Supabase key below is the *publishable* key. It is safe in client
// source: every table is guarded by row-level security (see db/schema.sql).

export var SUPABASE_URL = "https://akuqozjsbrayrveflksy.supabase.co";
export var SUPABASE_KEY = "sb_publishable_YY-80QlzZlWeXxmdj4mqdw_v8HN2Z38";

export var PHASES = [
  { id: "severe",     label: "Acute — Severe",   short: "Severe",     color: "var(--phase-severe)" },
  { id: "moderate",   label: "Acute — Moderate", short: "Moderate",   color: "var(--phase-moderate)" },
  { id: "rebuilding", label: "Rebuilding",       short: "Rebuilding", color: "var(--phase-rebuilding)" },
  { id: "transition", label: "Transition",       short: "Transition", color: "var(--phase-transition)" },
  { id: "remission",  label: "Remission",        short: "Remission",  color: "var(--phase-remission)" }
];
export var PHASE_MAP = {};
PHASES.forEach(function(p){ PHASE_MAP[p.id] = p; });

export var BASE_TAGS = ["Low-Carb", "Gluten-free", "Lactose-free", "Breakfast", "Lunch", "Dinner"];

export var TOLERANCE = [
  { id: "good", label: "Well tolerated" },
  { id: "medium", label: "Mixed" },
  { id: "poor", label: "Poorly tolerated" }
];
export var TOL_MAP = {};
TOLERANCE.forEach(function(t){ TOL_MAP[t.id] = t; });

// The patient's daily check-in: how they were doing that day. Same ids as
// TOLERANCE, so the two can be read side by side later.
export var CHECKIN_STATES = [
  { id: "good",   emoji: "😊", label: "Good" },
  { id: "medium", emoji: "😐", label: "So-so" },
  { id: "poor",   emoji: "😣", label: "Bad" }
];
export var DEFAULT_CHECKIN_TIME = "20:00";

// Public half of the VAPID key pair the daily-checkin Edge Function signs
// push messages with (the private half is its secret). Empty = push is not
// set up yet; the reminder then only shows inside the app. See README.
export var VAPID_PUBLIC_KEY = "BD5A6hDvfgQ7QnuJ1UpBcumqutQJ6UHLfa6ya2yqFvA-KYW7N5EI8uO9ASoAb52dlBI6ErZZOw7wQH4SP9Ggop4";

// The Apple Shortcut that "Add to Reminders" runs (see ui/shopping.js).
// Everyone who exports creates a shortcut with exactly this name once.
export var SHOPPING_SHORTCUT = "Gut & Grain Shopping";
