import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { mapMember, mapRecipe, mapRating, mapShoppingItem } from "./mappers.js";
import { blobToBase64 } from "../lib/photos.js";

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
 *   refresh()                    -> Promise<void>   (reload every live table; rejects if one fails)
 *   onSyncState(cb)              -> cb(false) when a live table fails to load, cb(true) once all load again
 *   addRecipe(data)             -> Promise<void>
 *   updateRecipe(recipeId, data) -> Promise<void>   (title, phases, tags, ingredients,
 *                                   instructions, prepMinutes, servings)
 *   deleteRecipe(recipeId)       -> Promise<void>   (whoever added it, or an admin; its
 *                                   ratings, shopping entry and photo go with it)
 *   uploadPhoto(uid, blob)       -> Promise<path>   (a JPEG, already resized)
 *   photoUrls(paths)             -> Promise<{ path: url }>  (valid ~24h)
 *   setRecipePhoto(recipeId, path) -> Promise<void>  (the replaced photo is removed)
 *   onShopping(cb)               -> unsubscribe();  cb(Array<{recipeId, people, ...}>)
 *   setShoppingPeople(recipeId, people, uid) -> Promise<void>  (adds or updates)
 *   removeFromShopping(recipeId) -> Promise<void>
 *   clearShopping()              -> Promise<void>
 *   tidyShoppingList(lines)      -> Promise<string[]>   (LLM; same error codes as below)
 *   structureRecipe(text, tags, images) -> Promise<{ title, ingredients, instructions, prepMinutes, servings, tags }>
 *                                   images: JPEG Blobs of a printed/handwritten recipe (optional, up to 3)
 *                                   (rejects with .code "rate" | "busy" | "large" | "missing" | "denied" | "failed")
 *   upsertRating(recipeId, uid, data) -> Promise<void>
 *   saveFilterState(uid, { lastPhase, lastPhaseAt }) -> Promise<void>
 *   setPhaseStatus(uid, phase | null, at) -> Promise<void>   (a patient's "How I'm doing")
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
 * Schema: see db/schema.sql (tables: members, recipes, ratings,
 * shopping_items; row-level security policies; realtime enabled on all four).
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

  // Every open live table, by name, so refresh() can reload them all.
  var liveLoads = {};
  // Tables whose last load failed; the app is told when this turns empty
  // or non-empty, so it can say the list may be out of date.
  var failing = {};
  var syncCb = function () {};

  function setFailing(table, failed) {
    var before = Object.keys(failing).length === 0;
    if (failed) failing[table] = true; else delete failing[table];
    var after = Object.keys(failing).length === 0;
    if (before !== after) syncCb(after);
  }

  // Postgres changes are not replayed: whatever happens while the socket is
  // down (an iPhone in the pocket kills it within seconds) is simply missed.
  // So reload on every (re)subscribe after the first, and whenever
  // refresh() asks. Loads can overlap; only the latest one is applied.
  function liveTable(table, mapper, cb) {
    var seq = 0;
    function load() {
      var mine = ++seq;
      return sb.from(table).select("*").then(function (res) {
        if (res.error) throw res.error;
        if (mine !== seq) return;
        cb((res.data || []).map(mapper));
        setFailing(table, false);
      }).catch(function (e) {
        if (mine === seq) setFailing(table, true);
        throw e;
      });
    }
    load().catch(function () { /* reported through onSyncState */ });
    var subscribedOnce = false;
    var channel = sb.channel(table + "-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: table }, function () {
        load().catch(function () { /* reported through onSyncState */ });
      })
      .subscribe(function (status) {
        if (status !== "SUBSCRIBED") return;
        if (subscribedOnce) load().catch(function () { /* reported through onSyncState */ });
        subscribedOnce = true;
      });
    liveLoads[table] = load;
    return function () {
      seq++;   // a load still in flight must not deliver after this
      sb.removeChannel(channel);
      if (liveLoads[table] === load) delete liveLoads[table];
      setFailing(table, false);
    };
  }

  // Best effort: a leftover file is invisible, not broken. The storage
  // policy only lets a photo go once no recipe points at it.
  async function removePhoto(path) {
    if (!path) return;
    try { await sb.storage.from(PHOTO_BUCKET).remove([path]); } catch (e) { /* see above */ }
  }

  // Both LLM features go through the one structure-recipe function; `task`
  // in the body picks which. Errors carry a .code the UI turns into a message.
  async function callLlm(body) {
    var res = await sb.functions.invoke("structure-recipe", { body: body });
    if (res.error) {
      var status = res.error.context && res.error.context.status;
      var err = new Error(res.error.message || "structure-recipe failed");
      err.code = status === 429 ? "rate"
        : status === 503 ? "busy"
        : status === 413 ? "large"
        : status === 404 ? "missing"
        : (status === 401 || status === 403) ? "denied"
        : "failed";
      throw err;
    }
    return res.data;
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

    // Reload every open live table now — for when the app comes back to the
    // foreground or online. Rejects if any of them failed.
    refresh: async function () {
      await Promise.all(Object.keys(liveLoads).map(function (t) { return liveLoads[t](); }));
    },

    // cb(true) once every live table loads again, cb(false) when one fails.
    onSyncState: function (cb) { syncCb = cb; },

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
        servings: data.servings || 2,
        added_by: data.addedBy,
        added_by_name: data.addedByName,
        photo_path: data.photoPath || null,
        created_at: data.createdAt
      }));
    },

    // Only the recipe itself — who added it, and when, stays as it was.
    updateRecipe: async function (recipeId, data) {
      check(await sb.from("recipes").update({
        title: data.title,
        phases: data.phases,
        tags: data.tags,
        ingredients: data.ingredients,
        instructions: data.instructions,
        prep_minutes: data.prepMinutes,
        servings: data.servings || 2
      }).eq("id", recipeId));
    },

    // Row-level security turns a delete that isn't allowed into one that
    // matches nothing, so ask for the deleted row back to tell the two apart.
    // Ratings and the shopping entry go by cascade; the photo is removed
    // afterwards, best effort — a leftover file is invisible, not broken.
    deleteRecipe: async function (recipeId) {
      var res = check(await sb.from("recipes").delete().eq("id", recipeId).select("photo_path"));
      if (!res.data || !res.data.length) throw new Error("not allowed to delete this recipe");
      await removePhoto(res.data[0].photo_path);
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

    // The photo it replaces is removed from the bucket afterwards. If someone
    // else swapped it in the meantime, the storage policy still only lets an
    // unused file go, so nothing a recipe shows can be lost.
    setRecipePhoto: async function (recipeId, path) {
      var old = check(await sb.from("recipes").select("photo_path").eq("id", recipeId).maybeSingle());
      check(await sb.from("recipes").update({ photo_path: path }).eq("id", recipeId));
      var oldPath = old.data && old.data.photo_path;
      if (oldPath !== path) await removePhoto(oldPath);
    },

    onShopping: function (cb) {
      return liveTable("shopping_items", mapShoppingItem, cb);
    },

    setShoppingPeople: async function (recipeId, people, uid) {
      check(await sb.from("shopping_items").upsert(
        { recipe_id: recipeId, people: people, added_by: uid, added_at: Date.now() },
        { onConflict: "recipe_id" }
      ));
    },

    removeFromShopping: async function (recipeId) {
      check(await sb.from("shopping_items").delete().eq("recipe_id", recipeId));
    },

    // PostgREST refuses a DELETE without a filter; every row matches this one.
    clearShopping: async function () {
      check(await sb.from("shopping_items").delete().gte("added_at", 0));
    },

    tidyShoppingList: async function (lines) {
      var res = await callLlm({ task: "tidy-list", items: lines });
      return res.items || [];
    },

    // Free text -> form fields, via the structure-recipe Edge Function
    // (supabase/functions/structure-recipe), which holds the Gemini key.
    structureRecipe: async function (text, tags, images) {
      var encoded = await Promise.all((images || []).map(function (blob) {
        return blobToBase64(blob).then(function (data) { return { mimeType: blob.type || "image/jpeg", data: data }; });
      }));
      return callLlm({ text: text, tags: tags, images: encoded });
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

    // Which phase this person last picked, and when — on their own members
    // row, which the profile already carries back.
    saveFilterState: async function (uid, data) {
      check(await sb.from("members").update({ last_phase: data.lastPhase, last_phase_at: data.lastPhaseAt }).eq("id", uid));
    },

    // A patient's status, shared with everyone through the members table.
    // null clears it. See phaseStatus() in lib/members.js.
    setPhaseStatus: async function (uid, phase, at) {
      check(await sb.from("members").update({ current_phase: phase, current_phase_at: at }).eq("id", uid));
    }
  };
})();
