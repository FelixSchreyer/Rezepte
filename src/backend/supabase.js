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
 * To move to a different backend later, rewrite the INSIDE of these
 * functions to that backend's API. Nothing outside this object needs
 * to change, as long as the contract stays the same:
 *
 *   connect()                    -> Promise<{ ok: boolean }>
 *   getUid()                     -> Promise<string | null>  (null = signed out)
 *   signUp(email, password)      -> Promise<{ uid } | { error }>
 *   signIn(email, password)      -> Promise<{ uid } | { error }>
 *   signOut()                    -> Promise<void>
 *   fetchProfile(uid)            -> Promise<Object | null>
 *   createProfile(uid, profile)  -> Promise<void>   (new, pending member)
 *   saveProfile(uid, profile)    -> Promise<void>   (name + role only)
 *   setMemberStatus(uid, status) -> Promise<void>   (admins only)
 *   onMembers(cb)                -> unsubscribe();  cb(Array<{id, ...}>)
 *   onRecipes(cb)                -> unsubscribe();  cb(Array<{id, ...}>)
 *   onRatings(cb)                -> unsubscribe();  cb(Array<{id, ...}>)
 *   addRecipe(data)              -> Promise<void>
 *   uploadPhoto(uid, blob)       -> Promise<path>   (a JPEG, already resized)
 *   photoUrls(paths)             -> Promise<{ path: url }>  (valid ~24h)
 *   setRecipePhoto(recipeId, path) -> Promise<void>
 *   structureRecipe(text, tags)  -> Promise<{ title, ingredients, instructions, prepMinutes, tags }>
 *                                   (rejects with .code "rate" | "missing" | "denied" | "failed")
 *   upsertRating(recipeId, uid, data) -> Promise<void>
 *   fetchFilterState(uid)        -> Promise<Object | null>
 *   saveFilterState(uid, data)   -> Promise<void>
 *
 * Every write rejects on failure. supabase-js itself never throws for a
 * refused query — it resolves with `{ error }` — so each write goes through
 * check() to turn that into a rejection the UI can show.
 *
 * `error` from signUp/signIn is one of: "invalid", "exists", "weak",
 * "confirm", "network" — the UI maps these to messages.
 *
 * Identity: email + password. Access is granted by an admin, not by
 * signing up — see db/schema.sql.
 *
 * All ids are opaque strings. All timestamps are numbers (Date.now()).
 *
 * BACKEND: Supabase (Postgres + Auth + Realtime).
 * Schema: see db/schema.sql (tables: members, recipes, ratings;
 * row-level security policies; realtime enabled on all three tables).
 */
