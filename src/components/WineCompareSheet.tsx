"use client";

// S26b — wine's "Compare to…" sheet (Brad's S25 brief, items 6–7; board
// W2). Same shell, rows and check circles as the movie sheet
// (CompareSheet.tsx). A shelf snap adds a first tab, "This shelf N",
// selected by default: every bottle the shelf read found, in shelf order,
// name and tag price. Favorites (the starred go-to), Recent and Saved are
// the wine rows of the same lists. No Watched tab: wine has none. Nothing
// here leaves the device.
//
// Approved wording only: "Compare to…", "This shelf", the helper line,
// "Done", the tab names, and the Saved page's own empty-tab lines.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleCheck } from "lucide-react";

import { fetchSavedLists } from "../lib/userPrefs";
import { getRecent } from "../lib/recent";
import { getWineFavorite } from "../lib/wineVisit";
import { MAX_WINE_REFS, sameRef, shelfPriceLine, shelfRows, type WineRef, type WineRefSource } from "../lib/wineCompare";
import type { ShelfBottle } from "../lib/wineShelf";

type Tab = "This shelf" | "Favorites" | "Recent" | "Saved";

// Approved wording (Brad's S25 brief).
const SHELF_HELP = "Every bottle we read in your shelf photo. Pick one you know.";
// The Saved page's own empty-tab lines (S18a, approved). Recent has none.
const EMPTY: Partial<Record<Tab, string>> = {
  Saved: "Nothing saved yet. Tap the bookmark on any card to keep it here.",
  Favorites: "No favorites yet. Tap ☆ on a card you love.",
};

const WineCompareSheet: React.FC<{
  shelf: ShelfBottle[] | null;
  applied: WineRef[];
  // Taste positions already known on this result (picks shown, refs).
  tasteFor: (name: string) => { dry: number | null; body: number | null } | null;
  onClose: () => void;
  onDone: (refs: WineRef[]) => void;
}> = ({ shelf, applied, tasteFor, onClose, onDone }) => {
  const shelfList = useMemo(() => shelfRows(shelf), [shelf]);
  const [picked, setPicked] = useState<WineRef[]>(applied);
  const [saved, setSaved] = useState<WineRef[] | null>(null);
  const tabs: Tab[] = shelfList.length ? ["This shelf", "Favorites", "Recent", "Saved"] : ["Favorites", "Recent", "Saved"];

  // Built once per open: the sheet is a snapshot of the lists.
  const [lists] = useState(() => {
    const row = (name: string, from: WineRefSource, price: number | null = null): WineRef => {
      const t = tasteFor(name);
      return { name, price, priceSource: price != null ? "tag" : null, dry: t?.dry ?? null, body: t?.body ?? null, from };
    };
    const f = getWineFavorite();
    return {
      row,
      shelf: shelfList.map((b) => row(b.name, "shelf", b.price)),
      favorites: f
        ? [{ ...row(f.name, "favorites"), dry: f.dry ?? tasteFor(f.name)?.dry ?? null, body: f.body ?? tasteFor(f.name)?.body ?? null }]
        : [],
      recent: getRecent()
        .filter((r) => r.category === "Wine")
        .map((r) => row(r.title, "recent")),
    };
  });
  const [tab, setTab] = useState<Tab>(() => (shelfList.length ? "This shelf" : lists.favorites.length ? "Favorites" : "Recent"));

  useEffect(() => {
    let live = true;
    void fetchSavedLists().then((l) => {
      if (!live) return;
      setSaved(l ? l.saved.filter((s) => s.category === "Wine").map((s) => lists.row(s.title, "saved")) : []);
    });
    return () => {
      live = false;
    };
  }, [lists]);

  const rows: WineRef[] =
    tab === "This shelf" ? lists.shelf : tab === "Favorites" ? lists.favorites : tab === "Recent" ? lists.recent : (saved ?? []);

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

  const isPicked = (name: string) => picked.some((p) => sameRef(p, { name }));
  const toggle = (r: WineRef) => {
    if (isPicked(r.name)) {
      setPicked((l) => l.filter((p) => !sameRef(p, r)));
      return;
    }
    if (picked.length >= MAX_WINE_REFS) return; // three at most: a fourth doesn't check
    setPicked((l) => [...l, r]);
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
        <div role="tablist" className={`mx-4 mt-3 grid rounded-xl bg-gray-100 p-1 ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-testid={`compare-tab-${t === "This shelf" ? "Shelf" : t}`}
              className={`h-9 whitespace-nowrap rounded-lg px-1 text-[13px] ${tab === t ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600"}`}
            >
              {t}
              {t === "This shelf" && (
                <>
                  {" "}
                  <span className="font-normal text-gray-500">{shelfList.length}</span>
                </>
              )}
            </button>
          ))}
        </div>
        {tab === "This shelf" && (
          <p className="px-4 pt-2 text-[13px] text-gray-500" data-testid="shelf-help">
            {SHELF_HELP}
          </p>
        )}

        <ul className="mt-2 flex-1 overflow-y-auto overscroll-contain px-4" data-testid="compare-rows">
          {rows.length === 0 && (tab !== "Saved" || !!saved) && EMPTY[tab] && (
            <li className="py-8 text-center text-[15px] leading-relaxed text-gray-500">{EMPTY[tab]}</li>
          )}
          {rows.map((r, i) => {
            const on = isPicked(r.name);
            const full = !on && picked.length >= MAX_WINE_REFS;
            const price = r.priceSource === "tag" ? shelfPriceLine(r) : null;
            return (
              <li key={`${tab}|${i}|${r.name}`}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  aria-disabled={full || undefined}
                  onClick={() => toggle(r)}
                  data-testid="compare-row"
                  className={`flex w-full items-center gap-3 border-b border-gray-100 py-2.5 text-left ${full ? "opacity-45" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.name}</span>
                    {price && <span className="block text-[13px] text-gray-500">{price}</span>}
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

export default WineCompareSheet;
