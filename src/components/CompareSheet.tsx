"use client";

// S24a — "Compare to" (docs/s22-compare-to-plan.md).
//
//   CompareHeader — the right side of the results header. Nothing applied:
//     an outlined "Compare to ☐" button. Applied: a filled chip per ref,
//     "vs. Knives Out ×" (× removes that one), and a "+" chip that reopens
//     the sheet.
//   CompareSheet — the bottom sheet "Compare to…": tabs Favorites ·
//     Watched · Recent · Saved, the current category only. Each row: a
//     small poster, the title, type · year/seasons, a check circle. Up to
//     three; "Done" applies (none checked = back to neutral).
//
// Approved wording only: "Compare to", "Compare to…", "vs. [Title]",
// "Done", the tab names, and the Saved page's own empty-tab lines.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleCheck, Plus, Square, X } from "lucide-react";

import { goTosFor } from "../lib/goTos";
import { fetchSavedLists } from "../lib/userPrefs";
import { getRecent, seasonsOf } from "../lib/recent";
import { usePostersOn } from "../lib/posterPref";
import { MAX_REFS, type CompareCategory, type CompareRef } from "../lib/compareTo";

/* ------------------------------------------------------------------
   The header
------------------------------------------------------------------- */
export const CompareHeader: React.FC<{
  refs: CompareRef[];
  onOpen: () => void;
  onRemove: (name: string) => void;
}> = ({ refs, onOpen, onRemove }) =>
  refs.length === 0 ? (
    <button
      type="button"
      onClick={onOpen}
      data-testid="compare-open"
      className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-white/40 px-3 py-1.5 text-[13px] font-medium text-white active:scale-[0.98] sm:border-gray-300 sm:text-gray-800"
    >
      Compare to
      <Square size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  ) : (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5" data-testid="compare-chips">
      {refs.map((r) => (
        <span
          key={r.name}
          data-testid="compare-chip"
          className="flex max-w-[15rem] items-center rounded-full bg-[#3B6BD4] pl-3 text-[13px] font-semibold text-white"
        >
          <span className="truncate">vs. {r.name}</span>
          <button
            type="button"
            onClick={() => onRemove(r.name)}
            aria-label={`vs. ${r.name} ×`}
            data-testid="compare-remove"
            className="flex h-8 w-8 shrink-0 items-center justify-center"
          >
            <X size={14} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </span>
      ))}
      {refs.length < MAX_REFS && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="+"
          data-testid="compare-add"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#3B6BD4] text-white"
        >
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );

/* ------------------------------------------------------------------
   The sheet
------------------------------------------------------------------- */
type Tab = "Favorites" | "Watched" | "Recent" | "Saved";
const TABS: Tab[] = ["Favorites", "Watched", "Recent", "Saved"];

// The Saved page's own empty-tab lines (S18a, approved). Recent has none.
const EMPTY: Partial<Record<Tab, string>> = {
  Saved: "Nothing saved yet. Tap the bookmark on any card to keep it here.",
  Watched: "Nothing marked watched yet.",
  Favorites: "No favorites yet. Tap ☆ on a card you love.",
};

type Row = {
  name: string;
  year: number | null;
  tmdbKind: "movie" | "tv" | null;
  tmdbId: number | null;
  posterPath: string | null;
  seasons: string | null;
};

const TYPE: Record<CompareCategory, string> = { Movies: "Movie", "TV Shows": "TV", Books: "Book" };
const kindOf = (c: CompareCategory): "movie" | "tv" | null => (c === "Movies" ? "movie" : c === "TV Shows" ? "tv" : null);
const keyOf = (name: string) => name.trim().toLowerCase();

// Posters and season counts the rows didn't carry: /api/facts (TMDb,
// cached), 12 at a time. Remembered for the tab's life.
const factsCache = new Map<string, { posterPath: string | null; seasons: string | null }>();

async function fillFacts(kind: "movie" | "tv", rows: Row[]): Promise<void> {
  const need = rows.filter((r) => !factsCache.has(`${kind}|${keyOf(r.name)}`));
  for (let i = 0; i < need.length; i += 12) {
    const chunk = need.slice(i, i + 12);
    try {
      const res = await fetch("/api/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: chunk.map((r) => (r.tmdbId ? { kind, id: r.tmdbId } : { kind, title: r.name, year: r.year ?? undefined })),
        }),
      });
      const data = await res.json().catch(() => null);
      const facts: any[] = Array.isArray(data?.facts) ? data.facts : [];
      chunk.forEach((r) => {
        const f = facts.find((x) => (r.tmdbId ? x?.id === r.tmdbId : typeof x?.title === "string" && keyOf(x.title) === keyOf(r.name)));
        factsCache.set(`${kind}|${keyOf(r.name)}`, {
          posterPath: typeof f?.posterPath === "string" ? f.posterPath : null,
          seasons: Array.isArray(f?.facts) ? seasonsOf(f.facts) : null,
        });
      });
    } catch {
      console.warn("[compare-to] posters unavailable — rows show without them");
      return;
    }
  }
}

