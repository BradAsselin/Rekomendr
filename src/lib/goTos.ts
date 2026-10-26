// src/lib/goTos.ts — S12, client side: the person's go-tos for movies,
// shows and books (docs/s12-gotos-steer-plan.md). Wine's one go-to stays in
// wineVisit.ts (S8).
//
// localStorage mirror for instant UI; the durable copy is go_tos via
// /api/gotos (per anonymous id). Server wins on load; a local star the
// server never got is pushed again. Many go-tos per category, newest first.

import { getAnonymousClientId } from "./userPrefs";
import { goToCategoryFor, BAR_CATEGORY, type GoToCategory } from "./goToCategory";
import { noteRecent } from "./recent";

export type GoTo = {
  category: GoToCategory;
  name: string;
  year: number | null;
  tmdbKind: "movie" | "tv" | null;
  tmdbId: number | null;
  genreIds: number[];
  at: string;
};

const KEY = "rekomendr.go_tos";
const EVENT = "rekomendr:go-tos";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function read(): GoTo[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list)
      ? list.filter((g) => g && typeof g.name === "string" && goToCategoryFor(g.category))
      : [];
  } catch {
    return [];
  }
}

function write(list: GoTo[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {}
}

export function getGoTos(): GoTo[] {
  return read();
}

export function goTosFor(category: unknown): GoTo[] {
  const c = goToCategoryFor(category);
  return c ? read().filter((g) => g.category === c) : [];
}

export function isGoTo(category: unknown, name: string): boolean {
  const c = goToCategoryFor(category);
  return !!c && read().some((g) => g.category === c && same(g.name, name));
}

export function onGoTosChange(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}

async function post(body: Record<string, unknown>): Promise<any> {
  try {
    const res = await fetch("/api/gotos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: getAnonymousClientId(), ...body }),
    });
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export type StarInput = {
  category: unknown;
  name: string;
  year?: number | null;
  tmdbKind?: "movie" | "tv" | null;
  tmdbId?: number | null;
};

// Star (optimistic: the mark moves at once). The server's answer carries
// TMDb's id and genres for screens; the mirror takes them when it lands.
export async function starGoTo(item: StarInput): Promise<void> {
  const category = goToCategoryFor(item.category);
  if (!category || !item.name.trim()) return;
  const local: GoTo = {
    category,
    name: item.name.trim(),
    year: item.year ?? null,
    tmdbKind: item.tmdbKind ?? null,
    tmdbId: item.tmdbId ?? null,
    genreIds: [],
    at: new Date().toISOString(),
  };
  write([local, ...read().filter((g) => !(g.category === category && same(g.name, local.name)))]);
  // S24a — a star lands in Recent (this device only).
  noteRecent({ category: BAR_CATEGORY[category], title: local.name, year: local.year, tmdbId: local.tmdbId });
  const r = await post({ action: "star", item: { ...local, category } });
  if (!r?.ok) {
    console.warn("[go-tos] star not persisted", { reason: r?.reason ?? null });
    return;
  }
  if (r.goTo) {
    write(read().map((g) => (g.category === category && same(g.name, local.name) ? { ...g, ...r.goTo, name: g.name } : g)));
  }
}

export async function unstarGoTo(categoryIn: unknown, name: string): Promise<void> {
  const category = goToCategoryFor(categoryIn);
  if (!category) return;
  write(read().filter((g) => !(g.category === category && same(g.name, name))));
  const r = await post({ action: "unstar", category, name });
  if (!r?.ok) console.warn("[go-tos] unstar not persisted", { reason: r?.reason ?? null });
}

export function toggleGoTo(item: StarInput): Promise<void> {
  return isGoTo(item.category, item.name) ? unstarGoTo(item.category, item.name) : starGoTo(item);
}

// On load: the server's list wins; a local star it never got is pushed.
export async function syncGoTos(): Promise<void> {
  const r = await post({ action: "state" });
  if (!r?.ok || !Array.isArray(r.goTos)) return;
  const server: GoTo[] = r.goTos;
  const missing = read().filter((l) => !server.some((s) => s.category === l.category && same(s.name, l.name)));
  write([...missing, ...server].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")));
  for (const m of missing) void post({ action: "star", item: m });
}

// One count for /api/stats. Fire-and-forget; never blocks a tap.
export function logGoToEvent(kind: string, category?: string | null, repeats?: number): void {
  void post({ action: "event", kind, category: category ?? null, repeats: repeats ?? 0 });
}
