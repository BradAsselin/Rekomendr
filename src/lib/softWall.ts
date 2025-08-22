// src/lib/softWall.ts
export type Tier = "guest" | "free" | "paid";

const KEY_PREFIX_COUNT = "rekomendr.searches.";
const KEY_TIER = "rekomendr.tier";
const KEY_CHAIN = "rekomendr.chain.state";

export type ChainState = {
  id: string;            // random token
  startedAt: number;     // ms epoch
  vertical?: string;     // movies|tv|wine|books
  baseQuery?: string;    // initial query text
  refines: number;       // how many "+ more like this" so far
};

export const REFINES_PER_CHAIN_LIMIT = 3;

// ---------- Tier helpers ----------
export function getTier(): Tier {
  if (typeof window === "undefined") return "guest";
  const t = (localStorage.getItem(KEY_TIER) || "guest").toLowerCase();
  return (["guest", "free", "paid"].includes(t) ? t : "guest") as Tier;
}
export function setTier(tier: Tier) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_TIER, tier);
}

// ---------- Daily counters ----------
export function getTodayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${KEY_PREFIX_COUNT}${yyyy}-${mm}-${dd}`;
}
export function getLimitForTier(tier: Tier) {
  if (tier === "paid") return Infinity;
  if (tier === "free") return 10;
  return 5; // guest
}
export function getCount() {
  if (typeof window === "undefined") return 0;
  const key = getTodayKey();
  return parseInt(localStorage.getItem(key) || "0", 10) || 0;
}
export function increment() {
  if (typeof window === "undefined") return;
  const key = getTodayKey();
  localStorage.setItem(key, String(getCount() + 1));
}
export function canSearchNow(tier?: Tier) {
  const t = tier || getTier();
  const limit = getLimitForTier(t);
  const count = getCount();
  return { allowed: count < limit, count, limit, tier: t as Tier };
}
/** Old per-query gate: keep for compatibility when you *really* want to count now */
export function gateAndMaybeIncrement(tier?: Tier) {
  const r = canSearchNow(tier);
  if (r.allowed) increment();
  return r;
}

// ---------- Chain state ----------
function readChain(): ChainState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_CHAIN);
    if (!raw) return null;
    const obj = JSON.parse(raw) as ChainState;
    if (!obj?.id) return null;
    return obj;
  } catch {
    return null;
  }
}
function writeChain(c: ChainState | null) {
  if (typeof window === "undefined") return;
  if (!c) localStorage.removeItem(KEY_CHAIN);
  else localStorage.setItem(KEY_CHAIN, JSON.stringify(c));
}
export function getActiveChain(): ChainState | null {
  return readChain();
}
export function endChain() {
  writeChain(null);
}

/** Begin a new chain. Increments daily quota (1 chain = 1 search). Returns gate + chain. */
export function beginChain(params: { vertical?: string; baseQuery?: string }) {
  const gate = canSearchNow();
  if (!gate.allowed) return { gate, chain: null as ChainState | null };
  increment(); // count 1 chain
  const chain: ChainState = {
    id: Math.random().toString(36).slice(2),
    startedAt: Date.now(),
    vertical: params.vertical,
    baseQuery: params.baseQuery,
    refines: 0,
  };
  writeChain(chain);
  return { gate, chain };
}

/** Increment refine count inside current chain. Returns updated chain + whether limit hit. */
export function recordRefine(): { chain: ChainState | null; reachedLimit: boolean } {
  const chain = readChain();
  if (!chain) return { chain: null, reachedLimit: false };
  const next = { ...chain, refines: Math.min(chain.refines + 1, REFINES_PER_CHAIN_LIMIT) };
  writeChain(next);
  return { chain: next, reachedLimit: next.refines >= REFINES_PER_CHAIN_LIMIT };
}
