// src/engine/deckSelector.ts

import { STARTER_DECKS } from "../data/starterDecks";

export interface Rek {
  id: number;
  title: string;
  year: number;
  short: string;
  long: string;
  trailerUrl?: string;
  genre?: string;
  isFavorite?: boolean;
}

/**
 * Normalize Rek object so UI never breaks
 */
function normalize(rek: Rek): Rek {
  return {
    ...rek,
    trailerUrl: rek.trailerUrl ?? "",
    isFavorite: rek.isFavorite ?? false,
  };
}

function normalizeTitle(t: string): string {
  return (t ?? "").trim().toLowerCase();
}

/**
 * Deterministic starter-deck selector
 * - No AI
 * - No repeats
 * - Title-based matching (future-proof vs ID drift)
 */
export function getTop5FromDeck(
  deckId: string,
  pool: Rek[],
  sessionSeen: Set<string>
): Rek[] {
  const deck = STARTER_DECKS.find((d) => d.id === deckId);
  if (!deck) return [];

  // Build lookup for fast title match
  const byTitle = new Map<string, Rek>();
  for (const r of pool) {
    byTitle.set(normalizeTitle(r.title), r);
  }

  const selected: Rek[] = [];

  for (const title of deck.rekTitles) {
    const rek = byTitle.get(normalizeTitle(title));
    if (!rek) continue;
    if (sessionSeen.has(rek.title)) continue;

    sessionSeen.add(rek.title);
    selected.push(normalize(rek));

    if (selected.length === 5) break;
  }

  return selected;
}
