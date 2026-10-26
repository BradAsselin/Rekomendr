// src/lib/screenClient.ts — S15, client side: /api/screen and its answer
// as search-lane Reks. Null = not a streaming screen (or the read failed):
// the normal snap answers. A named AI-service failure throws, like every
// search.

import type { Rek } from "../engine/rekomendrEngine";
import { getAnonymousClientId } from "./userPrefs";
import { refsFor, refsPayload } from "./compareTo";
import { readServiceFailure } from "./aiServiceError";

export type ScreenTitles = { kind: "movie" | "tv"; id: number }[];

export type ScreenAnswer = {
  reks: Rek[];
  steer: string | null;
  order: string[];
  service: string | null;
  titles: ScreenTitles;
  // Every card a film → Movies, every card a show → TV Shows, else null.
  category: "Movies" | "TV Shows" | null;
};

let nextId = -6_000_000;

// S24a — steering is off by default: only refs chosen in "Compare to…"
// (Movies or TV — a screen mixes films and shows) rank and compare it.
const screenGoTos = () => refsPayload([...refsFor("Movies"), ...refsFor("TV Shows")]);

export async function fetchScreen(
  req: { image: string } | { titles: ScreenTitles; service: string | null; steer: string },
  signal?: AbortSignal
): Promise<ScreenAnswer | null> {
  const res = await fetch("/api/screen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: getAnonymousClientId(), goTos: screenGoTos(), ...req }),
    signal,
  }).catch(() => null);
  if (!res) {
    console.warn("[screen] request failed — the normal snap answers");
    return null;
  }
  if (!res.ok) {
    const failure = await readServiceFailure(res);
    if (failure) throw failure;
    console.warn("[screen] route answered", res.status);
    return null;
  }
  const data = await res.json().catch(() => null);
  const s = data?.screen;
  if (!s || !Array.isArray(s.reks) || s.reks.length === 0) return null;
  const reks: Rek[] = s.reks.map((r: any) => ({
    id: nextId--,
    title: String(r.title),
    year: Number(r.year) || 0,
    short: String(r.short ?? ""),
    long: String(r.long ?? ""),
    genre: typeof r.genre === "string" ? r.genre : undefined,
    trailerUrl:
      typeof r.trailerUrl === "string" && r.trailerUrl
        ? r.trailerUrl
        : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${r.title} trailer`)}`,
    isFavorite: false,
    slot: "screen",
    tmdbId: Number.isInteger(r.tmdbId) ? r.tmdbId : undefined,
    vsGoTo: typeof r.vsGoTo === "string" ? r.vsGoTo : null,
    facts: Array.isArray(r.facts) ? r.facts.filter((f: unknown) => typeof f === "string") : [],
    posterPath: typeof r.posterPath === "string" ? r.posterPath : null,
    screenNote: typeof r.screenNote === "string" ? r.screenNote : undefined,
  }));
  const kinds = new Set(s.reks.map((r: any) => r.kind));
  return {
    reks,
    steer: typeof s.steer === "string" ? s.steer : null,
    order: Array.isArray(s.order) ? s.order.filter((n: unknown) => typeof n === "string") : [],
    service: typeof s.service === "string" ? s.service : null,
    titles: Array.isArray(s.titles) ? s.titles : [],
    category: kinds.size === 1 ? (kinds.has("tv") ? "TV Shows" : "Movies") : null,
  };
}
