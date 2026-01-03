// src/data/pools/books.ts
import { buildPool, RawRekEntry } from "./_poolBuilder";
import { RAW_BOOKS_ENRICHED } from "./books.enriched";

export const RAW_BOOKS: RawRekEntry[] =
  (RAW_BOOKS_ENRICHED as unknown) as RawRekEntry[];

export const BOOK_REKS = buildPool(RAW_BOOKS, 4001);
