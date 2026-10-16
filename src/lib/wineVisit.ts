// src/lib/wineVisit.ts — S8b, client side: the visit's wine memory and the
// starred favorite (docs/s8-wine-shelf-plan.md).
//
// THE VISIT — every wine rek shown and every one thumbed down since this
// browser session began (sessionStorage: a visit is the browser session;
// the wordmark's home reset keeps it, a new visit starts clean). It rides
// every wine call, and the server's guarantees hold it: no wine rek repeats
// a title shown earlier in the same visit.
//
// THE FAVORITE — the starred go-to. localStorage mirror for instant UI; the
// durable copy is wine_marks via /api/wine (per anonymous id). Server wins
// on load; a local star the server never got is pushed again.

import { getAnonymousClientId } from "./userPrefs";
import type { WineFavorite } from "./wineShelf";

const VISIT_KEY = "rekomendr.wine_visit";
const FAVORITE_KEY = "rekomendr.wine_favorite";
const FAVORITE_EVENT = "rekomendr:wine-favorite";

type Visit = { seen: string[]; rejected: string[] };

function readVisit(): Visit {
  try {
    const v = JSON.parse(sessionStorage.getItem(VISIT_KEY) || "null");
    if (v && Array.isArray(v.seen) && Array.isArray(v.rejected)) return v;
  } catch {}
  return { seen: [], rejected: [] };
}

function writeVisit(v: Visit) {
  try {
    sessionStorage.setItem(
      VISIT_KEY,
      JSON.stringify({ seen: v.seen.slice(-400), rejected: v.rejected.slice(-200) })
    );
  } catch {}
}

const addUnique = (list: string[], names: string[]) => {
  const keys = new Set(list.map((n) => n.trim().toLowerCase()));
  for (const n of names) {
    const k = n.trim().toLowerCase();
    if (k && !keys.has(k)) {
      keys.add(k);
      list.push(n.trim());
    }
  }
  return list;
};

export function wineVisit(): Visit {
  return readVisit();
}

export function noteWineShown(names: string[]) {
  const v = readVisit();
  addUnique(v.seen, names);
  writeVisit(v);
}

export function noteWineRejected(name: string) {
  const v = readVisit();
  addUnique(v.rejected, [name]);
  addUnique(v.seen, [name]);
  writeVisit(v);
}

// ---------------------------------------------------------------------------
// The favorite
// ---------------------------------------------------------------------------
export function getWineFavorite(): WineFavorite | null {
  try {
    const f = JSON.parse(localStorage.getItem(FAVORITE_KEY) || "null");
    return f && typeof f.name === "string" && f.name ? f : null;
  } catch {
    return null;
  }
}

function storeFavorite(f: WineFavorite | null) {
  try {
    if (f) localStorage.setItem(FAVORITE_KEY, JSON.stringify(f));
    else localStorage.removeItem(FAVORITE_KEY);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(FAVORITE_EVENT));
  } catch {}
}

export function onWineFavoriteChange(fn: () => void): () => void {
  window.addEventListener(FAVORITE_EVENT, fn);
  return () => window.removeEventListener(FAVORITE_EVENT, fn);
}

async function postWine(body: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch("/api/wine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getAnonymousClientId(), ...body }),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

// Star (or un-star with null). Optimistic: the mark moves at once; a
// failed write is logged and the local star stands (re-pushed on load).
export async function setWineFavorite(
  f: (WineFavorite & { price?: number | null }) | null
): Promise<void> {
  storeFavorite(f ? { name: f.name, description: f.description ?? null, dry: f.dry ?? null, body: f.body ?? null } : null);
  const r = await postWine({ action: "favorite", item: f });
  if (!r?.ok) console.warn("[wine-favorite] not persisted", { reason: r?.reason ?? null });
}

// On load: the server's star wins; a local star the server never got is
// pushed again. Returns the full state (S8c reads bought/follow-up too).
export async function syncWineState(): Promise<any> {
  const r = await postWine({ action: "state" });
  if (!r?.ok) return null;
  const local = getWineFavorite();
  if (r.favorite && typeof r.favorite.name === "string") {
    if (!local || local.name !== r.favorite.name) storeFavorite(r.favorite);
  } else if (local) {
    void postWine({ action: "favorite", item: local });
  }
  return r;
}
