// src/lib/anchorSnapshots.ts — server-only.
// S2: the shared half of the anchor-snapshot surface (Ledger #18/#19).
// Used by /api/save (mint), /api/share (flip + completion), the public
// page (/a/[id]) and its preview image (/api/og/[id]).
//
// Posture, restated so nobody has to go find it: public.anchor_snapshots
// has RLS ON and ZERO client policies, and anon/authenticated are revoked
// outright (docs/sql/s2-anchor-snapshots.sql). Every read and write in
// this file runs with the service role, server-side. The browser never
// queries the table and never can.
if (typeof window !== "undefined") {
  throw new Error("anchorSnapshots.ts was imported in a browser bundle.");
}
import type { SupabaseClient } from "@supabase/supabase-js";
import { HEALTH_MEDICAL_CATEGORIES } from "./categoryGates";

export const SNAPSHOT_MODES = ["similar", "uses", "alternatives"] as const;
export type SnapshotMode = (typeof SNAPSHOT_MODES)[number];

// Schema caps — the same numbers as the CHECK constraints in the SQL, so a
// request that would violate one is refused before it reaches Postgres.
export const LIMITS = {
  name: 200,
  category: 100,
  short: 2000,
  long: 4000,
} as const;

// Decided calls (#19): generous, sized so no real user ever sees them.
export const MINT_CAP_PER_DAY = 30;
export const FLIP_CAP_PER_DAY = 20;

export type SnapshotRow = {
  id: string;
  client_id: string;
  item_name: string;
  item_category: string;
  short_description: string;
  long_description: string | null;
  mode: SnapshotMode;
  shared_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export const cleanClientId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id.length >= 8 && id.length <= 64 ? id : null;
};

// Junk ids are treated as missing BEFORE they reach Postgres, which would
// otherwise throw on the uuid cast — same junk-in-no-error-page posture
// as cleanClientId.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const cleanSnapshotId = (raw: unknown): string | null =>
  typeof raw === "string" && UUID_RE.test(raw.trim()) ? raw.trim().toLowerCase() : null;

export const isHealthCategory = (category: string | null | undefined): boolean =>
  HEALTH_MEDICAL_CATEGORIES.has((category ?? "").trim().toLowerCase());

// supabaseServer throws AT IMPORT TIME on missing env, so it is only ever
// loaded dynamically, behind an env check, memoized — the same guarded
// import every service-role route in this repo uses. A missing secret is
// a named non-OK answer, never a 500.
let storePromise: Promise<SupabaseClient | null> | null = null;
export const getSnapshotStore = (): Promise<SupabaseClient | null> => {
  if (!storePromise) {
    storePromise =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? import("./supabaseServer")
            .then((m) => m.supabaseServer)
            .catch(() => null)
        : Promise.resolve(null);
  }
  return storePromise;
};

// The table-missing signature, from Postgres (42P01) or PostgREST's schema
// cache (PGRST205). Until Brad runs the migration, THIS is what every
// snapshot call hits — so it gets its own name in the log, the same way
// S1's watched route names `migration_pending`.
export const reasonForDbError = (
  error: { code?: string; message?: string } | null | undefined
): "migration_pending" | "db_error" => {
  const code = error?.code ?? "";
  const msg = error?.message ?? "";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    /anchor_snapshots/.test(msg) && /(does not exist|schema cache)/.test(msg)
  ) {
    return "migration_pending";
  }
  return "db_error";
};

// ONE public read: exact id, shared, not revoked, not health. Used by the
// landing page and the OG image — columns only, no generation anywhere on
// this path (a crawler costs one indexed point-read, never a token). A
// private, revoked, health, malformed or nonexistent id all come back as
// null, and the callers render the same 404 for every one of them.
export async function loadPublicSnapshot(rawId: unknown): Promise<SnapshotRow | null> {
  const id = cleanSnapshotId(rawId);
  if (!id) return null;
  const store = await getSnapshotStore();
  if (!store) {
    console.warn("[snapshot] public read skipped — supabase unconfigured");
    return null;
  }
  const { data, error } = await store
    .from("anchor_snapshots")
    .select(
      "id, client_id, item_name, item_category, short_description, long_description, mode, shared_at, revoked_at, created_at"
    )
    .eq("id", id)
    .not("shared_at", "is", null)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[snapshot] public read failed", {
      reason: reasonForDbError(error),
      code: error.code,
    });
    return null;
  }
  if (!data) return null;
  // Health wall, public twin: even a row that somehow got shared never
  // renders publicly. The category was token-attested at mint and is
  // re-checked against TODAY's list here.
  if (isHealthCategory((data as SnapshotRow).item_category)) return null;
  return data as SnapshotRow;
}

// First sentence of the short — the one line the preview image and the
// meta description use. The short is immutable; the long may complete
// after a share, so previews never depend on it (§5.4 of the blueprint).
export function firstSentence(text: string): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : t).slice(0, 220);
}

// Bidi overrides and control characters are stripped from anything that
// renders into an image or a meta tag — a model-generated name should
// never be able to reorder the text around it.
export function stripControl(text: string): string {
  return (text ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "");
}