const CompareSheet: React.FC<{
  category: CompareCategory;
  applied: CompareRef[];
  onClose: () => void;
  onDone: (refs: CompareRef[]) => void;
}> = ({ category, applied, onClose, onDone }) => {
  const kind = kindOf(category);
  const postersOn = usePostersOn() && !!kind;
  const [picked, setPicked] = useState<CompareRef[]>(applied);
  const [lists, setLists] = useState<{ Saved: Row[]; Watched: Row[] } | null>(null);
  const [, setFactsTick] = useState(0);

  const favorites: Row[] = useMemo(
    () =>
      goTosFor(category).map((g) => ({
        name: g.name,
        year: g.year,
        tmdbKind: g.tmdbKind,
        tmdbId: g.tmdbId,
        posterPath: null,
        seasons: null,
      })),
    [category]
  );
  const recent: Row[] = useMemo(
    () =>
      getRecent()
        .filter((r) => r.category === category)
        .map((r) => ({ name: r.title, year: r.year, tmdbKind: kind, tmdbId: r.tmdbId, posterPath: r.posterPath, seasons: r.seasons })),
    [category, kind]
  );
  const [tab, setTab] = useState<Tab>(() => (favorites.length ? "Favorites" : "Recent"));

  useEffect(() => {
    let live = true;
    void fetchSavedLists().then((l) => {
      if (!live) return;
      const rows = (items: { category: string; title: string; year: number | null }[]) =>
        items
          .filter((s) => s.category === category)
          .map((s) => ({ name: s.title, year: s.year, tmdbKind: kind, tmdbId: null, posterPath: null, seasons: null }));
      setLists(l ? { Saved: rows(l.saved), Watched: rows(l.watched) } : { Saved: [], Watched: [] });
    });
    return () => {
      live = false;
    };
  }, [category, kind]);

  const rowsFor = (t: Tab): Row[] =>
    t === "Favorites" ? favorites : t === "Recent" ? recent : (lists?.[t] ?? []);
  const rows = rowsFor(tab);

  // Posters and seasons for the open tab's rows.
  useEffect(() => {
    if (!kind || !rows.length) return;
    let live = true;
    void fillFacts(kind, rows).then(() => live && setFactsTick((n) => n + 1));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lists, kind]);

  // While the sheet is up the page under it doesn't scroll; Escape closes.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const isPicked = (name: string) => picked.some((p) => keyOf(p.name) === keyOf(name));
  const toggle = (r: Row) => {
    if (isPicked(r.name)) {
      setPicked((l) => l.filter((p) => keyOf(p.name) !== keyOf(r.name)));
      return;
    }
    if (picked.length >= MAX_REFS) return; // three at most: a fourth doesn't check
    const f = kind ? factsCache.get(`${kind}|${keyOf(r.name)}`) : undefined;
    setPicked((l) => [
      ...l,
      {
        category,
        name: r.name,
        year: r.year,
        tmdbKind: r.tmdbKind ?? kind,
        tmdbId: r.tmdbId,
        posterPath: r.posterPath ?? f?.posterPath ?? null,
        at: new Date().toISOString(),
      },
    ]);
  };

  const subline = (r: Row) => {
    const f = kind ? factsCache.get(`${kind}|${keyOf(r.name)}`) : undefined;
    const seasons = category === "TV Shows" ? (r.seasons ?? f?.seasons ?? null) : null;
    return [TYPE[category], seasons ?? (r.year ? String(r.year) : null)].filter(Boolean).join(" · ");
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" data-testid="compare-sheet">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/45" tabIndex={-1} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compare to…"
        tabIndex={-1}
        className="relative mx-auto flex max-h-[85vh] w-full max-w-xl flex-col rounded-t-2xl bg-white text-gray-900 shadow-2xl outline-none"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        <h2 className="px-4 pt-3 text-[17px] font-semibold">Compare to…</h2>
        <div role="tablist" className="mx-4 mt-3 grid grid-cols-4 rounded-xl bg-gray-100 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-testid={`compare-tab-${t}`}
              className={`h-9 rounded-lg text-[13px] ${tab === t ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <ul className="mt-2 flex-1 overflow-y-auto overscroll-contain px-4" data-testid="compare-rows">
          {rows.length === 0 && (tab !== "Watched" && tab !== "Saved" ? true : !!lists) && EMPTY[tab] && (
            <li className="py-8 text-center text-[15px] leading-relaxed text-gray-500">{EMPTY[tab]}</li>
          )}
          {rows.map((r) => {
            const on = isPicked(r.name);
            const full = !on && picked.length >= MAX_REFS;
            const f = kind ? factsCache.get(`${kind}|${keyOf(r.name)}`) : undefined;
            const poster = r.posterPath ?? f?.posterPath ?? null;
            return (
              <li key={`${tab}|${r.name}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={full || undefined}
                  onClick={() => toggle(r)}
                  data-testid="compare-row"
                  className={`flex w-full items-center gap-3 border-b border-gray-100 py-2.5 text-left ${full ? "opacity-45" : ""}`}
                >
                  {postersOn && (
                    <span className="h-[60px] w-10 shrink-0 overflow-hidden rounded-md bg-gray-200">
                      {poster && (
                        // eslint-disable-next-line @next/next/no-img-element -- TMDb's CDN already serves the 92 px size
                        <img src={`https://image.tmdb.org/t/p/w92${poster}`} alt="" width={40} height={60} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      )}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.name}</span>
                    <span className="block text-[13px] text-gray-500">{subline(r)}</span>
                  </span>
                  {on ? (
                    <CircleCheck size={24} strokeWidth={2} fill="#3B6BD4" color="#ffffff" aria-hidden="true" className="shrink-0" />
                  ) : (
                    <Circle size={24} strokeWidth={1.6} className="shrink-0 text-gray-400" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-4 pb-3 pt-3">
          <button
            type="button"
            onClick={() => onDone(picked)}
            data-testid="compare-done"
            className="h-12 w-full rounded-xl bg-[#3B6BD4] text-[16px] font-semibold text-white active:scale-[0.99]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompareSheet;
