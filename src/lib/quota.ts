// src/lib/quota.ts
// Lightweight daily quota + chain tracking (MVP).
// Storage: http-only cookie for client id + in-memory map per server process.
// NOTE: Good enough for dev/demo. Replace with real DB for production.

import type { NextApiRequest, NextApiResponse } from "next";

// ---------- Types ----------
export type Tier = "guest" | "signed" | "paid";

type QuotaDayState = {
  // number of completed chains counted today
  count: number;
  // set of chainIds that have been counted already today (to de-dupe)
  chainsCounted: Set<string>;
};

type ClientDailyState = {
  // key: YYYY-MM-DD
  byDay: Record<string, QuotaDayState>;
};

type QuotaStore = Record<string /* clientId */, ClientDailyState>;

// Attach a single store to globalThis so dev server HMR doesn't wipe memory on every save
const g = globalThis as any;
if (!g.__REX_QUOTA_STORE__) g.__REX_QUOTA_STORE__ = {} as QuotaStore;
const STORE = g.__REX_QUOTA_STORE__ as QuotaStore;

// ---------- Cookie helpers ----------
const COOKIE_NAME = "rex_id";
const COOKIE_MAX_AGE_DAYS = 180;

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  header.split(";").forEach((p) => {
    const [k, ...rest] = p.trim().split("=");
    const v = rest.join("=");
    if (k) out[k] = decodeURIComponent(v ?? "");
  });
  return out;
}

function setCookie(res: NextApiResponse, name: string, value: string, days: number) {
  const maxAge = days * 24 * 60 * 60;
  const expires = new Date(Date.now() + maxAge * 1000).toUTCString();
  const cookie = `${name}=${encodeURIComponent(
    value
  )}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}; Max-Age=${maxAge}`;
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", cookie);
  } else if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, cookie]);
  } else {
    res.setHeader("Set-Cookie", [prev as string, cookie]);
  }
}

// Create or read a stable clientId from cookie
export function getOrCreateClientId(req: NextApiRequest, res: NextApiResponse): string {
  const cookies = parseCookies(req.headers.cookie);
  let id = cookies[COOKIE_NAME];
  if (!id) {
    id = `rex_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    setCookie(res, COOKIE_NAME, id, COOKIE_MAX_AGE_DAYS);
  }
  return id;
}

// ---------- Date helper ----------
export function todayKey(date = new Date()): string {
  // Use UTC date so servers/users in different zones are deterministic for MVP
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD
}

// ---------- Cap calculation (delegate to beta flags) ----------
export type BetaFlags = { beta1?: boolean; beta2?: boolean };
export function getEffectiveDailyCap(tier: Tier, flags?: BetaFlags): number {
  if (tier === "paid") return Number.POSITIVE_INFINITY;
  // Locked-in model: 5 → 10 (beta1) → 15 (beta2)
  let cap = 5;
  if (flags?.beta1) cap = 10;
  if (flags?.beta2) cap = 15;
  return cap;
}

// ---------- Internal store helpers ----------
function ensureDay(clientId: string, day: string): QuotaDayState {
  const c = (STORE[clientId] ??= { byDay: {} });
  const d = (c.byDay[day] ??= { count: 0, chainsCounted: new Set() });
  return d;
}

// ---------- Public API ----------

// Start a chain client-side (UI) — server doesn’t need to count here.
// We still return a suggested chainId for clients that want a server-sourced id.
export function startChain(): { chainId: string } {
  const chainId = `ch_${Math.random().toString(36).slice(2, 10)}`;
  return { chainId };
}

// End a chain: count ONE search if this chainId hasn’t been counted today.
export function endChainAndCount(params: {
  req: NextApiRequest;
  res: NextApiResponse;
  tier: Tier;
  beta?: BetaFlags;
  chainId: string;
}) {
  const { req, res, tier, beta, chainId } = params;
  const clientId = getOrCreateClientId(req, res);
  const day = todayKey();
  const dayState = ensureDay(clientId, day);

  const cap = getEffectiveDailyCap(tier, beta);
  let counted = false;

  if (!dayState.chainsCounted.has(chainId)) {
    // Only count if we are still below cap
    if (dayState.count < cap) {
      dayState.count += 1;
      dayState.chainsCounted.add(chainId);
      counted = true;
    }
  }

  const remaining = cap === Infinity ? Infinity : Math.max(0, cap - dayState.count);

  return {
    clientId,
    day,
    counted, // whether this call actually incremented
    countToday: dayState.count,
    cap,
    remaining,
  };
}

// Read current usage (for UI nudges)
export function getUsage(params: {
  req: NextApiRequest;
  res: NextApiResponse;
  tier: Tier;
  beta?: BetaFlags;
}) {
  const { req, res, tier, beta } = params;
  const clientId = getOrCreateClientId(req, res);
  const day = todayKey();
  const dayState = ensureDay(clientId, day);
  const cap = getEffectiveDailyCap(tier, beta);
  const remaining = cap === Infinity ? Infinity : Math.max(0, cap - dayState.count);

  return {
    clientId,
    day,
    countToday: dayState.count,
    cap,
    remaining,
  };
}

// Utility to hard-reset today (dev/testing)
export function resetTodayForDev(req: NextApiRequest, res: NextApiResponse) {
  const clientId = getOrCreateClientId(req, res);
  const day = todayKey();
  if (STORE[clientId]?.byDay?.[day]) {
    STORE[clientId].byDay[day] = { count: 0, chainsCounted: new Set() };
  }
  return { ok: true };
}
