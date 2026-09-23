// src/lib/mintToken.ts
// HMAC attestation for anchor content (Decision Ledger #19, option b).
// Server-only: SIGN at generation (the vision response, the anchor-detail
// response), VERIFY at every text-only generation path that accepts a
// detected-item payload (anchorDetail, chain, backfill — Catch 1, no side
// doors on the wall) and at the mint (/api/save).
//
// What it proves: this exact {name, category, short, long} was generated
// by THIS server for THIS client id, within the window. So the health
// wall downstream runs on a server-attested category instead of a
// client-asserted one, and /api/save can only ever persist text the
// server itself produced — never arbitrary text under a rekomendr URL.
//
// Missing MINT_SIGNING_SECRET = feature off: nothing is signed, nothing
// is verified, and every caller behaves byte-identically to before S2.
// envCheck names the absence at boot and /api/health reports it.
if (typeof window !== "undefined") {
  throw new Error("mintToken.ts was imported in a browser bundle.");
}
import { createHash, createHmac, timingSafeEqual } from "crypto";

// Resumed-PWA generous (a snap from last night can still be saved this
// morning), leak-tight (a token lifted from a log is dead in two days).
const WINDOW_MS = 48 * 60 * 60 * 1000;

export type AnchorAttestation = {
  name: string;
  // The SERVER's vision-normalized label. Normalized again here (trim +
  // lowercase) on both sides, so a sign/verify pair can never disagree
  // over casing — every consumer lowercases before its health check.
  category: string;
  short: string;
  long: string | null;
  clientId: string;
};

export type MintToken = { sig: string; issued_at: number };

const secret = () => process.env.MINT_SIGNING_SECRET?.trim() || null;
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const normCategory = (c: string) => (c ?? "").trim().toLowerCase();
const material = (a: AnchorAttestation, issuedAt: number) =>
  [
    a.name,
    normCategory(a.category),
    sha(a.short),
    sha(a.long ?? ""),
    a.clientId,
    String(issuedAt),
  ].join("|");

export function tokensEnabled(): boolean {
  return !!secret();
}

// null when no secret is configured — callers treat that as "feature off".
export function signAnchor(a: AnchorAttestation): MintToken | null {
  const key = secret();
  if (!key) return null;
  const issued_at = Date.now();
  return {
    issued_at,
    sig: createHmac("sha256", key).update(material(a, issued_at)).digest("base64url"),
  };
}

export function verifyAnchor(a: AnchorAttestation, token: unknown): boolean {
  const key = secret();
  if (!key) return false;
  const t = token as Partial<MintToken> | null;
  const issuedAt = Number(t?.issued_at);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > WINDOW_MS) {
    return false;
  }
  if (typeof t?.sig !== "string" || !t.sig) return false;
  const expected = createHmac("sha256", key).update(material(a, issuedAt)).digest();
  let given: Buffer;
  try {
    given = Buffer.from(t.sig, "base64url");
  } catch {
    return false;
  }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
