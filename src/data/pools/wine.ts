// src/data/pools/wine.ts
import { buildPool, RawRekEntry } from "./_poolBuilder";
import { RAW_WINE_ENRICHED } from "./wine.enriched";

export const RAW_WINE: RawRekEntry[] =
  (RAW_WINE_ENRICHED as unknown) as RawRekEntry[];

export const WINE_REKS = buildPool(RAW_WINE, 6001);
