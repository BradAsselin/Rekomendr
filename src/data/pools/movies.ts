// src/data/pools/movies.ts
import { buildPool, RawRekEntry } from "./_poolBuilder";
import { RAW_MOVIES_ENRICHED } from "./movies.enriched";

// ✅ Use enriched copy as RAW input (contains short/long)
export const RAW_MOVIES: RawRekEntry[] =
  (RAW_MOVIES_ENRICHED as unknown) as RawRekEntry[];

// ✅ Final pool used by API
export const MOVIE_REKS = buildPool(RAW_MOVIES, 1);
