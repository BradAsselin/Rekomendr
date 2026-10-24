"use client";

// S18b — what this client already saved and watched, server-side (the
// Saved page's lists, /api/saved), so a card can open with its marks
// right: a title saved last week shows the filled bookmark, a watched one
// the filled check. Re-read whenever a write moves them (the S17c
// `rekomendr:saved-changed` event). Read failures leave the last answer.

import { useEffect, useState } from "react";
import { fetchSavedLists, onSavedChange } from "./userPrefs";
import type { SavedItem } from "./savedLists";

export type ServerMarks = {
  ready: boolean;
  saved: SavedItem[];
  watched: SavedItem[];
};

const EMPTY: ServerMarks = { ready: false, saved: [], watched: [] };

export function useServerMarks(enabled: boolean): ServerMarks {
  const [marks, setMarks] = useState<ServerMarks>(EMPTY);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const read = async () => {
      const lists = await fetchSavedLists();
      // A card's bookmark = a live save row, watched or not.
      if (alive && lists) setMarks({ ready: true, saved: [...lists.saved, ...lists.savedWatched], watched: lists.watched });
    };
    void read();
    const off = onSavedChange(() => void read());
    return () => {
      alive = false;
      off();
    };
  }, [enabled]);
  return marks;
}

export const markKey = (title: string) => title.trim().toLowerCase();
