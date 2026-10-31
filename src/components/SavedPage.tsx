"use client";

// S17c — the Saved page (docs/s17-mood-first-plan.md). S24b: the top bar
// has four labeled buttons, Favorites · Watched · Recent · Saved, each with
// its count; each opens this full-screen sheet on its own tab, every
// category grouped (Movies · TV Shows · Books · Wine).
//
//   Saved     → this client's save rows (/api/saved); the lit bookmark
//               removes one (every save row of that title, /api/signals/undo).
//   Watched   → watched rows (/api/saved); the lit check un-watches (S16's route).
//   Favorites → go-tos (the S12 mirror) + wine's one go-to (S8); the lit
//               star un-stars. S21 — each tile has "+ More like this" (the
//               home screen's go-tos bar is gone; this is its home).
//   Recent    → this device's last opened/shared/saved/marked cards (S24a).
//   Tap a title → its card opens on the page (the go-to open path).
// The posters switch moved to the top bar's ⋯ menu (S24b).
//
// No new words beyond the approved ones: the controls are the cards' own
// (bookmark, check, star) with the cards' own labels.

import React, { useCallback, useEffect, useState } from "react";
import { Bookmark, CircleCheck, RotateCcw, Star, X, type LucideIcon } from "lucide-react";

import { WatchedButton } from "./WatchedControl";
import GoToStar from "./GoToStar";
import { MoreLikeThisButton, type GoToTarget } from "./GoTosList";
import { BAR_CATEGORY, goToCategoryFor } from "../lib/goToCategory";
import { getGoTos, onGoTosChange, type GoTo } from "../lib/goTos";
import { getWineFavorite, onWineFavoriteChange, setWineFavorite } from "../lib/wineVisit";
import { fetchSavedLists, onSavedChange, undoSignal, undoWatched } from "../lib/userPrefs";
import type { SavedCategory, SavedItem } from "../lib/savedLists";
import { clearRecent, getRecent, onRecentChange, type RecentItem } from "../lib/recent";

const OPEN_EVENT = "rekomendr:open-saved-item";

// The page listens and opens the card (app/page.tsx → moreFromGoTo).
// `counted`: a Favorites "+ More like this" counts as a go-to "more"; a
// tapped title doesn't.
type OpenDetail = { target: GoToTarget; counted: boolean };
export function onOpenSavedItem(fn: (t: GoToTarget, counted: boolean) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<OpenDetail>).detail;
    fn(d.target, d.counted);
  };
  window.addEventListener(OPEN_EVENT, h);
  return () => window.removeEventListener(OPEN_EVENT, h);
}

const GROUPS: SavedCategory[] = ["Movies", "TV Shows", "Books", "Wine"];
type Tab = "Saved" | "Watched" | "Favorites" | "Recent";
const TABS: Tab[] = ["Favorites", "Watched", "Recent", "Saved"];
const TAB_ICON: Record<Tab, LucideIcon> = { Favorites: Star, Watched: CircleCheck, Recent: RotateCcw, Saved: Bookmark };
// S26a — the tiles' icon colors (board F1): amber, green, light gray, light blue.
const TAB_TINT: Record<Tab, string> = {
  Favorites: "text-amber-400",
  Watched: "text-emerald-400",
  Recent: "text-gray-300",
  Saved: "text-sky-300",
};

// S18a — what an empty tab says (Brad-approved wording, 2026-10-24).
// S24a — Recent has no approved empty line: an empty Recent shows nothing.
const EMPTY: Partial<Record<Tab, string>> = {
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
  // S24a — this device's Recent (never sent anywhere).
  const [recent, setRecent] = useState<RecentItem[]>([]);
  // Saved/Watched say "empty" only once a read has actually answered — a
  // list still loading (or a failed read) is not an empty list.
  const [loaded, setLoaded] = useState(false);

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
    setRecent(getRecent());
    const offRecent = onRecentChange(() => setRecent(getRecent()));
    const offSaved = onSavedChange(() => void reload());
    const offGoTos = onGoTosChange(() => setFavorites(readFavorites()));
    const offWine = onWineFavoriteChange(() => setFavorites(readFavorites()));
    return () => {
      offSaved();
      offGoTos();
      offWine();
      offRecent();
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

  const openItem = (t: GoToTarget, counted = false) => {
    setOpen(false);
    try {
      window.scrollTo({ top: 0 });
    } catch {}
    window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { target: t, counted } }));
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

  const row = (
    key: string,
    category: SavedCategory,
    name: string,
    year: number | null,
    control: React.ReactNode,
    goTo?: GoTo,
    more?: boolean
  ) => (
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
      {more && <MoreLikeThisButton onClick={() => openItem(targetFor(category, name, goTo), true)} />}
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

  const tabCount: Record<Tab, number> = {
    Saved: saved.length,
    Watched: watched.length,
    Favorites: favorites.length,
    Recent: recent.length,
  };

  return (
    <>
      {/* S26a — the top bar's second row: four outlined tiles. */}
      <div className="grid grid-cols-4 gap-2 pb-2" data-testid="topbar-tiles">
        {TABS.map((t) => {
          const Icon = TAB_ICON[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setOpen(true);
                void reload();
              }}
              data-testid={`topbar-${t}`}
              className="flex min-w-0 flex-col items-center gap-0.5 rounded-xl border border-white/15 px-1 py-1.5 text-[12px] font-medium text-white/90 hover:bg-white/5 active:scale-[0.98] sm:border-white/25"
            >
              <span className="flex items-center gap-1">
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" className={TAB_TINT[t]} />
                {tabCount[t] > 0 && <span className="text-[12px] text-white/70">{tabCount[t]}</span>}
              </span>
              <span className="truncate">{t}</span>
            </button>
          );
        })}
      </div>

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
            {tabCount[tab] === 0 && (tab === "Favorites" || loaded) && EMPTY[tab] && (
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
              grouped(watched, (w, i) => row(`w${i}${w.title}`, w.category, w.title, w.year, <WatchedButton compact on onToggle={() => void unwatch(w)} />))}
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
                  f.goTo,
                  true
                )
              )}
            {/* S24a — Recent: newest first, every category, this device only. */}
            {tab === "Recent" && recent.length > 0 && (
              <>
                <ul className="divide-y divide-gray-100 pt-2" data-testid="recent-list">
                  {recent.map((r, i) => (
                    <li key={`r${i}${r.category}${r.title}`} className="py-1">
                      <button
                        type="button"
                        onClick={() => openItem(targetFor(r.category, r.title))}
                        className="w-full py-2 text-left"
                        data-testid="saved-item"
                      >
                        <span className="line-clamp-2 text-[15px] text-gray-900">
                          {r.title}
                          {r.year ? <span className="text-gray-500"> ({r.year})</span> : null}
                        </span>
                        <span className="block text-[12px] font-medium uppercase tracking-wide text-gray-400">{r.category}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="pt-4 text-center">
                  <button
                    type="button"
                    onClick={() => clearRecent()}
                    data-testid="recent-clear"
                    className="rounded-full px-4 py-2.5 text-[15px] font-medium text-[#3B6BD4]"
                  >
                    Clear recent
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      )}
    </>
  );
};

export default SavedPage;
