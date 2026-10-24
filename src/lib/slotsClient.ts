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

const toRek = (r: any): Rek => ({
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
  // S16 — S15's facts ("2h 10m", "on Netflix") on every recipe card.
  facts: Array.isArray(r.facts) ? r.facts.filter((f: unknown) => typeof f === "string") : [],
});

const answerOf = (data: any, reks: Rek[]): SlotAnswer => ({
  reks,
  steer: typeof data.steer === "string" ? data.steer : null,
  order: Array.isArray(data.order) ? data.order.filter((n: unknown) => typeof n === "string") : [],
});

// S16 — the "vs." lines land on the SAME cards (same ids), so the results
// merge them in place instead of treating them as a new set.
const withLines = (reks: Rek[], lines: any[]): Rek[] => {
  const by = new Map<number, { short: string; vsGoTo: string }>();
  for (const l of Array.isArray(lines) ? lines : []) {
    if (Number.isInteger(l?.tmdbId) && typeof l?.short === "string" && typeof l?.vsGoTo === "string") {
      by.set(l.tmdbId, { short: l.short, vsGoTo: l.vsGoTo });
    }
  }
  return reks.map((r) => {
    const l = r.tmdbId != null ? by.get(r.tmdbId) : undefined;
    return l ? { ...r, short: l.short, vsGoTo: l.vsGoTo } : r;
  });
};

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
    // S16 — early paint: called with the five as soon as they exist
    // (TMDb synopses), before the "vs." lines. `linesPending` = a line
    // writer is still running. The promise still resolves with the
    // finished set (lines merged into the same cards).
    onCards?: (ans: SlotAnswer & { linesPending: boolean }) => void;
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
      ...(opts.onCards && !opts.count ? { stream: "ndjson" } : {}),
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

  // S16 — the streamed answer: cards first, then lines.
  if ((res.headers.get("content-type") ?? "").includes("ndjson") && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let cards: SlotAnswer | null = null;
    let lines: any[] | null = null;
    const take = (raw: string) => {
      if (!raw.trim()) return;
      let msg: any = null;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg?.type === "cards" && msg.ok && Array.isArray(msg.reks)) {
        cards = answerOf(msg, msg.reks.map(toRek));
        opts.onCards?.({ ...cards, linesPending: !!msg.linesPending });
      } else if (msg?.type === "lines") {
        lines = Array.isArray(msg.lines) ? msg.lines : [];
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          take(buf.slice(0, nl));
          buf = buf.slice(nl + 1);
        }
      }
      take(buf);
    } catch {
      // The connection dropped mid-stream: the cards (if any) stand.
    }
    const got = cards as SlotAnswer | null;
    if (!got) {
      console.warn("[slots] FALLBACK — stream carried no cards");
      return null;
    }
    if (lines === null) console.warn("[slots] lines never arrived — synopses stand");
    return { ...got, reks: lines ? withLines(got.reks, lines) : got.reks };
  }

  const data = await res.json().catch(() => null);
  if (!data?.ok || !Array.isArray(data.reks)) {
    console.warn("[slots] FALLBACK — route could not build a set", { reason: data?.reason ?? null });
    return null;
  }
  const ans = answerOf(data, data.reks.map(toRek));
  opts.onCards?.({ ...ans, linesPending: false });
  return ans;
}

// The lead's name: a leading article goes ("vs. your Grand Budapest
// Hotel"), the rest is the go-to as starred.
export const goToShortName = (name: string): string => {
  const t = name.trim();
  const cut = t.replace(/^(the|a|an)\s+/i, "");
  return cut.length >= 3 ? cut : t;
};
