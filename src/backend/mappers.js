// Translation between Postgres rows (snake_case, nullable columns) and the
// camelCase objects the rest of the app works with.
//
// These live outside supabase.js so they can be unit-tested without a client,
// and so the shape of an app-side object is documented in exactly one place.

export function mapMember(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    isAdmin: !!row.is_admin,
    joinedAt: row.joined_at,
    lastPhase: row.last_phase
  };
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
    servings: row.servings || 2,
    addedBy: row.added_by,
    addedByName: row.added_by_name,
    photoPath: row.photo_path || null,
    createdAt: row.created_at
  };
}

export function mapShoppingItem(row) {
  return {
    recipeId: row.recipe_id,
    people: row.people,
    addedBy: row.added_by,
    addedAt: row.added_at
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
