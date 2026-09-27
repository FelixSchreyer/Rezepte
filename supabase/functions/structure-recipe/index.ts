// Supabase Edge Function: the app's two LLM features, using Google Gemini.
//
// Why a server function: the Gemini API key must never reach the browser.
// It lives in the function's secrets (GEMINI_API_KEY), and only approved
// members may call this, so nobody else can spend the free quota.
//
// 1. Recipe quick fill (default task)
//   POST { text?: string, images?: [{ mimeType, data (base64) }], tags: string[] }
//        text, photos of a printed or handwritten recipe (up to 3 pages), or both
//   200  { title, ingredients: string[], instructions, prepMinutes, servings, tags: string[] }
//
//   The input may be in any language (typed, dictated or photographed); the
//   fields always come back in English, the language the recipe box is kept
//   in. Phases are deliberately not produced: which illness phase a dish
//   suits is a medical judgement the family makes, not the model.
//
// 2. Shopping list tidy-up
//   POST { task: "tidy-list", items: string[] }
//   200  { items: string[] }
//
//   Merges what the app's own rules could not: synonyms ("rice" and "white
//   rice"), units that need converting. The app shows the result for review.
//
// Errors: 4xx/5xx { error: string }   (429 = quota used up, 503 = Gemini busy)
//
// Deploy: Supabase Dashboard -> Edge Functions -> Deploy a new function ->
// Via Editor, name it "structure-recipe", paste this file. Then add the
// secret GEMINI_API_KEY under Edge Functions -> Secrets.
//
// Models: the secret GEMINI_MODELS holds a comma-separated list, tried in
// order — when one is overloaded, out of free quota or retired, the next one
// answers. Editable any time without a redeploy. (GEMINI_MODEL, a single
// name, still works; with neither set, DEFAULT_MODEL is used.)

import { createClient } from "jsr:@supabase/supabase-js@2";

const DEFAULT_MODEL = "gemini-3.8-flash";
const MODELS = (Deno.env.get("GEMINI_MODELS") ?? Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL)
  .split(/[,;\s]+/)
  .map((m) => m.trim().replace(/^models\//, ""))
  .filter(Boolean);
const MAX_INPUT = 8000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BASE64 = 6_000_000; // ~4.5 MB per photo; the app sends ~1 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LIST_ITEMS = 300;
const MAX_LIST_ITEM = 200;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];

// ---------------- task 1: recipe quick fill ----------------

// The shape Gemini must answer in (its OpenAPI-style schema subset).
const RECIPE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    ingredients: { type: "ARRAY", items: { type: "STRING" } },
    instructions: { type: "STRING" },
    prepMinutes: { type: "INTEGER", nullable: true },
    servings: { type: "INTEGER", nullable: true },
    tags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "ingredients", "instructions", "tags"],
};

function recipePrompt(text: string, imageCount: number, tags: string[]) {
  return [
    "You turn a home cook's recipe into structured fields. It comes as free text (typed or dictated), as photos of a printed or handwritten recipe, or both.",
    "Rules:",
    "- The recipe may be in any language. Always write every field in English, translating as needed.",
    "- Translate units and cooking terms to their usual English form (e.g. \"EL\" -> \"tbsp\", \"TL\" -> \"tsp\", \"Prise\" -> \"pinch\"), but keep the amounts and metric units as given; do not convert grams to cups.",
    "- Keep names of dishes or ingredients that have no good English equivalent, with a short English hint in brackets if helpful.",
    "- title: short and descriptive.",
    "- ingredients: one entry per ingredient, amount first, then unit, then the ingredient (e.g. \"200 g white rice\", \"2 eggs\"). Do not invent amounts.",
    "- instructions: clear numbered steps, one per line (\"1. ...\"). Keep the cook's own tips.",
    "- prepMinutes: total time in minutes if stated or clearly implied, otherwise null.",
    "- servings: how many people the amounts are for, if stated (\"serves 4\", \"für 4 Personen\"), otherwise null.",
    "- tags: only from this list, and only when the recipe clearly fits: " + JSON.stringify(tags),
    "- Dictated text may contain filler words and self-corrections; use the corrected version.",
    ...(imageCount ? [
      "- Photos: read them carefully, including handwriting. Several photos are consecutive pages of the same recipe.",
      "- Ignore anything on the page that is not this recipe (other recipes, page numbers, ads, stains).",
      "- If an amount or word is illegible, leave it out rather than guess.",
      "- If free text is given too, it adds to or corrects the photos (e.g. \"half the amount\") — follow it.",
    ] : []),
    "",
    text ? "Recipe text:\n" + text : "The recipe is in the attached photo" + (imageCount > 1 ? "s." : "."),
  ].join("\n");
}

type Task = { request: string; shape: (out: Record<string, unknown>) => unknown } | Response;

