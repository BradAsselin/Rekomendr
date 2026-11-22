"use client";

// S42 — the search bar's category, for parts of the page that live outside
// it (the top bar's tiles sit in the layout): the Watched tile reads "Read"
// while Books is selected (docs/2026-11-22_books_card_launch.md). This
// visit only; nothing is stored or sent.

import { useEffect, useState } from "react";

const EVENT = "rekomendr:bar-category";
let current = "Movies";

export function publishBarCategory(c: string) {
  if (c === current) return;
  current = c;
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export const getBarCategory = () => current;

export function useBarCategory(): string {
  const [c, setC] = useState(current);
  useEffect(() => {
    const h = () => setC(current);
    window.addEventListener(EVENT, h);
    h();
    return () => window.removeEventListener(EVENT, h);
  }, []);
  return c;
}

// The Watched tile's (and tab's) label for a category.
export const watchedTabLabel = (category: string) => (category === "Books" ? "Read" : "Watched");
