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
// Phases are deliberately not produced: which illness phase a dish suits is
// a medical judgement the family makes, not the model.
//
// Deploy: Supabase Dashboard -> Edge Functions -> Deploy a new function ->
// Via Editor, name it "structure-recipe", paste this file. Then add the
// secret GEMINI_API_KEY under Edge Functions -> Secrets. Optional secret
// GEMINI_MODEL overrides the model below.

import { createClient } from "jsr:@supabase/supabase-js@2";

// Google retires model names over time; when a call fails with "model is no
// longer available", set the GEMINI_MODEL secret to the name its error
// message suggests — no redeploy needed.
const MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";
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
    "- Write every field in the same language as the recipe.",
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

  // "High demand" (503) and hiccups (500) are usually over within seconds,
  // and common on the free tier — retry twice before giving up.
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: request,
      },
    );
    if ((res.status !== 503 && res.status !== 500) || attempt === 2) break;
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }

  if (res.status === 429) return reply(429, { error: "rate limited" });
  if (res.status === 503) return reply(503, { error: "model busy" });
  if (!res.ok) {
    console.error("Gemini error", res.status, await res.text());
    return reply(502, { error: "model request failed" });
  }

  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  let out;
  try { out = JSON.parse(raw); } catch { return reply(502, { error: "model returned no usable answer" }); }

  // Never trust the model's shape blindly.
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : [];
  return reply(200, {
    title: typeof out.title === "string" ? out.title.trim() : "",
    ingredients: strings(out.ingredients),
    instructions: typeof out.instructions === "string" ? out.instructions.trim() : "",
    prepMinutes: Number.isInteger(out.prepMinutes) && out.prepMinutes > 0 ? out.prepMinutes : null,
    tags: strings(out.tags).filter((t) => knownTags.includes(t)),
  });
});
