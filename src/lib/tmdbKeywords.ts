// src/lib/tmdbKeywords.ts — server-only. S19a: a mood's keyword tags →
// TMDb keyword ids (docs/s19-fast-moods-plan.md, Part A).
//
// The mood parser names concepts in TMDb's own keyword vocabulary
// ("heist", "time travel", "mockumentary"). Each tag resolves against
// TMDb's keyword search by EXACT name after normalization — case, spaces
// and hyphens don't count ("feel good" = "feel-good" = "feelgood") — and
// every exact hit is kept (TMDb has a few duplicate names), OR'd. A tag
// with no exact hit is unresolved: never a near miss ("cozy mystery" is
// not "cozy").
//
// An EXCLUSION ("isn't too gory") is the one place a tag widens: every
// keyword containing its words is kept out too, because keeping more out
// only narrows the pool. Measured: Saw carries "blood and gore", "splatter
// horror" and "torture", never "gore".
//
// Cached per process for a day, misses included. A TMDb failure is named
// and the tag counts as unresolved, so the mood takes the AI search.

if (typeof window !== "undefined") {
  throw new Error("tmdbKeywords.ts was imported in a browser bundle.");
}

import { tmdbGet } from "./tmdbMedia";

const TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 500;
type TagIds = { exact: number[]; wide: number[] };
const cache = new Map<string, { at: number; ids: TagIds }>();

export const keywordKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const wordsOf = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

async function resolveTag(tag: string): Promise<TagIds | null> {
  const key = keywordKey(tag);
  if (!key) return { exact: [], wide: [] };
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  let failed: string | null = null;
  const data = await tmdbGet("search/keyword", { query: tag, page: "1" }, (r) => (failed = r));
  if (!data) {
    console.warn("[mood-keywords] lookup failed — tag unresolved", { tag, reason: failed });
    return null;
  }
  const rows = (Array.isArray(data.results) ? data.results : []).filter(
    (r: any) => typeof r?.id === "number" && typeof r?.name === "string"
  );
  const want = wordsOf(tag);
  const ids: TagIds = {
    exact: rows.filter((r: any) => keywordKey(r.name) === key).map((r: any) => r.id as number),
    wide: rows
      .filter((r: any) => {
        const have = wordsOf(r.name);
        return keywordKey(r.name) === key || want.every((w) => have.includes(w));
      })
      .map((r: any) => r.id as number),
  };
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), ids });
  return ids;
}

export type KeywordConcept = { tags: string[]; exclude: boolean };
// A resolved concept: each tag TMDb knows by that exact name, with its ids.
// `role` (set by the mood route): "words" = tags echoing what the person
// said; "title" = what a named reference title is.
export type ResolvedConcept = {
  tags: string[];
  ids: number[];
  exclude: boolean;
  role?: "words" | "title";
};
export type ResolvedTags = { tags: { tag: string; ids: number[] }[]; exclude: boolean };

export async function resolveConcepts(
  concepts: KeywordConcept[]
): Promise<{ resolved: ResolvedTags[]; unresolved: string[] }> {
  const unresolved: string[] = [];
  const resolved = await Promise.all(
    concepts.map(async (c) => {
      const hits = await Promise.all(c.tags.map((t) => resolveTag(t)));
      const tags: { tag: string; ids: number[] }[] = [];
      c.tags.forEach((t, i) => {
        const found = hits[i] ? (c.exclude ? hits[i]!.wide : hits[i]!.exact) : [];
        if (found.length) tags.push({ tag: t, ids: found });
        else unresolved.push(t);
      });
      return { tags, exclude: c.exclude };
    })
  );
  return { resolved: resolved.filter((c) => c.tags.length > 0), unresolved };
}

// One concept from the tags kept: their names and their ids, OR'd.
export const conceptOf = (
  tags: { tag: string; ids: number[] }[],
  exclude: boolean,
  role: "words" | "title"
): ResolvedConcept => ({
  tags: tags.map((t) => t.tag),
  ids: Array.from(new Set(tags.flatMap((t) => t.ids))),
  exclude,
  role,
});
