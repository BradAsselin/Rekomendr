// src/engine/compass/compassPick.ts
import { MOVIE_COMPASS_BY_DECK, type MovieDeckId } from "./moviesCompass";

type TitleLike = { title: string };

export function buildCompassTop5FromDeck<T extends TitleLike>(args: {
  deckId: string | null;
  pool: T[];
  sessionSeen: Set<string>;
  count?: number; // default 5
}): T[] {
  const count = args.count ?? 5;
  const deckId = (args.deckId ?? "") as MovieDeckId;
  const cfg = MOVIE_COMPASS_BY_DECK[deckId];
  if (!cfg) return [];

  // Map available items by normalized title (skip already-seen)
  const byTitle = new Map<string, T>();
  for (const item of args.pool) {
    if (!item?.title) continue;
    // sessionSeen holds trimmed+lowercased keys (engine seenKey) — match that.
    if (args.sessionSeen.has(item.title.trim().toLowerCase())) continue;
    byTitle.set(normTitle(item.title), item);
  }

  const picks: T[] = [];
  const used = new Set<string>();

  const tryPick = (title: string) => {
    const key = normTitle(title);
    if (used.has(key)) return;
    const item = byTitle.get(key);
    if (!item) return;
    used.add(key);
    picks.push(item);
  };

  // 2 anchors, 2 neighbors, 1 wildcard (tolerant if missing)
  for (const t of cfg.anchors) {
    if (picks.length >= count) break;
    tryPick(t);
  }
  for (const t of cfg.neighbors) {
    if (picks.length >= count) break;
    tryPick(t);
  }
  for (const t of cfg.wildcards) {
    if (picks.length >= count) break;
    tryPick(t);
  }

  return picks.slice(0, count);
}

function normTitle(s: string): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
