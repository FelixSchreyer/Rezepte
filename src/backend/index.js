// Chooses which Backend implementation the app runs against. Every other
// module imports `Backend` from here and cannot tell the difference — that is
// the whole point of keeping the adapter contract narrow.
//
//   http://localhost:8000/          real Supabase project
//   http://localhost:8000/?mock     local mock data (see mock.js for options)
//
// The mock is opt-in per URL, never a build flag, so the default you get by
// opening the deployed site is always the real backend.

import { Backend as SupabaseBackend } from "./supabase.js";
import { MockBackend } from "./mock.js";

var useMock = new URLSearchParams(window.location.search).has("mock");

export const Backend = useMock ? MockBackend : SupabaseBackend;
export const isMock = useMock;
