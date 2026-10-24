"use client";

// S17c — the Saved page (docs/s17-mood-first-plan.md). "Saved [n]" in the
// top bar opens a full-screen sheet with three tabs, Saved · Watched ·
// Favorites, every category grouped (Movies · TV Shows · Books · Wine).
//
//   Saved     → this client's save rows (/api/saved); the lit bookmark
//               removes one (every save row of that title, /api/signals/undo).
//   Watched   → watched rows (/api/saved); the lit check un-watches (S16's route).
//   Favorites → go-tos (the S12 mirror) + wine's one go-to (S8); the lit
//               star un-stars.
//   Tap a title → its card opens on the page (the go-to open path).
//   Footer    → "Show posters" (S17b's switch, back on after the poster ×).
//
// No new words beyond the approved ones: the controls are the cards' own
// (bookmark, check, star) with the cards' own labels.

import React, { useCallback, useEffect, useState } from "react";
import { Bookmark, Star, X } from "lucide-react";

import { WatchedButton } from "./WatchedControl";
import GoToStar from "./GoToStar";
import type { GoToTarget } from "./GoTosList";
import { BAR_CATEGORY, goToCategoryFor } from "../lib/goToCategory";
import { getGoTos, onGoTosChange, type GoTo } from "../lib/goTos";
import { getWineFavorite, onWineFavoriteChange, setWineFavorite } from "../lib/wineVisit";
import { fetchSavedLists, onSavedChange, undoSignal, undoWatched } from "../lib/userPrefs";
import { setPostersHidden, usePostersOn } from "../lib/posterPref";
import type { SavedCategory, SavedItem } from "../lib/savedLists";

const OPEN_EVENT = "rekomendr:open-saved-item";

// The page listens and opens the card (app/page.tsx → moreFromGoTo).
export function onOpenSavedItem(fn: (t: GoToTarget) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<GoToTarget>).detail);
  window.addEventListener(OPEN_EVENT, h);
  return () => window.removeEventListener(OPEN_EVENT, h);
}

const GROUPS: SavedCategory[] = ["Movies", "TV Shows", "Books", "Wine"];
type Tab = "Saved" | "Watched" | "Favorites";
const TABS: Tab[] = ["Saved", "Watched", "Favorites"];

// S18a — what an empty tab says (Brad-approved wording, 2026-10-24).
const EMPTY: Record<Tab, string> = {
  Saved: "Nothing saved yet. Tap the bookmark on any card to keep it here.",
  Watched: "Nothing marked watched yet.",
  Favorites: "No favorites yet. Tap ☆ on a card you love.",
};

const targetFor = (category: SavedCategory, name: string, goTo?: GoTo): GoToTarget => {
  if (category === "Wine") return { category: "wine", name };
  const c = goToCategoryFor(category)!;
  const kind = c === "movies" ? "movie" : c === "tv" ? "tv" : null;
  return { category: c, name, tmdbKind: goTo?.tmdbKind ?? kind, tmdbId: goTo?.tmdbId ?? null };
};

type Fav = { category: SavedCategory; name: string; year: number | null; goTo?: GoTo };

function readFavorites(): Fav[] {
  const list: Fav[] = getGoTos().map((g) => ({ category: BAR_CATEGORY[g.category], name: g.name, year: g.year, goTo: g }));
  const wine = getWineFavorite();
  if (wine) list.push({ category: "Wine", name: wine.name, year: null });
  return list;
}

const SavedPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("Saved");
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [watched, setWatched] = useState<SavedItem[]>([]);
  const [favorites, setFavorites] = useState<Fav[]>([]);
  // Saved/Watched say "empty" only once a read has actually answered — a
  // list still loading (or a failed read) is not an empty list.
  const [loaded, setLoaded] = useState(false);
  const postersOn = usePostersOn();

  const reload = useCallback(async () => {
    const lists = await fetchSavedLists();
    if (!lists) return; // a failed read keeps what's showing
    setSaved(lists.saved);
    setWatched(lists.watched);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
    setFavorites(readFavorites());
    const offSaved = onSavedChange(() => void reload());
    const offGoTos = onGoTosChange(() => setFavorites(readFavorites()));
    const offWine = onWineFavoriteChange(() => setFavorites(readFavorites()));
    return () => {
      offSaved();
      offGoTos();
      offWine();
    };
  }, [reload]);

  // While the sheet is up the page under it doesn't scroll; Escape closes.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = saved.length + watched.length + favorites.length;

  const openItem = (t: GoToTarget) => {
    setOpen(false);
    try {
      window.scrollTo({ top: 0 });
    } catch {}
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: t }));
  };

  // Optimistic: the row leaves at once; a failed write puts it back.
  const removeSaved = async (item: SavedItem) => {
    setSaved((l) => l.filter((s) => s !== item));
    const results = await Promise.all(
      item.rawCategories.map((category) => undoSignal({ category, title: item.title, action: "save", remove: true }))
    );
    if (results.some((r) => !r.ok)) {
      console.warn("[saved] remove not persisted", { reason: results.find((r) => !r.ok)?.reason ?? null });
      void reload();
    }
  };
  const unwatch = async (item: SavedItem) => {
    setWatched((l) => l.filter((s) => s !== item));
    const results = await Promise.all(item.rawCategories.map((category) => undoWatched({ category, title: item.title })));
    if (results.some((r) => !r.ok)) {
      console.warn("[saved] un-watch not persisted", { reason: results.find((r) => !r.ok)?.reason ?? null });
      void reload();
    }
  };

  const row = (key: string, category: SavedCategory, name: string, year: number | null, control: React.ReactNode, goTo?: GoTo) => (
    <li key={key} className="flex items-center justify-between gap-3 py-1">
      <button
        type="button"
        onClick={() => openItem(targetFor(category, name, goTo))}
        className="min-w-0 flex-1 py-2 text-left text-[15px] text-gray-900"
        data-testid="saved-item"
      >
        <span className="line-clamp-2">
          {name}
          {year ? <span className="text-gray-500"> ({year})</span> : null}
        </span>
      </button>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center">{control}</span>
    </li>
  );

  const grouped = <T extends { category: SavedCategory }>(list: T[], render: (x: T, i: number) => React.ReactNode) =>
    GROUPS.map((g) => {
      const items = list.filter((x) => x.category === g);
      if (!items.length) return null;
      return (
        <section key={g} className="pt-4">
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-gray-500">{g}</h3>
          <ul className="divide-y divide-gray-100">{items.map(render)}</ul>
        </section>
      );
    });

  const tabCount: Record<Tab, number> = { Saved: saved.length, Watched: watched.length, Favorites: favorites.length };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void reload();
        }}
        data-testid="saved-open"
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 active:scale-[0.99]"
      >
        <Bookmark size={13} aria-hidden="true" />
        Saved
        {count > 0 && <span className="text-white/60">{count}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Saved"
          data-testid="saved-page"
          className="fixed inset-0 z-[60] flex flex-col bg-white text-gray-900"
          style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex w-full max-w-xl items-center gap-1 border-b border-gray-200 px-2">
            <div role="tablist" className="flex flex-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`flex h-12 items-center gap-1 border-b-2 px-3 text-[15px] ${
                    tab === t ? "border-[#3B6BD4] font-semibold text-gray-900" : "border-transparent text-gray-500"
                  }`}
                >
                  {t}
                  {tabCount[t] > 0 && <span className="text-[13px] font-normal text-gray-400">{tabCount[t]}</span>}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-11 w-11 items-center justify-center text-gray-500">
              <X size={22} />
            </button>
          </div>

          <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
            {tabCount[tab] === 0 && (tab === "Favorites" || loaded) && (
              <p data-testid="saved-empty" className="pt-8 text-center text-[15px] leading-relaxed text-gray-500">
                {EMPTY[tab]}
              </p>
            )}
            {tab === "Saved" &&
              grouped(saved, (s, i) =>
                row(
                  `s${i}${s.title}`,
                  s.category,
                  s.title,
                  s.year,
                  <button type="button" aria-label="Saved" aria-pressed={true} onClick={() => void removeSaved(s)} className="flex h-11 w-11 items-center justify-center">
                    <Bookmark size={20} className="fill-[#3B6BD4] text-[#3B6BD4]" />
                  </button>
                )
              )}
            {tab === "Watched" &&
              grouped(watched, (w, i) => row(`w${i}${w.title}`, w.category, w.title, w.year, <WatchedButton on onToggle={() => void unwatch(w)} />))}
            {tab === "Favorites" &&
              grouped(favorites, (f, i) =>
                row(
                  `f${i}${f.name}`,
                  f.category,
                  f.name,
                  f.year,
                  f.goTo ? (
                    <GoToStar item={{ category: f.goTo.category, name: f.goTo.name }} size={20} />
                  ) : (
                    <button
                      type="button"
                      aria-label="Your go-to (tap to unstar)"
                      aria-pressed={true}
                      onClick={() => void setWineFavorite(null)}
                      className="flex h-11 w-11 items-center justify-center"
                    >
                      <Star size={20} strokeWidth={1.8} className="fill-amber-400 text-amber-500" />
                    </button>
                  ),
                  f.goTo
                )
              )}
          </div>

          <div className="mx-auto w-full max-w-xl border-t border-gray-200 px-4">
            <label className="flex h-14 items-center justify-between text-[15px] text-gray-900">
              Show posters
              <button
                type="button"
                role="switch"
                aria-checked={postersOn}
                data-testid="show-posters"
                onClick={() => setPostersHidden(postersOn)}
                className={`relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none ${postersOn ? "bg-[#3B6BD4]" : "bg-gray-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${postersOn ? "left-[22px]" : "left-0.5"}`}
                />
              </button>
            </label>
          </div>
        </div>
      )}
    </>
  );
};

export default SavedPage;
