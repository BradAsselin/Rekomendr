// src/lib/shareSnapshot.ts
// S6 — Share never depends on Save.
//
// A card link needs a snapshot row (POST /api/save) that is then flipped
// public (POST /api/share). Before S6 the anchor's Share awaited whatever
// the Save tap had minted and gave up if that mint had failed — so an
// item that was "already saved" could never be shared ("couldn't share
// this one — it's still saved"). Now Share gets its own row:
//   1. the Save tap's mint, if one is in flight or done and it landed;
//   2. otherwise a fresh mint (the server dedupes on client+name+category,
//      so "already saved" answers with the same row = success);
//   3. if a long tier rode along and that mint was refused, once more
//      short-only — a long that fails to verify must never block a share.
// The same functions serve the anchor and every rek card. Transport is
// injected so validate-s6 runs them against the real routes.

export type MintToken = { sig: string; issued_at: number };
export type SnapshotModeName = "similar" | "uses" | "alternatives";

// Exactly what the server signed: name/category/short under `token`, and
// the long only together with the extended token that covers it.
export type Shareable = {
  name: string;
  category: string;
  short: string;
  token: MintToken;
  long?: string | null;
  longToken?: MintToken | null;
  mode: SnapshotModeName;
};

// POST a JSON body; resolve to the parsed JSON, or null on any failure.
export type PostJson = (url: string, body: unknown) => Promise<any>;

export type MintOutcome = { id: string | null; reason: string | null };

export async function mintSnapshot(
  item: Shareable,
  clientId: string,
  post: PostJson,
  opts: { shortOnly?: boolean } = {}
): Promise<MintOutcome> {
  const withLong = !opts.shortOnly && !!(item.long && item.longToken);
  const data = await post("/api/save", {
    clientId,
    payload: {
      name: item.name,
      category: item.category,
      short: item.short,
      long: withLong ? item.long : null,
      mode: item.mode,
    },
    token: withLong ? item.longToken : item.token,
  }).catch(() => null);
  if (data?.ok && typeof data.id === "string") return { id: data.id, reason: null };
  return { id: null, reason: typeof data?.reason === "string" ? data.reason : "unreachable" };
}

export async function snapshotForShare(args: {
  item: Shareable;
  clientId: string;
  post: PostJson;
  // The Save tap's mint for this same item, if any.
  pending?: Promise<string | null> | null;
}): Promise<MintOutcome> {
  const { item, clientId, post, pending } = args;
  if (pending) {
    const id = await pending.catch(() => null);
    if (id) return { id, reason: null };
  }
  const first = await mintSnapshot(item, clientId, post);
  if (first.id) return first;
  if (item.long && item.longToken) return mintSnapshot(item, clientId, post, { shortOnly: true });
  return first;
}

export type FlipOutcome = { ok: boolean; needsCompletion: boolean; reason: string | null };

export async function flipShare(id: string, clientId: string, post: PostJson): Promise<FlipOutcome> {
  const data = await post("/api/share", { action: "share", clientId, id }).catch(() => null);
  if (data?.ok) return { ok: true, needsCompletion: !!data.needsCompletion, reason: null };
  return {
    ok: false,
    needsCompletion: false,
    reason: typeof data?.reason === "string" ? data.reason : "unreachable",
  };
}

// The browser transport.
export const postJson: PostJson = async (url, body) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => null);
};

// A rek's attestation as it came off the wire, or undefined. Remaps that
// rebuild rek objects carry it through with this.
export const asToken = (t: unknown): MintToken | undefined => {
  const v = t as Partial<MintToken> | null | undefined;
  return v && typeof v.sig === "string" && typeof v.issued_at === "number"
    ? { sig: v.sig, issued_at: v.issued_at }
    : undefined;
};