function recipeTask(body: Record<string, unknown>): Task {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length > MAX_INPUT) return reply(400, { error: "text is too long" });
  const knownTags = strings(body.tags);

  const rawImages = Array.isArray(body.images) ? body.images : [];
  if (rawImages.length > MAX_IMAGES) return reply(400, { error: "too many photos" });
  const images: { mimeType: string; data: string }[] = [];
  for (const img of rawImages) {
    const mimeType = (img as { mimeType?: unknown })?.mimeType;
    const data = (img as { data?: unknown })?.data;
    if (typeof mimeType !== "string" || !IMAGE_TYPES.includes(mimeType) || typeof data !== "string" || !data) {
      return reply(400, { error: "invalid photo" });
    }
    if (data.length > MAX_IMAGE_BASE64) return reply(413, { error: "photo too large" });
    images.push({ mimeType, data });
  }
  if (!text && !images.length) return reply(400, { error: "nothing to read" });

  const positiveInt = (v: unknown, max: number) =>
    typeof v === "number" && Number.isInteger(v) && v > 0 && v <= max ? v : null;

  return {
    request: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })),
          { text: recipePrompt(text, images.length, knownTags) },
        ],
      }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RECIPE_SCHEMA, temperature: 0.2 },
    }),
    // Never trust the model's shape blindly.
    shape: (out) => ({
      title: typeof out.title === "string" ? out.title.trim() : "",
      ingredients: strings(out.ingredients),
      instructions: typeof out.instructions === "string" ? out.instructions.trim() : "",
      prepMinutes: positiveInt(out.prepMinutes, 24 * 60),
      servings: positiveInt(out.servings, 50),
      tags: strings(out.tags).filter((t) => knownTags.includes(t)),
    }),
  };
}

// ---------------- task 2: shopping list tidy-up ----------------

const LIST_SCHEMA = {
  type: "OBJECT",
  properties: { items: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["items"],
};

function listPrompt(items: string[]) {
  return [
    "You tidy up a family's shopping list, built from several recipes. Each line is one item.",
    "Rules:",
    "- Merge lines that are the same thing to buy, adding up the amounts (e.g. \"200 g rice\" + \"150 g white rice\" -> \"350 g rice\").",
    "- Convert units only where needed to add up, and prefer metric (g, kg, ml, l). Spoon amounts of the same item may be added up as spoons.",
    "- If amounts can't sensibly be added (e.g. \"1 cup\" and \"200 g\"), keep them in one line like \"rice: 200 g + 1 cup\".",
    "- Never drop an item and never invent one. Keep items that appear only once as they are.",
    "- Drop preparation notes (\"finely chopped\"), keep what to buy.",
    "- English, amount first. Sort by where you'd find them in a supermarket (produce, dairy, dry goods, spices, other).",
    "",
    "List:",
    ...items.map((i) => "- " + i),
  ].join("\n");
}

function listTask(body: Record<string, unknown>): Task {
  const items = strings(body.items);
  if (!items.length) return reply(400, { error: "list is empty" });
  if (items.length > MAX_LIST_ITEMS || items.some((i) => i.length > MAX_LIST_ITEM)) {
    return reply(400, { error: "list is too long" });
  }
  return {
    request: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: listPrompt(items) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: LIST_SCHEMA, temperature: 0.1 },
    }),
    shape: (out) => {
      const tidied = strings(out.items);
      // An empty answer for a non-empty list is a failure, not a result.
      return tidied.length ? { items: tidied } : null;
    },
  };
}

// ---------------- the request ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "method not allowed" });

  // Only approved members. is_approved() reads the caller's own members row
  // (db/schema.sql), so the check runs with the caller's own session.
  // The client key is the project's public one; projects on the newer
  // publishable keys may not expose SUPABASE_ANON_KEY, so fall back to the
  // key the app sent along.
  const clientKey = Deno.env.get("SUPABASE_ANON_KEY") ?? req.headers.get("apikey") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    clientKey,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: approved, error: authError } = await supabase.rpc("is_approved");
  if (authError || approved !== true) return reply(403, { error: "not approved" });

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return reply(500, { error: "GEMINI_API_KEY is not set" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: "invalid JSON" }); }
  if (!body || typeof body !== "object") return reply(400, { error: "invalid JSON" });

  const task = body.task === "tidy-list" ? listTask(body) : recipeTask(body);
  if (task instanceof Response) return task;

  // Ask one model. "next" means: this model can't help right now, try the
  // following one — overloaded (503/500), out of its own free quota (429),
  // or retired / unknown (404). Anything else is a real error.
  type Attempt = { ok: true; result: unknown } | { ok: false; status: number; next: boolean };
  async function ask(model: string, t: Exclude<Task, Response>): Promise<Attempt> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey! },
        body: t.request,
      },
    );
    if (!res.ok) {
      console.error("Gemini error", model, res.status, await res.text());
      return { ok: false, status: res.status, next: [404, 429, 500, 503].includes(res.status) };
    }
    const data = await res.json();
    try {
      const out = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
      const result = out && typeof out === "object" ? t.shape(out) : null;
      if (result) return { ok: true, result };
    } catch { /* fall through */ }
    console.error("Gemini gave no usable JSON", model, JSON.stringify(data).slice(0, 500));
    return { ok: false, status: 502, next: true };
  }

  // Go down the list; if every model was merely busy, wait a moment and go
  // down it once more. Overload is usually over within seconds.
  let result: unknown = null;
  let statuses: number[] = [];
  for (let pass = 0; pass < 2 && !result; pass++) {
    if (pass > 0) {
      if (!statuses.every((st) => st === 503 || st === 500)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    statuses = [];
    for (const model of MODELS) {
      const attempt = await ask(model, task);
      if (attempt.ok) { result = attempt.result; break; }
      statuses.push(attempt.status);
      if (!attempt.next) break;
    }
  }

  if (!result) {
    // Tell the app the most useful reason: busy beats quota beats the rest.
    if (statuses.some((st) => st === 503 || st === 500)) return reply(503, { error: "model busy" });
    if (statuses.includes(429)) return reply(429, { error: "rate limited" });
    return reply(502, { error: "model request failed" });
  }
  return reply(200, result);
});
