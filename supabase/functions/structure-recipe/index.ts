// Supabase Edge Function: turns a recipe written (or dictated) in free text
// into the fields of the "Add a recipe" form, using Google Gemini.
//
// Why a server function: the Gemini API key must never reach the browser.
// It lives in the function's secrets (GEMINI_API_KEY), and only approved
// members may call this, so nobody else can spend the free quota.
//
//   POST { text: string, tags: string[] }
//   200  { title, ingredients: string[], instructions, prepMinutes, tags: string[] }
//   4xx/5xx { error: string }   (429 = quota used up, 503 = Gemini busy)
//
// The input may be in any language (typed or dictated); the fields always
// come back in English, the language the recipe box is kept in.
//
// Phases are deliberately not produced: which illness phase a dish suits is
// a medical judgement the family makes, not the model.
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

// The shape Gemini must answer in (its OpenAPI-style schema subset).
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    ingredients: { type: "ARRAY", items: { type: "STRING" } },
    instructions: { type: "STRING" },
    prepMinutes: { type: "INTEGER", nullable: true },
    tags: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["title", "ingredients", "instructions", "tags"],
};

function prompt(text: string, tags: string[]) {
  return [
    "You turn a home cook's recipe, written or dictated in free text, into structured fields.",
    "Rules:",
    "- The recipe may be in any language. Always write every field in English, translating as needed.",
    "- Translate units and cooking terms to their usual English form (e.g. \"EL\" -> \"tbsp\", \"TL\" -> \"tsp\", \"Prise\" -> \"pinch\"), but keep the amounts and metric units as given; do not convert grams to cups.",
    "- Keep names of dishes or ingredients that have no good English equivalent, with a short English hint in brackets if helpful.",
    "- title: short and descriptive.",
    "- ingredients: one entry per ingredient, with amount and unit when given (e.g. \"200 g white rice\"). Do not invent amounts.",
    "- instructions: clear numbered steps, one per line (\"1. ...\"). Keep the cook's own tips.",
    "- prepMinutes: total time in minutes if stated or clearly implied, otherwise null.",
    "- tags: only from this list, and only when the recipe clearly fits: " + JSON.stringify(tags),
    "- Dictated text may contain filler words and self-corrections; use the corrected version.",
    "",
    "Recipe:",
    text,
  ].join("\n");
}

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

  let body: { text?: unknown; tags?: unknown };
  try { body = await req.json(); } catch { return reply(400, { error: "invalid JSON" }); }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return reply(400, { error: "text is empty" });
  if (text.length > MAX_INPUT) return reply(400, { error: "text is too long" });
  const knownTags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [];

  const request = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt(text, knownTags) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  // Ask one model. "next" means: this model can't help right now, try the
  // following one — overloaded (503/500), out of its own free quota (429),
  // or retired / unknown (404). Anything else is a real error.
  type Attempt = { ok: true; out: Record<string, unknown> } | { ok: false; status: number; next: boolean };
  async function ask(model: string): Promise<Attempt> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey! },
        body: request,
      },
    );
    if (!res.ok) {
      console.error("Gemini error", model, res.status, await res.text());
      return { ok: false, status: res.status, next: [404, 429, 500, 503].includes(res.status) };
    }
    const data = await res.json();
    try {
      const out = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
      if (out && typeof out === "object") return { ok: true, out };
    } catch { /* fall through */ }
    console.error("Gemini gave no usable JSON", model, JSON.stringify(data).slice(0, 500));
    return { ok: false, status: 502, next: true };
  }

  // Go down the list; if every model was merely busy, wait a moment and go
  // down it once more. Overload is usually over within seconds.
  let out: Record<string, unknown> | null = null;
  let statuses: number[] = [];
  for (let pass = 0; pass < 2 && !out; pass++) {
    if (pass > 0) {
      if (!statuses.every((st) => st === 503 || st === 500)) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    statuses = [];
    for (const model of MODELS) {
      const attempt = await ask(model);
      if (attempt.ok) { out = attempt.out; break; }
      statuses.push(attempt.status);
      if (!attempt.next) break;
    }
  }

  if (!out) {
    // Tell the app the most useful reason: busy beats quota beats the rest.
    if (statuses.some((st) => st === 503 || st === 500)) return reply(503, { error: "model busy" });
    if (statuses.includes(429)) return reply(429, { error: "rate limited" });
    return reply(502, { error: "model request failed" });
  }

  // Never trust the model's shape blindly.
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
  const minutes = out.prepMinutes;
  return reply(200, {
    title: typeof out.title === "string" ? out.title.trim() : "",
    ingredients: strings(out.ingredients),
    instructions: typeof out.instructions === "string" ? out.instructions.trim() : "",
    prepMinutes: typeof minutes === "number" && Number.isInteger(minutes) && minutes > 0 ? minutes : null,
    tags: strings(out.tags).filter((t) => knownTags.includes(t)),
  });
});
