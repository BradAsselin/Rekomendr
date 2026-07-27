# S3 Master Build Plan — Shareable Anchors, Slice by Slice

**Status: PLAN — nothing here is implemented.** Written 2026-07-19 (overnight session) against `main` @ `48317fa`. Executes Decision Ledger **#18** (mint at save-tap, private; Share flips `shared_at`) and **#19** (HMAC-stamped generation + lazy server-side long completion, Catch 1 chain coverage, Catch 2 fifth twin, decided rate/moderation calls). Design docs: `s3-shareable-anchors-blueprint.md`, `s3-minting-integrity.md`.

**Discipline for every slice:** verbatim disk quotes of regions to be modified; exact proposed code; scope fence (files listed — STOP if `git status` shows anything else modified); phone-runnable validation; rollback note. One slice per session, Brad approves diffs.

**Environment rule (the July 19 lesson):** every new env var goes in `.env.local` AND Vercel production, same value, in the same sitting — `SUPABASE_URL` pointing at the wrong project cost a week of silent 401s and dead shading. New var in this plan: `MINT_SIGNING_SECRET` (S3.2).

---

## S3.1 — Staleness guard + anchor_snapshots migration

**Scope fence:** `app/page.tsx` (guard) + one SQL paste in the Supabase editor. STOP if git status shows anything but `app/page.tsx` (+ this doc set).

### S3.1a — Staleness guard (~10 lines)

Per `docs/typed-lane-trace.md` A.3: an installed-PWA resume re-presents frozen state as a fresh load. Current reset machinery, verbatim (`app/page.tsx:242-260`):

```ts
  const resetToHome = () => {
    searchIdRef.current++; // discard in-flight search responses
    snapIdRef.current++; // discard in-flight snap responses
    setReks([]);
    setLoading(false);
    setLoadingLabel("Finding fresh Reks for you...");
    setHasSearched(false);
    setSearchError(null);
    setSnapLoading(false);
    setSnapResult(null);
    setSnapError(null);
    setSnapLimitReached(false);
    setHasSnapped(false); // re-show the hero snap button
    setActiveRecipe(null);
    setCategory("Movies");
    setPersistedLikedTitles([]);
    setPersistedDislikedTitles([]);
    setSearchBarKey((k) => k + 1); // remount SearchBar → pristine bar + lane
  };
```

**Proposed additions** (inside `Page()`, near the existing refs at `page.tsx:139-145`):

