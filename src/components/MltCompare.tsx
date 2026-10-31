"use client";

// S31 — Compare to on More like this results (Brad, 2026-10-31).
//
// A More like this set (a row tapped in Favorites · Watched · Recent ·
// Saved, or "+ More like this" on a search card) stays seeded on the
// tapped title, but its lines stand alone. Above the cards, the existing
// Compare to row names that title, unchecked: "Compare to [Title] ☐".
// Checking it adds the existing "vs. [Title]:" line to each card (the
// /api/slots lines call, the same one Compare to uses), with the tapped
// title as the reference and no re-ranking. Unchecking takes the lines
// away. "+" opens the Compare to sheet as it does elsewhere (its Done
// also stores the set, as now). The choice lives with this set: a new
// search or a category change starts a new set and drops it.

import React, { useEffect, useMemo, useRef, useState } from "react";

import CompareSheet, { CompareHeader } from "./CompareSheet";
import { refsPayload, setRefs, type CompareCategory, type CompareRef } from "../lib/compareTo";
import { fetchCompareLines, goToShortName } from "../lib/slotsClient";
import { isGoTo } from "../lib/goTos";

export type MltSeed = {
  category: CompareCategory;
  name: string;
  year: number | null;
  tmdbKind: "movie" | "tv" | null;
  tmdbId: number | null;
};

export type MltLine = { short: string; vsGoTo: string };

const key = (s: string) => s.trim().toLowerCase();

export const seedRef = (s: MltSeed): CompareRef => ({
  category: s.category,
  name: s.name,
  year: s.year,
  tmdbKind: s.tmdbKind,
  tmdbId: s.tmdbId,
  posterPath: null,
  at: new Date().toISOString(),
});

// The card's lead, as everywhere else: "your" only for a starred go-to.
export const vsLeadFor = (category: CompareCategory, vsGoTo: string): string =>
  isGoTo(category, vsGoTo) ? `vs. your ${goToShortName(vsGoTo)}:` : `vs. ${vsGoTo}:`;

export function useMltCompare(
  seed: MltSeed | null,
  items: { title: string; year: number | null; overview?: string }[]
) {
  const [refs, setRefList] = useState<CompareRef[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [lines, setLines] = useState<Map<string, MltLine>>(new Map());
  const [pending, setPending] = useState(0);
  const asked = useRef(new Set<string>());

  const seedKey = seed ? `${seed.category}|${key(seed.name)}` : "";
  // A new seed (a new set) starts unchecked.
  useEffect(() => {
    setRefList([]);
    setLines(new Map());
    setSheetOpen(false);
    asked.current = new Set();
  }, [seedKey]);

  const refsKey = refs.map((r) => key(r.name)).join("|");
  const refsKeyRef = useRef(refsKey);
  refsKeyRef.current = refsKey;
  const itemsKey = items.map((i) => key(i.title)).join("|");

  // Lines for every card on screen that hasn't had one against this set
  // of references; cards that arrive later (a backfill) get theirs too.
  useEffect(() => {
    if (!seed || !refs.length) return;
    // The seed title itself never gets a line against itself (S32: the
    // chained card sits in the trail).
    const need = items.filter(
      (i) => key(i.title) !== key(seed.name) && !asked.current.has(`${refsKey}#${key(i.title)}`)
    );
    if (!need.length) return;
    need.forEach((i) => asked.current.add(`${refsKey}#${key(i.title)}`));
    const forKey = refsKey;
    const payload = refsPayload(refs);
    for (let i = 0; i < need.length; i += 5) {
      const chunk = need.slice(i, i + 5);
      setPending((n) => n + 1);
      void fetchCompareLines(seed.category, payload, chunk).then((got) => {
        setPending((n) => n - 1);
        if (refsKeyRef.current !== forKey) return; // the set changed meanwhile
        setLines((prev) => {
          const next = new Map(prev);
          got.forEach((l) => next.set(`${forKey}#${key(l.title)}`, { short: l.short, vsGoTo: l.vsGoTo }));
          return next;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the strings
  }, [seedKey, refsKey, itemsKey]);

  const lineFor = (title: string): MltLine | null =>
    seed && refs.length ? lines.get(`${refsKey}#${key(title)}`) ?? null : null;

  const row = useMemo(
    () =>
      seed ? (
        <>
          <CompareHeader
            refs={refs}
            pendingName={seed.name}
            onOpen={() => (refs.length ? setSheetOpen(true) : setRefList([seedRef(seed)]))}
            onRemove={(name) => setRefList((l) => l.filter((r) => r.name !== name))}
          />
          {sheetOpen && (
            <CompareSheet
              category={seed.category}
              applied={refs}
              onClose={() => setSheetOpen(false)}
              onDone={(next) => {
                setSheetOpen(false);
                setRefList(next);
                setRefs(seed.category, next);
              }}
            />
          )}
        </>
      ) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seedKey, refs, sheetOpen]
  );

  return { active: !!seed, on: refs.length > 0, row, lineFor, pending: pending > 0 };
}
