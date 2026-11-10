// Supabase Edge Function: sends the patient's daily check-in reminder as a
// web push ("How are you today?"). Called every 15 minutes by pg_cron.
//
//   POST {}               send to every subscription that is due
//   POST { force: true }  send to every patient's subscription now (testing)
//   200  { sent, removed, skipped }
//
// Due means: the patient's local time (the device's time zone, stored with
// the subscription) has reached their checkin_time (default 20:00) within
// the last 3 hours, nothing was sent to that device today, and there is no
// check-in for today yet. Subscriptions the push service no longer knows
// (404/410 — the app was removed from the Home Screen) are deleted.
//
// Setup, once:
// 1. VAPID keys: run `npx web-push generate-vapid-keys` on any computer with
//    Node. The public key goes into VAPID_PUBLIC_KEY in src/config.js.
// 2. Supabase -> Edge Functions -> Deploy a new function -> Via Editor, name
//    it "daily-checkin", paste this file. In its settings switch "Verify
//    JWT" off — the cron job authenticates with CRON_SECRET instead.
// 3. Edge Functions -> Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//    VAPID_SUBJECT (mailto:you@example.com) and CRON_SECRET (any long random
//    string). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided.
// 4. Database -> Extensions: enable pg_cron and pg_net, then schedule the
//    call with the snippet at the end of db/migrate-007-cooking-checkins.sql.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const DEFAULT_TIME = "20:00";
const LATE_LIMIT_MINUTES = 180;

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// The local date ("2026-11-10") and minutes since midnight in a time zone.
function localNow(tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date());
  } catch {
    return localNow("Europe/Berlin");   // an unknown zone name
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(time: string | null) {
  const m = /^(\d{2}):(\d{2})$/.exec(time ?? "") ?? /^(\d{2}):(\d{2})$/.exec(DEFAULT_TIME)!;
  return Number(m[1]) * 60 + Number(m[2]);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "POST only" });
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return reply(401, { error: "unauthorized" });
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return reply(500, { error: "VAPID keys missing" });
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const subs = await db.from("push_subscriptions").select("endpoint, uid, p256dh, auth, tz, last_sent_day");
  if (subs.error) return reply(500, { error: subs.error.message });
  if (!subs.data.length) return reply(200, { sent: 0, removed: 0, skipped: 0 });

  const uids = [...new Set(subs.data.map((s) => s.uid))];
  const members = await db.from("members").select("id, role, status, checkin_time").in("id", uids);
  if (members.error) return reply(500, { error: members.error.message });
  const byId = new Map(members.data.map((m) => [m.id, m]));

  // Who is due, before asking which of them already checked in.
  const due = subs.data.flatMap((s) => {
    const m = byId.get(s.uid);
    if (!m || m.status !== "approved" || m.role !== "patient") return [];
    const now = localNow(s.tz);
    if (force) return [{ sub: s, day: now.day }];
    const late = now.minutes - toMinutes(m.checkin_time);
    if (late < 0 || late > LATE_LIMIT_MINUTES || s.last_sent_day === now.day) return [];
    return [{ sub: s, day: now.day }];
  });

  const days = [...new Set(due.map((d) => d.day))];
  const done = new Set<string>();
  if (days.length && !force) {
    const checkins = await db.from("checkins").select("uid, day").in("uid", uids).in("day", days);
    if (checkins.error) return reply(500, { error: checkins.error.message });
    checkins.data.forEach((c) => done.add(c.uid + "|" + c.day));
  }

  let sent = 0, removed = 0, skipped = 0;
  for (const { sub, day } of due) {
    if (done.has(sub.uid + "|" + day)) { skipped++; continue; }
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: "How are you today?", body: "One tap — it helps to see what agrees with you.", day }),
        { TTL: 4 * 60 * 60, urgency: "normal" },
      );
      sent++;
      await db.from("push_subscriptions").update({ last_sent_day: day }).eq("endpoint", sub.endpoint);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        removed++;
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      } else {
        skipped++;
        console.error("push failed", status, (e as Error).message);
      }
    }
  }
  return reply(200, { sent, removed, skipped });
});
