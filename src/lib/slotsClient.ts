// src/lib/slotsClient.ts — S12b, client side: one call to /api/slots and
// its answer as search-lane Reks. Null = the route could not build a set
// (no TMDb key, TMDb down): the caller runs the old AI chip search, and
// says so in the log — never silently.

import type { Rek } from "../engine/rekomendrEngine";
import { getAnonymousClientId } from "./userPrefs";
import { goTosFor } from "./goTos";
import { visitSeen } from "./screenVisit";
import { readServiceFailure } from "./aiServiceError";

export type SlotRequest = {
  category: "Movies" | "TV Shows";
  lane: string | null;
  refiner: { kind: "tone"; vibe: string } | { kind: "era"; era: "classic" | "new" } | null;
};

export type SlotAnswer = { reks: Rek[]; steer: string | null; order: string[] };

let nextId = -5_000_000;

export async function fetchSlots(
  req: SlotRequest,
  opts: {
    steer?: string | null;
    count?: 1;
    slot?: string;
    extraSeen?: string[];
    // S13c — a title the person NAMED in a spoken mood ("like Lioness but
    // funnier") steers this request as if it were a go-to. Never stored.
    extraGoTos?: { name: string; tmdbKind: "movie" | "tv"; tmdbId: number; at: string }[];
  } = {}
): Promise<SlotAnswer | null> {
  const res = await fetch("/api/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: getAnonymousClientId(),
      category: req.category,
      lane: req.lane,
      refiner: req.refiner,
      goTos: [
        ...goTosFor(req.category).map((g) => ({ name: g.name, tmdbKind: g.tmdbKind, tmdbId: g.tmdbId, at: g.at })),
        ...(opts.extraGoTos ?? []),
      ],
      steer: opts.steer ?? null,
      seen: [...visitSeen(req.category), ...(opts.extraSeen ?? [])],
      ...(opts.count ? { count: opts.count } : {}),
      ...(opts.slot ? { slot: opts.slot } : {}),
    }),
  }).catch(() => null);
  if (!res) {
    console.warn("[slots] FALLBACK — request failed; the AI chip search runs");
    return null;
  }
  if (!res.ok) {
    // A named AI-service failure carries honest copy (the line writer is
    // the only model call); it travels as a throw like every search.
    const failure = await readServiceFailure(res);
    if (failure) throw failure;
    console.warn("[slots] FALLBACK — route answered", res.status);
    return null;
  }
  const data = await res.json().catch(() => null);
  if (!data?.ok || !Array.isArray(data.reks)) {
    console.warn("[slots] FALLBACK — route could not build a set", { reason: data?.reason ?? null });
    return null;
  }
  const reks: Rek[] = data.reks.map((r: any) => ({
    id: nextId--,
    title: String(r.title),
    year: Number(r.year) || 0,
    short: String(r.short ?? ""),
    long: String(r.long ?? ""),
    genre: typeof r.genre === "string" ? r.genre : undefined,
    trailerUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${r.title} trailer`)}`,
    isFavorite: false,
    slot: typeof r.slot === "string" ? r.slot : undefined,
    tmdbId: Number.isInteger(r.tmdbId) ? r.tmdbId : undefined,
    vsGoTo: typeof r.vsGoTo === "string" ? r.vsGoTo : null,
  }));
  return {
    reks,
    steer: typeof data.steer === "string" ? data.steer : null,
    order: Array.isArray(data.order) ? data.order.filter((n: unknown) => typeof n === "string") : [],
  };
}

// The lead's name: a leading article goes ("vs. your Grand Budapest
// Hotel"), the rest is the go-to as starred.
export const goToShortName = (name: string): string => {
  const t = name.trim();
  const cut = t.replace(/^(the|a|an)\s+/i, "");
  return cut.length >= 3 ? cut : t;
};
