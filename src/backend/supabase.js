import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { mapMember, mapRecipe, mapRating } from "./mappers.js";

/**
 * ============================================================
 *  BACKEND ADAPTER
 * ============================================================
 * Everything that talks to a persistence/auth layer lives in this
 * one object. The rest of the app (rendering, forms, filtering)
 * never touches Supabase or any database API directly — it
 * only calls Backend.* methods below.
 *
 * To move to a different backend later (e.g. Supabase), rewrite the
 * INSIDE of these functions to that backend's API. Nothing outside
 * this object needs to change, as long as the contract stays the same:
 *
 *   connect()                    -> Promise<{ ok: boolean }>
 *   getUid()                     -> Promise<string | null>  (valid after connect())
 *   fetchProfile(uid)            -> Promise<Object | null>
 *   saveProfile(uid, profile)    -> Promise<void>
 *   onMembers(cb)                -> unsubscribe();  cb(Array<{id, ...}>)
 *   onRecipes(cb)                -> unsubscribe();  cb(Array<{id, ...}>)
 *   onRatings(cb)                -> unsubscribe();  cb(Array<{id, ...}>)
 *   addRecipe(data)              -> Promise<void>
 *   upsertRating(recipeId, uid, data) -> Promise<void>
 *   fetchFilterState(uid)        -> Promise<Object | null>
 *   saveFilterState(uid, data)   -> Promise<void>
 *
 * Identity: getUid() transparently creates an anonymous Supabase session
 * on first visit (no email, password, or user action needed) and reuses
 * it on later visits from the same browser. "Signing in" from the
 * person's point of view is just the name+role onboarding step.
 *
 * All ids are opaque strings. All timestamps are numbers (Date.now()).
 * Callers never assume anything about *how* data arrives beyond this
 * contract (no ORM objects, no query builders leak out).
 *
 * BACKEND: Supabase (Postgres + Auth + Realtime).
 * Schema: see db/schema.sql (tables: members, recipes, ratings;
 * row-level security policies; realtime enabled on all three tables).
 */
export const Backend = (function () {
  var sb = null;

  function liveTable(table, mapper, cb) {
    function load() {
      sb.from(table).select("*").then(function (res) {
        if (!res.error) cb((res.data || []).map(mapper));
      });
    }
    load();
    var channel = sb.channel(table + "-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: table }, load)
      .subscribe();
    return function () { sb.removeChannel(channel); };
  }

  return {
    connect: async function () {
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        return { ok: false };
      }
      try {
        sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        return { ok: true };
      } catch (e) {
        return { ok: false };
      }
    },

    // Reuses an existing (anonymous) session if there is one; otherwise
    // creates a new anonymous session on the spot. Returns null only if
    // that genuinely fails (e.g. Anonymous sign-ins disabled on the
    // Supabase project, or no network).
    getUid: async function () {
      var res = await sb.auth.getSession();
      var session = res.data && res.data.session;
      if (session) return session.user.id;

      try {
        var signInRes = await sb.auth.signInAnonymously();
        if (signInRes.error || !signInRes.data.user) return null;
        return signInRes.data.user.id;
      } catch (e) {
        return null;
      }
    },

    fetchProfile: async function (uid) {
      try {
        var res = await sb.from("members").select("*").eq("id", uid).maybeSingle();
        return (!res.error && res.data) ? mapMember(res.data) : null;
      } catch (e) {
        return null;
      }
    },

    // Only writes the columns given — omitted columns (e.g. last_phase)
    // are left untouched on an existing row.
    saveProfile: function (uid, profile) {
      return sb.from("members").upsert({
        id: uid,
        name: profile.name,
        role: profile.role,
        joined_at: profile.joinedAt
      });
    },

    onMembers: function (cb) { return liveTable("members", mapMember, cb); },
    onRecipes: function (cb) { return liveTable("recipes", mapRecipe, cb); },
    onRatings: function (cb) { return liveTable("ratings", mapRating, cb); },

    addRecipe: function (data) {
      return sb.from("recipes").insert({
        title: data.title,
        phases: data.phases,
        tags: data.tags,
        ingredients: data.ingredients,
        instructions: data.instructions,
        prep_minutes: data.prepMinutes,
        added_by: data.addedBy,
        added_by_name: data.addedByName,
        created_at: data.createdAt
      });
    },

    upsertRating: function (recipeId, uid, data) {
      return sb.from("ratings").upsert({
        recipe_id: recipeId,
        uid: uid,
        name: data.name,
        stars: data.stars,
        tolerance: data.tolerance,
        comment: data.comment,
        created_at: data.createdAt
      }, { onConflict: "recipe_id,uid" });
    },

    // Private-in-practice per-viewer preference (which phase they last
    // browsed), stored as a nullable column on their own members row.
    fetchFilterState: async function (uid) {
      var profile = await this.fetchProfile(uid);
      return (profile && profile.lastPhase) ? { lastPhase: profile.lastPhase } : null;
    },

    saveFilterState: function (uid, data) {
      return sb.from("members").update({ last_phase: data.lastPhase }).eq("id", uid);
    }
  };
})();