export const Backend = (function () {
  var sb = null;
  var PHOTO_BUCKET = "recipe-photos";
  var PHOTO_URL_SECONDS = 60 * 60 * 24;

  function check(res) {
    if (res && res.error) throw res.error;
    return res;
  }

  function authError(err) {
    var msg = ((err && err.message) || "").toLowerCase();
    var code = (err && err.code) || "";
    if (code === "invalid_credentials" || msg.indexOf("invalid login") !== -1) return "invalid";
    if (code === "user_already_exists" || msg.indexOf("already registered") !== -1) return "exists";
    if (code === "weak_password" || msg.indexOf("password") !== -1) return "weak";
    if (code === "email_not_confirmed" || msg.indexOf("not confirmed") !== -1) return "confirm";
    return "network";
  }

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

    // The signed-in user, verified with the server rather than trusted from
    // the stored session — a session left over from a deleted account (or
    // from the old anonymous sign-in) is cleared and treated as signed out.
    getUid: async function () {
      var res = await sb.auth.getSession();
      if (!(res.data && res.data.session)) return null;

      var userRes = await sb.auth.getUser();
      var user = userRes.data && userRes.data.user;
      if (userRes.error || !user || user.is_anonymous) {
        await sb.auth.signOut({ scope: "local" });
        return null;
      }
      return user.id;
    },

    signUp: async function (email, password) {
      try {
        var res = await sb.auth.signUp({ email: email, password: password });
        if (res.error) return { error: authError(res.error) };
        // With "Confirm email" switched on in Supabase there is no session
        // until the mail link is clicked — and the built-in mailer does not
        // deliver to arbitrary addresses. The UI explains what to change.
        if (!res.data.session) return { error: "confirm" };
        return { uid: res.data.user.id };
      } catch (e) {
        return { error: "network" };
      }
    },

    signIn: async function (email, password) {
      try {
        var res = await sb.auth.signInWithPassword({ email: email, password: password });
        if (res.error) return { error: authError(res.error) };
        return { uid: res.data.user.id };
      } catch (e) {
        return { error: "network" };
      }
    },

    signOut: async function () {
      await sb.auth.signOut();
    },

    fetchProfile: async function (uid) {
      try {
        var res = await sb.from("members").select("*").eq("id", uid).maybeSingle();
        return (!res.error && res.data) ? mapMember(res.data) : null;
      } catch (e) {
        return null;
      }
    },

    // status and is_admin are left to their column defaults (pending, false);
    // the insert policy rejects anything else.
    createProfile: async function (uid, profile) {
      var session = (await sb.auth.getSession()).data.session;
      check(await sb.from("members").insert({
        id: uid,
        email: session && session.user.email,
        name: profile.name,
        role: profile.role,
        joined_at: profile.joinedAt
      }));
    },

    saveProfile: async function (uid, profile) {
      check(await sb.from("members").update({ name: profile.name, role: profile.role }).eq("id", uid));
    },

    setMemberStatus: async function (uid, status) {
      check(await sb.rpc("set_member_status", { target: uid, new_status: status }));
    },

    onMembers: function (cb) { return liveTable("members", mapMember, cb); },
    onRecipes: function (cb) { return liveTable("recipes", mapRecipe, cb); },
    onRatings: function (cb) { return liveTable("ratings", mapRating, cb); },

    addRecipe: async function (data) {
      check(await sb.from("recipes").insert({
        title: data.title,
        phases: data.phases,
        tags: data.tags,
        ingredients: data.ingredients,
        instructions: data.instructions,
        prep_minutes: data.prepMinutes,
        added_by: data.addedBy,
        added_by_name: data.addedByName,
        photo_path: data.photoPath || null,
        created_at: data.createdAt
      }));
    },

    // The folder must be the uploader's own id — the storage policy in
    // db/schema.sql rejects anything else.
    uploadPhoto: async function (uid, blob) {
      var id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : String(Date.now());
      var path = uid + "/" + id + ".jpg";
      check(await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
      return path;
    },

    // The bucket is private, so photos are shown through signed URLs.
    photoUrls: async function (paths) {
      if (!paths.length) return {};
      var res = check(await sb.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS));
      var out = {};
      (res.data || []).forEach(function (d) { if (d.signedUrl && !d.error) out[d.path] = d.signedUrl; });
      return out;
    },

    setRecipePhoto: async function (recipeId, path) {
      check(await sb.from("recipes").update({ photo_path: path }).eq("id", recipeId));
    },

    // Free text -> form fields, via the structure-recipe Edge Function
    // (supabase/functions/structure-recipe), which holds the Gemini key.
    structureRecipe: async function (text, tags) {
      var res = await sb.functions.invoke("structure-recipe", { body: { text: text, tags: tags } });
      if (res.error) {
        var status = res.error.context && res.error.context.status;
        var err = new Error(res.error.message || "structure-recipe failed");
        err.code = status === 429 ? "rate"
          : status === 404 ? "missing"
          : (status === 401 || status === 403) ? "denied"
          : "failed";
        throw err;
      }
      return res.data;
    },

    upsertRating: async function (recipeId, uid, data) {
      check(await sb.from("ratings").upsert({
        recipe_id: recipeId,
        uid: uid,
        name: data.name,
        stars: data.stars,
        tolerance: data.tolerance,
        comment: data.comment,
        created_at: data.createdAt
      }, { onConflict: "recipe_id,uid" }));
    },

    // Private-in-practice per-viewer preference (which phase they last
    // browsed), stored as a nullable column on their own members row.
    fetchFilterState: async function (uid) {
      var profile = await this.fetchProfile(uid);
      return (profile && profile.lastPhase) ? { lastPhase: profile.lastPhase } : null;
    },

    saveFilterState: async function (uid, data) {
      check(await sb.from("members").update({ last_phase: data.lastPhase }).eq("id", uid));
    }
  };
})();
