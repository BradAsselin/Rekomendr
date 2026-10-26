"use client";

// S16 — "Watched" on every Movies/TV/Books card, both lanes
// (docs/s16-watched-search-plan.md, Part A). One hook per lane holds:
//   - which cards are marked (optimistic: the tap is a verdict, and a
//     verdict that lags feels broken);
//   - the one toast ("Watched · Undo", ~4 s; a new mark replaces it);
//   - the write chain: Undo waits for the mark's write before deleting,
//     so it can never race ahead of the insert.
// A write that fails reverts the mark (the card un-dims) and says why in
// the log — no new copy (none approved), never a silent success.

import { useCallback, useEffect, useRef, useState } from "react";
import { recordWatched, undoWatched } from "./userPrefs";
import { BAR_CATEGORY, goToCategoryFor } from "./goToCategory";
import { noteRecent } from "./recent";

export type WatchedItem = { title: string; year?: number | null; category: string };

export const TOAST_MS = 4000;

const keyOf = (title: string) => title.trim().toLowerCase();

// The category as user_likes' readers expect it (Movies / TV Shows /
// Books — /api/prefs and readTaste both match case-insensitively). Null =
// not a watchable category (wine, health, anything else): no control.
export function watchedCategory(raw: unknown): "Movies" | "TV Shows" | "Books" | null {
  const c = goToCategoryFor(raw);
  return c ? BAR_CATEGORY[c] : null;
}

// S17 — `silent`: the lane shows its own toast (the search lane's one
// UndoToast), so this hook keeps no toast of its own.
export function useWatchedMarks(
  onChange?: (item: WatchedItem, watched: boolean) => void,
  opts: { silent?: boolean } = {}
) {
  const silent = !!opts.silent;
  const [marked, setMarked] = useState<Record<string, true>>({});
  const [toast, setToast] = useState<WatchedItem | null>(null);
  const writes = useRef(new Map<string, Promise<boolean>>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const set = (k: string, on: boolean) =>
    setMarked((m) => {
      if (on === !!m[k]) return m;
      const next = { ...m };
      if (on) next[k] = true;
      else delete next[k];
      return next;
    });

  const hideToast = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  };

  const mark = useCallback((item: WatchedItem) => {
    const category = watchedCategory(item.category);
    if (!category) return;
    const k = keyOf(item.title);
    set(k, true);
    onChangeRef.current?.(item, true);
    // S24a — a mark lands in Recent (this device only).
    noteRecent({ category, title: item.title, year: item.year ?? null });
    if (!silent) {
      if (timer.current) clearTimeout(timer.current);
      setToast(item);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (alive.current) setToast(null);
      }, TOAST_MS);
    }
    const write = recordWatched({ category, title: item.title, year: item.year ?? undefined }).then((res) => {
      if (res.ok) return true;
      console.warn("[watched] not persisted", { reason: res.reason });
      // Revert only if this mark is still the live one (an Undo may
      // already have cleared it).
      if (alive.current && writes.current.get(k) === write) {
        set(k, false);
        onChangeRef.current?.(item, false);
      }
      return false;
    });
    writes.current.set(k, write);
  }, [silent]);

  const undo = useCallback((item: WatchedItem) => {
    const category = watchedCategory(item.category);
    if (!category) return;
    const k = keyOf(item.title);
    const pending = writes.current.get(k) ?? Promise.resolve(true);
    writes.current.delete(k);
    set(k, false);
    onChangeRef.current?.(item, false);
    setToast((t) => {
      if (t && keyOf(t.title) === k) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        return null;
      }
      return t;
    });
    void pending.then(async (landed) => {
      if (!landed) return; // nothing was written
      const res = await undoWatched({ category, title: item.title });
      if (!res.ok) console.warn("[watched] undo not persisted", { reason: res.reason });
    });
  }, []);

  // S18b — marks the server already holds (the Saved page's Watched list):
  // shown as watched, no write, no toast. A later tap undoes as usual.
  const seed = useCallback((titles: string[]) => {
    if (titles.length === 0) return;
    setMarked((m) => {
      let next = m;
      for (const t of titles) {
        const k = keyOf(t);
        if (next[k]) continue;
        if (next === m) next = { ...m };
        next[k] = true;
        // No write of ours to wait for: the row is already there.
        writes.current.set(k, Promise.resolve(true));
      }
      return next;
    });
  }, []);

  const isWatched = useCallback((title: string) => !!marked[keyOf(title)], [marked]);

  const toggle = useCallback(
    (item: WatchedItem) => (marked[keyOf(item.title)] ? undo(item) : mark(item)),
    [marked, mark, undo]
  );

  return { isWatched, toggle, undo, toast, hideToast, seed };
}
