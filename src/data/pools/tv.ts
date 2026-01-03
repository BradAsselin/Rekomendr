// src/data/pools/tv.ts
import { buildPool, RawRekEntry } from "./_poolBuilder";
import { RAW_TV_ENRICHED } from "./tv.enriched";

// ✅ Use enriched copy as RAW input
export const RAW_TV: RawRekEntry[] =
  (RAW_TV_ENRICHED as unknown) as RawRekEntry[];

// ✅ Final pool used by API
export const TV_REKS = buildPool(RAW_TV, 2001);