```ts
// Stale-session guard: an installed-PWA resume re-presents frozen state as a
// fresh load (see docs/typed-lane-trace.md). Anything older than the window
// comes home instead of resurrecting a months-old screen.
const STALE_SESSION_MS = 6 * 60 * 60 * 1000;
const lastActivityRef = useRef(Date.now());

useEffect(() => {
  const maybeReset = () => {
    if (Date.now() - lastActivityRef.current > STALE_SESSION_MS) resetToHome();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") maybeReset();
  };
  window.addEventListener("pageshow", maybeReset);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("pageshow", maybeReset);
    document.removeEventListener("visibilitychange", onVisible);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Plus one stamp line — `lastActivityRef.current = Date.now();` — at the top of `handleSearch` (`page.tsx:196`), `handleSnapFile` (`page.tsx:155`), and `resetToHome` (`page.tsx:242`). Note for the implementer: the `[]` effect closes over the first-render `resetToHome`; that instance touches only state setters (stable) and refs (stable), so the capture is safe — say so in a comment or hoist `resetToHome` into a `useCallback` if the linter objects.

### S3.1b — Migration SQL (paste-ready, Supabase editor)

```sql
-- anchor_snapshots: S3 saved/shared anchor store (Ledger #18/#19).
-- Content columns are written once at mint (+ one lazy long completion);
-- shared_at / revoked_at are the only other mutations.
create table public.anchor_snapshots (
  id uuid primary key default gen_random_uuid(),
  client_id text not null check (char_length(client_id) between 8 and 64),
  item_name text not null check (char_length(item_name) between 1 and 200),
  item_category text not null check (char_length(item_category) between 1 and 100),
  short_description text not null check (char_length(short_description) <= 2000),
  long_description text check (char_length(long_description) <= 4000),
  mode text not null check (mode in ('similar','uses','alternatives')),
  shared_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Serves the mint-cap count (S3.3/S3.6) and the future S4 saved-list read.
create index anchor_snapshots_client_created_idx
  on public.anchor_snapshots (client_id, created_at desc);

-- Zero-policy service-role-only posture (account_devices pattern).
alter table public.anchor_snapshots enable row level security;
-- Deliberately NO policies created.

-- OCT-30 GRANTS RULE (memory: supabase-grants-rule): this table ships before
-- the 2026-10-30 Data-API grants enforcement and would inherit auto-grants
-- that contradict the zero-policy design. Grants gate table access; policies
-- gate rows. Belt and suspenders:
revoke all on table public.anchor_snapshots from anon, authenticated;

-- ── verification ──
select relname, relrowsecurity from pg_class where relname = 'anchor_snapshots';
-- expect: relrowsecurity = true
select polname from pg_policy where polrelid = 'public.anchor_snapshots'::regclass;
-- expect: zero rows
select grantee, privilege_type from information_schema.role_table_grants
 where table_name = 'anchor_snapshots' and grantee in ('anon','authenticated');
-- expect: zero rows
```

**Brad tests (phone/desktop):** app loads; search and snap behave as before; leave the PWA overnight, reopen → home screen, not a stale set. Supabase editor: the three verification SELECTs return the expected shapes. **Done =** guard merged + table live + verifications pass. **Can break:** an over-eager reset if the stamp lines are missed (symptom: coming home mid-session after backgrounding — check stamps). **Rollback:** revert the page.tsx commit; `drop table public.anchor_snapshots;` (safe — nothing references it yet).

---

## S3.2 — HMAC token infrastructure (Ledger #19 option b, Catch 1)

**Scope fence:** new `src/lib/mintToken.ts`; `app/api/reksnap/route.ts`; `src/components/RekSnapResults.tsx` (payload passthrough only); `app/page.tsx` is NOT touched (the token rides inside the `SnapResult` object it already stores whole). STOP otherwise.

**Env:** `MINT_SIGNING_SECRET` — 32+ random bytes, set in `.env.local` AND Vercel production in the same sitting (rule at top). Missing secret = fail-soft: no tokens minted, no verification enforced, app behaves byte-identically to today.

### New file `src/lib/mintToken.ts` (server-only, complete)

```ts
// src/lib/mintToken.ts
// HMAC attestation for anchor content (Ledger #19). Server-only: sign at
// generation, verify at every text-only generation path and at mint.
if (typeof window !== 'undefined') {
  throw new Error('mintToken.ts was imported in a browser bundle.');
}
import { createHash, createHmac, timingSafeEqual } from 'crypto';

const WINDOW_MS = 48 * 60 * 60 * 1000; // resumed-PWA-generous, leak-tight

export type AnchorAttestation = {
  name: string;
  category: string;   // the SERVER's vision-normalized label, never client input
  short: string;
  long: string | null;
  clientId: string;
};

export type MintToken = { sig: string; issued_at: number };

const secret = () => process.env.MINT_SIGNING_SECRET || null;
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const material = (a: AnchorAttestation, issuedAt: number) =>
  [a.name, a.category, sha(a.short), sha(a.long ?? ''), a.clientId, String(issuedAt)].join('|');

// null when no secret is configured — callers treat that as "feature off".
export function signAnchor(a: AnchorAttestation): MintToken | null {
  const key = secret();
  if (!key) return null;
  const issued_at = Date.now();
  return {
    issued_at,
    sig: createHmac('sha256', key).update(material(a, issued_at)).digest('base64url'),
  };
}

export function tokensEnabled(): boolean {
  return !!secret();
}

export function verifyAnchor(a: AnchorAttestation, token: unknown): boolean {
  const key = secret();
  if (!key) return false;
  const t = token as Partial<MintToken> | null;
  const issuedAt = Number(t?.issued_at);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > WINDOW_MS) return false;
  if (typeof t?.sig !== 'string' || !t.sig) return false;
  const expected = createHmac('sha256', key).update(material(a, issuedAt)).digest();
  let given: Buffer;
  try { given = Buffer.from(t.sig, 'base64url'); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

### Sign in the vision response

Current, verbatim (`app/api/reksnap/route.ts:1031-1045`):

```ts
    return Response.json(
      {
        detected_item: {
          name: detected.name,
          description:
            typeof detected.description === "string"
              ? detected.description
              : "",
          category: anchorCategory,
        },
        mode,
        results: cleaned,
      },
      { status: 200 }
    );
```

Proposed (additive field; `clientId` is already parsed at `route.ts:907`):

```ts
    const shortText =
      typeof detected.description === "string" ? detected.description : "";
    const detectedItemToken = clientId
      ? signAnchor({
          name: detected.name,
          category: anchorCategory,
          short: shortText,
          long: null,
          clientId,
        })
      : null;

    return Response.json(
      {
        detected_item: {
          name: detected.name,
          description: shortText,
          category: anchorCategory,
        },
        ...(detectedItemToken ? { detected_item_token: detectedItemToken } : {}),
        mode,
        results: cleaned,
      },
      { status: 200 }
    );
```

### Verify-then-extend in `handleAnchorDetail`

Current gate, verbatim (`route.ts:335-342`):

```ts
  // Belt-and-braces twin of the client gate: health/medical anchors stay
  // structurally thin — no request path may generate a rich profile for them.
  if (HEALTH_MEDICAL_CATEGORIES.has(category)) {
    return Response.json(
      { error: "Detail not available for this category" },
      { status: 403 }
    );
  }
```

Proposed insertion, before the gate (and the response gains an extended token):

```ts
  // Ledger #19: when tokens are enabled, a detected-item payload must carry a
  // valid attestation — the health gate below then runs on a SERVER-attested
  // category instead of a client-asserted one. In-flight pre-deploy sessions
  // fail politely once (existing error handling) and re-snap.
  const clientId = cleanClientId(anchorDetail?.clientId);
  if (tokensEnabled()) {
    const ok =
      !!clientId &&
      verifyAnchor(
        { name, category, short: shortDescription, long: null, clientId },
        anchorDetail?.token
      );
    if (!ok) {
      console.warn("[mintToken] anchorDetail: token missing/invalid — refused");
      return Response.json({ error: "Bad anchor detail request" }, { status: 400 });
    }
  }
  // ... existing HEALTH_MEDICAL_CATEGORIES gate unchanged ...
  // response becomes:
  //   const extended = clientId
  //     ? signAnchor({ name, category, short: shortDescription, long: long.trim(), clientId })
  //     : null;
  //   return Response.json({ long: long.trim(), ...(extended ? { token: extended } : {}) }, { status: 200 });
```

### CATCH 1 — verify in `handleChain` (and backfill rides along)

Current gates, verbatim (`route.ts:693-701`):

```ts
  // Belt-and-braces twin of the client gate (same as anchorDetail): no
  // chain may generate for a health/medical anchor.
  const category =
    typeof item.category === "string" ? item.category.trim().toLowerCase() : "";
  if (HEALTH_MEDICAL_CATEGORIES.has(category)) {
    return Response.json(
      { error: "Chaining not available for this category" },
      { status: 403 }
    );
  }
```

Proposed: immediately before this gate, the same `tokensEnabled()` verification block over `{name: item.name, category, short: item.description ?? "", long: null, clientId, token: chain?.anchorToken}` — 400 on failure, tripwire log `[mintToken] chain: ...`. The identical block goes at the top of `handleBackfill` (its `detectedItem` is the same client-supplied shape, `route.ts:181-214`). **Rule as approved: every text-only generation path that accepts a detected-item payload verifies its token first. No side doors.**

### Client passthrough (`src/components/RekSnapResults.tsx`)

`SnapResult` gains the optional token (current type verbatim at `RekSnapResults.tsx:29-33`):

```ts
export type SnapResult = {
  detected_item: { name: string; description: string; category: string };
  detected_item_token?: { sig: string; issued_at: number };
  mode: SnapMode;
  results: Record<SnapMode, SnapRek[]>;
};
```

The token then rides three existing fetch bodies (quote-and-add, one line each):
- `fetchAnchorLong` body (`RekSnapResults.tsx:915-923`): add `token: forResult.detected_item_token, clientId: getAnonymousClientId()` inside `anchorDetail`.
- `buildSteerPayload` (`RekSnapResults.tsx:683-707`): add `anchorToken: forResult.detected_item_token`.
- `handleAnchorReroll` payload (`RekSnapResults.tsx:884-897`) and the backfill body (`RekSnapResults.tsx:516-525`): same added field.

The anchorDetail response's extended token is cached beside `anchorLong` (one new `useState`) for S3.3's mint.

**Brad tests:** snap → results normal; "Show details" works; chain works; backfill works (each now token-verified server-side — confirm via one `[mintToken]`-free happy-path log). Negative test from a REST client: replay an anchorDetail body with a changed category → 400. **Done =** tokens ride every path, refusals log, app UX unchanged. **Can break:** in-flight old sessions' detail/chain taps fail once politely (named, accepted per #19); a missing Vercel env var silently disables the feature — check boot logs for absence of `[mintToken]` refusals plus presence of tokens in a prod response body. **Rollback:** unset `MINT_SIGNING_SECRET` (feature off, byte-identical behavior) — no revert needed; or revert the commit.

---

## S3.3 — Save-tap minting (`/api/save`)

**Scope fence:** new `app/api/save/route.ts`; `src/components/RekSnapResults.tsx` (anchor save wiring only). STOP otherwise.

**New route** — merge-route skeleton (`app/api/auth/merge/route.ts:14-59` is the pattern: `runtime = "nodejs"`, boot-time URL-mismatch warning, guarded dynamic `supabaseServer` import, `cleanClientId`): body `{ clientId, payload: {name, category, short, long|null, mode}, token }`. Sequence:
1. Validate shapes/lengths (schema caps from S3.1b).
2. `verifyAnchor(payload+clientId, token)` — **required**, no tokenless grace at the mint (400 + tripwire on failure). If `!tokensEnabled()` → `{ ok: false }` 200 (feature off, fail-soft).
3. Health wall twin #2: `HEALTH_MEDICAL_CATEGORIES.has(payload.category)` → 403 (category is MAC-verified, so this is server-attested).
4. Rate cap (decided call): `select count(*) ... where client_id = $1 and created_at > now() - interval '24 hours'` on the S3.1b index; over **30/day** → `{ ok: false }` 200 + tripwire log.
5. Insert (private: `shared_at` null); dedupe courtesy: skip insert if an identical `(client_id, item_name, item_category)` row exists in the last 24h and return its id. Return `{ ok: true, id }`.

**Client wiring** — current save handler, verbatim (`src/components/RekSnapResults.tsx:435-441`):

```ts
    setSavedNames((prev) => ({ ...prev, [itemName]: true }));
    recordSnapSignal({
      itemName,
      itemCategory: category || result.detected_item.category,
      action: "save",
    });
    migrateToTrail(itemName);
```

Proposed addition (anchor-only, fire-and-forget, signal write untouched):

```ts
    // S3 mint (#18): the ANCHOR's save also mints a private snapshot.
    // Fire-and-forget — a mint failure never blocks or unmarks the save.
    if (itemName === result.detected_item.name) void mintAnchorSnapshot();
```

with `mintAnchorSnapshot` a small component-local helper: per-snap id cache ref (`mintedIdRef`), builds `{clientId, payload: {name, category, short, long: anchorLong, mode: result.mode}, token: anchorLongToken ?? result.detected_item_token}`, POSTs `/api/save`, caches `id`, `console.warn` tripwire on `ok:false`. Note the pairing rule: send `long` **only** with the extended token that covers it; a short-only token mints short-only even if `anchorLong` arrived later un-tokened.

**Brad tests (phone):** save the anchor → card behaves exactly as today; Supabase table editor shows one private row with the on-screen text, `shared_at` null; save a rek card → **no** row (anchor-only); 31st save in a day (dev loop) → row count stops, console tripwire. **Done =** anchor saves mint, nothing else changes. **Can break:** double-mint on save→unsave→save (idempotency step 5 covers); mint blocking the gesture (it must be `void`-fired). **Rollback:** revert commit; rows are inert (nothing reads them yet); optional `delete from anchor_snapshots;`.

---

## S3.4 — Lazy long completion + share-flip + moderation

**Scope fence:** new `app/api/share/route.ts`; new `src/lib/anchorCompletion.ts` (server); `app/api/reksnap/route.ts` only if extracting `ANCHOR_DETAIL_PROMPT` to a shared module (`src/lib/anchorDetailPrompt.ts`) — prompt text byte-identical, move only; `RekSnapResults.tsx`/`ShareButton.tsx` for the Share affordance + notice. STOP otherwise.

**Completion helper** (server-only): input = a snapshot row already loaded via service role.
```
CATCH 2 — THE FIFTH TWIN, verbatim requirement:
  if (HEALTH_MEDICAL_CATEGORIES.has(row.item_category)) return;   // token-verified at mint,
                                                                  // re-checked against the CURRENT list
```
Then generate with the anchorDetail prompt from `{name: row.item_name, category, short: row.short_description}`, and write idempotently:
`update anchor_snapshots set long_description = $1 where id = $2 and long_description is null`.
Fire-and-forget from the flip route (and later from S4 reopen). Failure → row stays short-only, free retry next trigger, tripwire log.

**Share-flip route** (`app/api/share/route.ts`): body `{ clientId, id }` →
1. Load row via service role; `row.client_id === clientId` or `{ok:false}` (no probe oracle — uniform response).
2. Health re-check (twin #3) on `row.item_category` → refuse.
3. Flip cap (decided call): ≤ **20 flips/day** per client (count `shared_at` set in window) → else `{ok:false, reason:"cap"}`.
4. **Moderation (decided Call 2):** `openai.moderations.create({ model: "omni-moderation-latest", input: [name, short, long].join("\n") })`; flagged → `{ok:false, reason:"moderation"}` **+ a server log line naming the block** (`console.warn("[share] moderation blocked:", id)`) — fails closed to private, **never silently**. Moderation API *outage* → `{ok:false, reason:"unavailable"}` + tripwire (sharing degrades, saves never do).
5. `update ... set shared_at = coalesce(shared_at, now())`; fire completion if `long_description is null`; return `{ok:true, url}`.

**Client:** Share affordance on the anchor card (health-gated exactly like the reroll verb, `RekSnapResults.tsx:1131-1137` pattern), calling flip then handing `url` to the `ShareButton` cascade (parameterize `SHARE_URL`/`SHARE_TEXT`, currently constants at `ShareButton.tsx:6-8`). On `ok:false` → soft notice, exact copy per Call 2: **"couldn't share this one — it's still saved"** (amber-card voice, same chrome as `CHAIN_FAILED_MSG`).

**Brad tests:** save → share → URL lands in the share sheet; row shows `shared_at` set and, ~seconds later, a filled `long_description`; a profanity-seeded test row refuses with the notice and a log line; a second client's `id` flip attempt → uniform `ok:false`. **Done =** flip + completion + moderation all observable in the table. **Can break:** completion racing twice (the `IS NULL` guard absorbs it); moderation false positives (notice + log = the designed behavior). **Rollback:** revert; flipped rows can be re-privatized with `update anchor_snapshots set shared_at = null;`.

---

## S3.5 — Public landing page + OG image

**Scope fence:** new `app/a/[id]/page.tsx` + `not-found.tsx`; new `app/api/og/[id]/route.tsx`; `app/layout.tsx` (metadataBase only). STOP otherwise.

**Hard posture, restated from the blueprint:** these routes render **columns only**. Neither file imports the OpenAI client or calls any generation path — a crawler hitting share URLs costs one indexed point-read, never a token. (Completion generates only from owner actions in S3.4.)

`app/layout.tsx` current metadata, verbatim (`app/layout.tsx:6-10`):

```ts
export const metadata = {
  title: "Rekomendr.AI",
  description: "Taste-first recommendations across movies, TV, books, and wine.",
  manifest: "/manifest.json",
};
```

Proposed: add `metadataBase: new URL("https://rekomendr.ai"),` (scrapers reject relative `og:image`).

**Landing page** (`app/a/[id]/page.tsx`, server component, `runtime = "nodejs"`, `dynamic = "force-dynamic"`): UUID-regex the param (junk → `notFound()`); guarded `supabaseServer` import; `select ... where id = $1 and shared_at is not null and revoked_at is null limit 1`; miss or health category (belt-and-braces twin #4) → `notFound()`. Render: accent-frame card (the `RekCard` accent treatment, white on `#1E3A8A` 3px frame), name, category label, short, long when present, categoryGates-derived link verbs, CTA block. `generateMetadata`: title `"{name} — Rekomendr"`, description = first sentence of short, `robots: { index: false, follow: false }` (noindex per #19 guard set), `openGraph`/`twitter` images → `/api/og/{id}?v=1`. `not-found.tsx`: one voice — *"This rek isn't here anymore."* + CTA.

**OG route** (`app/api/og/[id]/route.tsx`): `ImageResponse` from **`next/og`** (built into Next 14.2 — no new dependency), nodejs runtime, same select; miss → generic brand card 200. Card: navy field, white framed card, name (2-line clamp), category small-caps, first sentence of short **only** (§5.4 — long may complete after share; short is immutable), wordmark footer. Strip bidi/control chars; `Cache-Control: public, max-age=31536000, immutable`; `OG_DESIGN_VERSION` constant bumps the `?v=` on design changes.

**Brad tests (phone):** shared URL renders the card; long absent → short-only, no gap; unshared/revoked/garbage id → the not-found voice with real 404; text the URL to yourself → iMessage preview shows the card; WhatsApp same. **Done =** preview unfurls in a real thread. **Can break:** missing metadataBase (no image in preview — the first thing to check); satori font loading (bundle one TTF). **Rollback:** revert — public surface disappears cleanly; rows untouched.

---

## S3.6 — Rate caps (decided Calls 1+3)

**Scope fence:** new `src/lib/apiUsage.ts` (server helper) + new `api_usage` migration; touches to `app/api/reksnap/route.ts`, `app/api/openai/route.ts`, `app/api/recipe/route.ts`, and the three client call sites that must start sending `clientId`. STOP otherwise.

**Receipts on today's state** (finding #2, `s3-minting-integrity.md` Part 6): no `middleware.ts` exists; no limiter dependency; the only caps are client-side (`page.tsx:53-63` sessionStorage snap cap, `softWall.ts:42-56` localStorage counters). Requests missing `clientId` today: `/api/openai` (engine sends `{ prompt, ... }` — `rekomendrEngine.ts:703-711`), `/api/recipe` (`RecipeModal.tsx:51-55` sends `{ dish, detectedItem }`), and the reksnap `anchorDetail` branch (vision/backfill/chain already carry it).

**Mechanism (cheapest sound, no middleware, no new dependency):** one log table + one helper called inside each handler.

```sql
create table public.api_usage (
  id bigint generated always as identity primary key,
  client_id text not null,
  route text not null,
  created_at timestamptz not null default now()
);
create index api_usage_client_route_created_idx
  on public.api_usage (client_id, route, created_at desc);
alter table public.api_usage enable row level security;  -- zero policies
revoke all on table public.api_usage from anon, authenticated;  -- grants rule
```

`src/lib/apiUsage.ts` (server-only): `underCap(clientId, route, capPerDay)` → guarded service-role client; count rows in the 24h window; under cap → insert one row, return true; over → return false; **any DB error → return true + tripwire log** (never block real users on infra failure). Prune later with a windowed delete if the table ever matters (it's ~rows-per-request; revisit at real volume).

**Caps (generous — no real user ever sees them):** reksnap vision 60/day; reksnap text branches (anchorDetail/backfill/chain, one shared route key) 300/day; `/api/openai` 300/day; `/api/recipe` 60/day; mint 30/day and flip 20/day already live via `anchor_snapshots` counts (S3.3/S3.4 — no `api_usage` row needed there). Over-cap responses reuse each route's existing failure voice (chain error card, backfill silent-slot, recipe error state) — no new UX.

**clientId plumbing (named honestly):** the three bare call sites add `clientId: getAnonymousClientId()`; the routes reject absent/malformed ids with 400 (cheap bot filter). Limitation, accepted per Call 1: an attacker can rotate `client_id`s — these caps bound *per-identity* burn and accidental loops, not a determined distributed attacker; that tier is Vercel-platform territory (revisit only if real abuse appears).

**Brad tests:** normal day of use never hits a cap; a dev loop hammering one route trips it and the existing failure voice shows; `api_usage` rows accumulate with sane counts. **Done =** every OpenAI-burning route is capped per-client. **Can break:** the anchorDetail 400-on-missing-clientId briefly affects stale sessions (same accepted one-refusal as S3.2). **Rollback:** revert code; drop table — routes behave exactly as today.

---

## Order + parallel sessions

`S3.1 → S3.2 → S3.3 → S3.4 → S3.5 → S3.6`, one session each, Brad approves each diff. Push discipline per standing config: dual refspecs `main:main` and `main:release/v2`.

Parallel cheap sessions (no dependency on S3): `docs/pool-copy-rewrite.md` (data-only, Brad reviews copy) and `docs/wine-port-plan.md` (one prompt block). The typed-lane anchor contract (`docs/typed-lane-anchor-contract.md`) is design-approved separately and is a prerequisite only for `?q=` deep-linking — not for S3 v1's plain-link handoff.
