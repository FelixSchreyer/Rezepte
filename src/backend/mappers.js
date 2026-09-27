// Translation between Postgres rows (snake_case, nullable columns) and the
// camelCase objects the rest of the app works with.
//
// These live outside supabase.js so they can be unit-tested without a client,
// and so the shape of an app-side object is documented in exactly one place.

export function mapMember(row) {
  return { id: row.id, name: row.name, role: row.role, joinedAt: row.joined_at, lastPhase: row.last_phase };
}

export function mapRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    phases: row.phases || [],
    tags: row.tags || [],
    ingredients: row.ingredients || [],
    instructions: row.instructions || "",
    prepMinutes: row.prep_minutes,
    addedBy: row.added_by,
    addedByName: row.added_by_name,
    createdAt: row.created_at
  };
}

export function mapRating(row) {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    uid: row.uid,
    name: row.name,
    stars: row.stars,
    tolerance: row.tolerance,
    comment: row.comment,
    createdAt: row.created_at
  };
}
