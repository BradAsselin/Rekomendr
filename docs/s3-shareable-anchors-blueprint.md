# S3 Blueprint — Shareable Anchors

**Status: PLAN ONLY — nothing in this doc is implemented.** Read-only trace performed 2026-07-19 against `main` @ `48317fa`. All quotes are verbatim from disk at that commit.

Goal: per-anchor shareable URLs + a public landing page that renders the saved anchor from a **stored snapshot — never regenerated** — with OG metadata and a server-rendered preview image.

---

## 1. The anchor's data shape (what exists client-side)

### 1.1 The wire/prop types

The anchor is `detected_item` inside `SnapResult`, defined in `src/components/RekSnapResults.tsx:19-33`:

```ts
export type SnapRek = {
  name: string;
  description: string;
  // The rek's OWN generation-labeled category. Optional: sets generated
  // before the field shipped have none — every consumer falls back to the
  // anchor's detected category.
  category?: string;
  rank: number;
};

export type SnapResult = {
  detected_item: { name: string; description: string; category: string };
  mode: SnapMode;
  results: Record<SnapMode, SnapRek[]>;
};
```

`SnapMode` is `src/lib/reksnapSignals.ts:33`:

```ts
export type SnapMode = 'similar' | 'uses' | 'alternatives';
```

### 1.2 Field-by-field origin

| Field | Origin | Notes |
|---|---|---|
| `detected_item.name` | Vision response (`/api/reksnap` POST, image branch) | passed through as-is from the model |
| `detected_item.description` | Vision response | the Katrina-validated two-sentence profile ("short" tier) |
| `detected_item.category` | Vision response, normalized server-side, `"unknown"` floor | drives every client gate |
| `mode` | Vision response (model-inferred intent), server-validated | user can flip it client-side (`activeMode`) |
| long tier | **Lazy** — separate text-only `anchorDetail` call on first "Show details" tap | cached in component state only, for the life of the snap |
| verbs | **Derived at render** from `category` via `categoryGates.ts` | not data — recomputable from `name` + `category` |
| image | **Transient** — never stored anywhere | see 1.5 |

### 1.3 Where the server builds `detected_item` — `app/api/reksnap/route.ts:962-967` and `1031-1045`:

```ts
    // Anchor category, normalized once — the response's detected_item value
    // and the per-rek floor in cleanList ("unknown" floor, as before).
    const anchorCategory =
      typeof detected.category === "string" && detected.category.trim()
        ? normalize(detected.category)
        : "unknown";
```

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

### 1.4 The long tier — lazy, session-lifetime, health-gated

Client state, `src/components/RekSnapResults.tsx:124-127`:

```ts
  // Anchor long tier — lazy-loaded on first "Show details" tap, then cached
  // for the life of the snap (re-toggles are local, no re-fetch).
  const [anchorLong, setAnchorLong] = useState<string | null>(null);
```

Fetched via the `anchorDetail` branch (`RekSnapResults.tsx:912-923`), which sends `name`, `category`, and the displayed short verbatim; the server returns `{ long: string }` (`app/api/reksnap/route.ts:374`). The server hard-gates health categories, `app/api/reksnap/route.ts:335-342`:

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

**Consequence for S3:** at any given moment the long tier exists client-side only if the user has expanded the anchor this snap. It is never persisted anywhere.

### 1.5 The verb derivation — pure functions of `category` and `name`

`RekSnapResults.tsx:1000-1016`:

```ts
  // One normalized category drives every gate below — the anchor-richness
  // gates (long tier AND completion verbs) and the recipe push-through —
  // so they can never drift apart.
  const detectedCategory = (result.detected_item.category ?? "")
    .trim()
    .toLowerCase();
  const anchorIsHealthMedical = HEALTH_MEDICAL_CATEGORIES.has(detectedCategory);
  const anchorIsMedia = MEDIA_CATEGORIES.has(detectedCategory);
```

and the completion URLs (`RekSnapResults.tsx:1040-1045`) are string templates over `detected_item.name`. **Nothing about verbs needs snapshotting** — a landing page can re-derive them from `name` + `category` using the same `categoryGates.ts` sets.

### 1.6 The photo — confirmed transient

`app/page.tsx:166-172`: the file is downscaled to a data URL and sent in the fetch body; it is never placed in React state, storage, or any table:

```ts
      const image = await imageFileToDataUrl(file);
      const res = await fetch("/api/reksnap", {
```

The server uses it for the one vision call and discards it. **The photo cannot appear on a landing page without new persistence work** (see §6, Q6).

---

## 2. What a save currently persists

### 2.1 Tap → handler

Saving the anchor calls `handleSave` with no category argument (fallback = anchor's own category), `src/components/RekSnapResults.tsx:1090`:

```tsx
          onSave={() => handleSave(result.detected_item.name)}
```

`handleSave`, `RekSnapResults.tsx:424-442` (un-save is visual-only — no row is written or deleted):

```ts
  const handleSave = (itemName: string, category?: string) => {
    if (!result) return;
    if (savedNames[itemName]) {
      setSavedNames((prev) => {
        const next = { ...prev };
        delete next[itemName];
        return next;
      });
      if (thumbSignals[itemName] !== "like") returnToFrontier(itemName);
      return;
    }
    setSavedNames((prev) => ({ ...prev, [itemName]: true }));
    recordSnapSignal({
      itemName,
      itemCategory: category || result.detected_item.category,
      action: "save",
    });
    migrateToTrail(itemName);
  };
```

### 2.2 Handler → database row

The insert, `src/lib/reksnapSignals.ts:49-59`, quoted verbatim:

```ts
  const { error } = await supabase.from('reksnap_signals').insert({
    client_id: clientId,
    item_name: params.itemName,
    item_category: params.itemCategory,
    source: 'reksnap',
    action: params.action,
    // Nullable columns — NULL except for the action that owns each.
    flip_to_mode: params.flipToMode ?? null,
    chain_depth: params.chainDepth ?? null,
    chain_origin: params.chainOrigin ?? null,
  });
```

So a saved anchor becomes exactly: `(client_id, item_name, item_category, source='reksnap', action='save', NULL, NULL, NULL, created_at)`. Per S2a RLS, this table is **write-only from the browser** (anon SELECT dropped) — the client cannot even read the row back, and no row id returns to the client.

### 2.3 What is LOST at save time

A landing page trying to reconstruct from the `reksnap_signals` row would have **only the item's name and category**. Lost:

1. **`detected_item.description`** — the two-sentence profile. This is the product. Without it the page is a bare title.
2. **The long tier** (`anchorLong`) — if it was ever fetched; it lives only in component state.
3. **`mode`** — which intent lens the snap resolved to (recoverable in spirit, but not stored).
4. **The photo** — never persisted anywhere at all.
5. **The rek lists / trail** — the five-card sets and the user's keeps exist only in component state.
6. **Any stable row identity** — inserts return nothing to the client; there is no id to build a URL from.

Verbs are *not* lost (derivable from name + category, §1.5). Rank does not apply to the anchor.

---

## 3. The gap: anchor-snapshot persistence

### 3.1 New table, not an extension of `reksnap_signals`

Extend `reksnap_signals`? **No.** Argument:

- **Different kind of data.** `reksnap_signals` is an append-only telemetry stream: thin rows, one action each, CHECK-constrained action enum, consumed only by the service-role shading reader. A snapshot is a *content document* with a public lifecycle (mint → share → possibly revoke).
- **Opposite RLS posture.** Signals are write-only from the browser (S2a, deliberate). Snapshots must be *readable* by the public route. Loosening the signals table to serve landing pages would undo S2a's hardening for every signal row.
- **Payload bloat.** Adding `short_description`/`long_description`/`share_id` columns that are NULL on ~100% of taste-signal rows pollutes the hot table the shading query scans.
- **Established precedent.** S2b already established "new concern → new table with its own posture" with `account_devices` (zero client policies, service-role only). Snapshots follow the same shape.

### 3.2 Proposed schema

```sql
create table anchor_snapshots (
  -- Public URL token AND primary key: 122 bits of randomness, minted by
  -- Postgres. Unguessability IS the read-access model (see 3.5).
  id uuid primary key default gen_random_uuid(),
  -- Provenance/ownership: same self-asserted localStorage identity as every
  -- other table; joins to account_devices for account-level ownership later.
  client_id text not null check (length(client_id) between 8 and 64),
  item_name text not null check (length(item_name) between 1 and 200),
  item_category text not null check (length(item_category) between 1 and 100),
  short_description text not null check (length(short_description) <= 2000),
  -- NULL when the user never expanded details before saving — the page
  -- renders short-only. Whether a background completion may fill it later
  -- is the open sub-decision under Q5. Never generated at render time.
  long_description text check (length(long_description) <= 4000),
  mode text not null check (mode in ('similar','uses','alternatives')),
  -- THE VISIBILITY BIT (Q2 decided): rows are minted PRIVATE at save-tap
  -- (shared_at NULL — no public read resolves them). Share flips this bit;
  -- it never mints. The snapshot doubles as the S4 saved-list store.
  shared_at timestamptz,
  -- Soft revocation: unshare = set, page 404s. Row kept for provenance.
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table anchor_snapshots enable row level security;
-- ZERO client policies — same posture as account_devices. All reads and
-- writes go through service-role routes (BYPASSRLS).
```

### 3.3 When to snapshot: **DECIDED 2026-07-19 — at save-tap, privately; Share flips the visibility bit** (Decision Ledger #18)

Brad's rationale, verbatim: *"No other saved list opens back up and tells you the details of what you saved. It's the point."*

The snapshot is the saved artifact, not the shared artifact. The saved list (S4) must open back up rich — so the profile is persisted the moment the user saves, and `anchor_snapshots` is the S4 saved-items store, not merely a share table.

- **Mint moment:** anchor save-tap. The client sends exactly what it is rendering — `name`, `category`, `description`, `anchorLong` (or null), and `result.mode` (the snap's resolved intent, not `activeMode`, which is a browsing pill flip) — to the snapshot mint route (service-role insert, merge-route pattern). The row is born with `shared_at NULL`: **private**. No public URL resolves it.
- **Share-tap flips the bit.** Share sets `shared_at = now()` on the existing snapshot and returns nothing new — the id already exists from the save. The client then builds `https://rekomendr.ai/a/{id}` and hands it to the existing `ShareButton` cascade (`src/components/ShareButton.tsx:46-80`: native share sheet → async clipboard → `execCommand` fallback → show-the-URL toast); the cascade generalizes by parameterizing `SHARE_URL`/`SHARE_TEXT`, currently constants at `ShareButton.tsx:6-8`. Share therefore requires a prior save (or performs save-then-flip as one gesture — UI detail for build time).
- **What's-on-screen only, at mint time.** If the long tier wasn't loaded at save-tap, `long_description` is NULL. Whether a **background completion** may fill it in later (fetch the long tier after save so the saved/shared page is always rich) is the open sub-decision — see Q5. Render time never generates, regardless.
- Idempotency: repeated save-taps are already visual-only after the first (`RekSnapResults.tsx:424-442`); the mint fires once per anchor per snap, and the client caches `{ [itemName]: id }` for the life of the snap, same pattern as `anchorLong`.

### 3.4 ID scheme

`gen_random_uuid()` as the primary key and the URL token: `/a/8f14e45f-...`. 122 random bits — unguessable by enumeration at any realistic scale; no sequence to walk; zero extra code (no nanoid dependency, no server-side minting logic beyond the insert's `returning id`). If shorter URLs are wanted later, a `slug` column can be added without breaking existing links (see §6, Q7).

### 3.5 RLS posture

**RLS enabled, zero client policies; all access via service-role server routes** — exactly the `account_devices` posture, and consistent with the S2a/S2b direction (browser writes narrow, browser reads via server):

- **Write paths:** two service-role routes (guarded dynamic import of `supabaseServer` — never static, per the [[dislike-shading]] rule; boot-time URL-mismatch tripwire like `/api/prefs` and the merge route): the **mint route** (fires at save-tap, validates `cleanClientId` (8–64), field lengths, and the health wall §4.3, inserts with `shared_at NULL`) and the **share route** (flips `shared_at` on an existing row, authorized by matching `client_id`).
- **Read path (public):** only the server components — the landing page and the OG route resolve the snapshot server-side by exact id, filtering `shared_at is not null and revoked_at is null`. A private (never-shared) snapshot is publicly indistinguishable from a nonexistent one. No anon SELECT policy exists, so the browser can never query or enumerate the table; possession of the full UUID of a *shared* row via a server route is the only public read capability. (S4's owner-scoped saved-list read is a later, separate service-role route keyed by `client_id`/`account_devices` — private rows exist for it.)
- **Revocation path (future UI):** service-role route that sets `revoked_at`, authorized by matching `client_id` (or the account_devices join once signed-in ownership matters).

This deliberately does *not* use a public-read RLS policy ("anon SELECT where revoked_at is null"): it would work, but it opens a browser-visible query surface on a table that only ever needs point lookups by unguessable id, and it breaks the "zero client policies on new tables" pattern for no benefit — the page is server-rendered regardless (OG scrapers don't run JS).

---

## 4. The public route

### 4.1 Structure

```
app/
  a/
    [id]/
      page.tsx          ← server component, no "use client", no auth
```

- `export const runtime = "nodejs"` (service-role pattern requires it) and `export const dynamic = "force-dynamic"` — or a short `revalidate`; snapshots are immutable-except-revocation, so a small cache window is safe. Start with dynamic; optimize later.
- Resolution: guarded dynamic import of `supabaseServer` (never static), then `select ... where id = params.id and shared_at is not null and revoked_at is null limit 1` — private (never-shared) rows never resolve publicly. Malformed UUID → treat as missing (Postgres would error on the cast; validate with a regex first, same junk-in-no-error-page philosophy as `cleanClientId`).
- `generateMetadata({ params })` does its own resolve (or shares a memoized loader with the page via React `cache()`) to emit per-anchor OG tags (§5.3).
- Layout note: `/a/[id]` inherits the root layout's `TopBar` (`app/layout.tsx:12-21`) — acceptable for v1; the Share/Install buttons double as the CTA surface.

### 4.2 What renders

**Valid id:** a static, non-interactive anchor card reusing the accent treatment (the `RekCard` accent frame, `src/components/RekCard.tsx:116-118` — navy 3px border, white interior). Content: item name, small category label, `short_description`, `long_description` when present (rendered open — no lazy expander; there is nothing to fetch), and completion verbs re-derived from `categoryGates` (Trailer/Where-to-watch for media, View recipe → the app, Buy otherwise) — pure link handoffs, same as today. Below the card: one CTA block — "Snapped with Rekomendr. Get reks for anything → rekomendr.ai". **No signal buttons** (thumbs/save write per-client taste rows; a public visitor has no snap context — first version keeps the page read-only).

**Missing / malformed / revoked id:** `notFound()` → `app/a/[id]/not-found.tsx` (or a shared not-found) with one voice, in the app's register (compare `CHAIN_FAILED_MSG`, `RekSnapResults.tsx:61-62`): *"This rek isn't here anymore."* + the same CTA block. A real 404 status matters: link scrapers must not cache a ghost preview for a revoked share.

**Health-category anchor — the rule:** **health/medical anchors are not shareable at all.** (Per Ledger #19 the wall ultimately has FIVE twins — the three below plus the flip-route re-check and the lazy-completion health exclusion on token-verified category; see `docs/s3-minting-integrity.md`.) The wall gets its third and fourth twins:

1. Client: the Share affordance simply never renders when `anchorIsHealthMedical` (exactly how the long-tier expander and all verbs are suppressed today, `RekSnapResults.tsx:1077-1137`).
2. `/api/share`: refuses `HEALTH_MEDICAL_CATEGORIES` members with 403 — the same belt-and-braces twin as `handleAnchorDetail` (`app/api/reksnap/route.ts:335-342`) and `handleChain` (`route.ts:694-717`).
3. Landing page: if a health row somehow exists anyway (category drift, historical data), render `notFound()`. No thin fallback — a share URL for a health item should not exist, so it behaves as if it doesn't.

Rationale: the established posture is "structurally thin, gated in code, not just by prompt" (`src/lib/categoryGates.ts:15-18`). A public, OG-previewed page is the *richest* affordance in the product; the category that gets no long tier and no verbs cannot get a landing page. Note the same normalization caveat as everywhere: membership is exact-match on the normalized label, so unlisted health-adjacent labels pass the gate — same accepted risk as today, same fix (grow the word list).

### 4.3 The "never regenerated" invariant, stated

The landing page and OG route render **only** columns of `anchor_snapshots`. Neither imports the OpenAI client, neither has any code path to `/api/reksnap`. If `long_description` is null it stays null forever — the page renders short-only rather than ever minting tokens on a public, unauthenticated, crawlable URL. (This is also the DoS posture: bots hitting share URLs cost one indexed point-read, never an OpenAI call.)

---

## 5. OG preview image

### 5.1 Mechanism

Next 14.2 ships `ImageResponse` from **`next/og`** — no `@vercel/og` dependency needed (`package.json:20`: `"next": "^14.2.31"`; the standalone package is for non-Next or older setups). Two wiring options:

- `app/a/[id]/opengraph-image.tsx` — automatic tag emission, but the image URL is framework-controlled, which fights the cache-busting scheme below.
- **Recommended:** explicit route `app/api/og/[id]/route.tsx` returning an `ImageResponse`, referenced from `generateMetadata` with a version param: `/api/og/{id}?v={OG_DESIGN_VERSION}`.

Runtime: `nodejs` (satori runs fine on the Node runtime in 14.2), so the OG route uses the same guarded service-role read as the page. Missing/revoked id → a generic Rekomendr brand card (200) or 404 — recommend the generic card, so a stale preview in someone's thread degrades gracefully rather than showing a broken image.

### 5.2 What's on the card (1200×630)

Translate the anchor's accent identity (`RekCard.tsx:116-118` — white interior, `#1E3A8A` 3px frame; brand navy `#2D5AB5`, dark chrome `#0b1725` from `app/layout.tsx`):

- Deep-navy field, white card with the navy frame — the snapped-anchor look.
- Item name, large (clamp to ~2 lines; names can run long — cap at the schema's 200 chars, ellipsize in render).
- Category label, small caps, brand blue.
- The first sentence of `short_description` (the axis-placement sentence — the profile's whole job in one line; two full sentences overflow at preview sizes).
- Footer: Rekomendr wordmark + `rekomendr.ai`.
- **No photo** (none exists, §1.6) and no user identity of any kind.
- Font: bundle one `.ttf` (e.g. Inter) read at module scope; system-font-only satori output looks off-brand.

### 5.3 Metadata tags (via `generateMetadata` on the landing page)

```
title:            "{item_name} — Rekomendr"
description:      short_description (first sentence, ~150 chars)
openGraph: { title, description, url: https://rekomendr.ai/a/{id},
             siteName: "Rekomendr", type: "website",
             images: [{ url: /api/og/{id}?v=N, width: 1200, height: 630 }] }
twitter:  { card: "summary_large_image", title, description, images: [...] }
```

Prerequisite: add `metadataBase: new URL("https://rekomendr.ai")` to the root metadata (`app/layout.tsx:6-10` has none today) so relative image URLs resolve absolute — scrapers reject relative `og:image`.

### 5.4 Cache-busting for iMessage/WhatsApp

Both cache previews **per exact URL**, aggressively and opaquely, with no purge API. The scheme that makes this a non-problem:

1. **Snapshot *content* is immutable** (the mutations are visibility flips — `shared_at`, `revoked_at` — which don't change what renders; the one exception would be Q5(b)'s background long-completion, which is why the OG card should render from `short` only). For a given id the correct preview never changes — cached forever is cached correctly.
2. **Design iterations** are the real cache risk (tweaking the card during S3 QA re-tests the same test URL). The `?v=N` param on the og:image URL is bumped via one constant (`OG_DESIGN_VERSION`) — every landing page immediately references a fresh image URL that caches miss. The *page* URL staying cached is fine; scrapers re-fetch the page HTML far more readily than images, and each new share mints a fresh page URL anyway.
3. **Revocation** cannot recall previews already unfurled in existing threads — that image is on Apple's/Meta's CDN and in the recipient's chat history. State this as a product fact: unshare stops the *page*, not previews already rendered. (§6, Q3.)
4. Set `Cache-Control: public, max-age=31536000, immutable` on the OG image response — correct for immutable content and keeps Vercel image invocations cheap.

---

## 6. Risks + open decisions for Brad

> **Q5 + Q8 DECIDED — Ledger #19 (2026-07-19):** `docs/s3-minting-integrity.md` — HMAC-stamped minting (b) + lazy server-side long completion (i) + publish-moment guards, APPROVED with amendments: token verification covers `handleChain` too (Catch 1), and the completion query health-excludes on token-verified category — the wall's fifth twin (Catch 2). Rate/moderation calls decided in that doc. Build plan: `docs/s3-build-plan.md`.

**Q1 — Does a share expose the sharer's identity?**
Proposed: no. The page and OG card render nothing but the snapshot content; `client_id` stays server-side (stored only for provenance/revocation). There is no display name anywhere in the system (auth is bare email magic-link), so "Shared by X" isn't even buildable today. Confirm: fully anonymous shares, no attribution, no "shared by" line?

**Q2 — Snapshot at share-tap or save-tap? DECIDED 2026-07-19: save-tap, privately; Share flips a visibility bit.** (Decision Ledger #18)
Brad: *"No other saved list opens back up and tells you the details of what you saved. It's the point."* `anchor_snapshots` is the S4 saved-items store; rows mint private (`shared_at NULL`) at save-tap and only an explicit Share makes one publicly resolvable. §3.2, §3.3, §3.5, and §4.1 reflect this. Follow-on consequences: the long-tier sub-decision moved into Q5, and Q8's abuse analysis is re-scoped below.

**Q3 — Can a snapshot be unshared?**
Schema ships `revoked_at` (cheap now, painful to retrofit). But: no UI surface exists until S4's history/saved panel, and revocation cannot recall previews already unfurled in recipients' threads (§5.4.3). Ship the column now and defer the UI? Or is "shares are forever" acceptable for v1 and revocation drops entirely?

**Q4 — Landing page scope: anchor only, or anchor + kept reks?**
S3 as stated renders the anchor. The trail (user's keeps) is arguably the more shareable artifact ("here's what I found") but multiplies snapshot size, staleness questions, and the health-gating surface (each rek carries its own category). Proposed: anchor-only for S3; a `snapshot_reks` extension is additive later. Confirm.

**Q5 — Long tier: background completion, or what's-loaded-only? (the open sub-decision under decided Q2)**
Save-tap minting makes short-only rows the common case (most saves happen without expanding details). Options: (a) **what's-on-screen only** — `long_description` stays NULL forever if unexpanded; saved list and landing page render short-only; zero extra generation. (b) **Background completion** — after the save-tap mint, fire the existing `anchorDetail` generation server-side (or client fire-and-forget) and UPDATE the row, so every saved/shared anchor eventually opens back up rich — which is arguably what "it's the point" implies for S4. Cost: one OpenAI call per anchor save, content the user never saw at save time, and the row becomes write-twice instead of write-once (a minor wrinkle for §5.4's immutability-based caching — the OG card should render from `short` only, or completion must land before first share). (c) Complete lazily at share-tap only. Needs a call before S4; the schema supports all three unchanged.

**Q6 — The photo.**
Sharers may expect their photo on the page ("look what I snapped"). Today the photo is transient by design (§1.6); persisting it means storage buckets, image moderation exposure (photos contain people, homes, shelves of other products), EXIF/location hygiene, and a size budget. Proposed: no photo in S3 — the snapshot is the *reading*, not the picture. Flag if you want photos, because it changes the schema, the OG card, and the privacy posture materially.

**Q7 — URL shape.**
`/a/{uuid}` (proposed: zero-dependency, unguessable) vs. a short slug (`/a/x7Kq2mVe...`, ~16-22 chars, needs minting code or a dependency). UUIDs are ugly in a text message but the share sheet hides them behind the OG preview in practice. Cheap to add a slug column later without breaking old links. Default: UUID now.

**Q8 — Abuse surface: RE-EXAMINE under decided Q2 (share no longer mints).**
The original analysis assumed share-tap minting: one endpoint that both created content and made it public. Save-tap minting splits the surface in two, and the mitigation should be re-derived for each half:
- **The mint route (save-tap)** now fires on a *frequent, low-ceremony* gesture — higher legitimate volume, so any per-client cap must be sized to real save behavior, not share behavior. But minted rows are **private**: a bot spamming synthetic saves creates invisible rows (storage noise), not public URLs. The client-supplied-content risk still enters here — a spoofed payload can store arbitrary text — but it stays unreachable until shared.
- **The share route (bit-flip)** creates no content; it can only publish a row that already exists for that `client_id`. The "arbitrary text on a public rekomendr.ai URL" attack now requires the same actor to mint *and* flip — same effort as before in an automated attack, so the public-content risk class is narrowed but not eliminated (mint-then-flip is two cheap calls).
Re-proposed v1 posture: length caps + `noindex` on `/a/*` (unchanged), per-client mint cap sized for saves, and a cheaper share-side guard (per-client daily flip cap). The heavy option (c) — only persist payloads matching a server-verified generation — remains the real fix if abuse materializes, and save-tap minting actually moves *toward* it: the mint moment is adjacent to the generation, so a server-side mint from generation output (instead of a client echo) is a smaller step than it was under share-tap minting. Worth noting as the eventual direction.

**Q9 — Snap-limit interaction.**
Share creation doesn't consume a snap and shouldn't count toward `SNAP_LIMIT` (`app/page.tsx:53-54`). Landing-page visitors clicking through to the app enter the normal cold-load flow. Any desire for share-attribution ("came from a share link") in analytics is a separate, deliberate addition — flag if wanted.

---

## Build order (when S3 opens)

1. SQL: `anchor_snapshots` (with `shared_at`) + RLS enable, zero policies (live, before any code depends on it).
2. Mint route (service-role, guarded import, tripwire, health 403, validation, inserts private, returns `{ id }`) + wire into the anchor save-tap; share route (flips `shared_at`, client_id-authorized).
3. Client: Share affordance on the anchor card (health-gated, save-then-flip gesture), per-snap id cache, `ShareButton` cascade parameterized.
4. `/a/[id]` page + not-found + `generateMetadata` + `metadataBase`.
5. `/api/og/[id]` ImageResponse route + `OG_DESIGN_VERSION`.
6. Verify: live share → phone → iMessage/WhatsApp preview render → revoked-id 404 → health-anchor share attempt refused at all three walls.

---

## Context: the opening story (WOW #6, 2026-07-19)

Live validation of Decision Ledger #18, from the field: Katrina used Rekomendr self-directed to pick wines for a wedding tasting with Evan and Grace (it turned into a party). The home run was a $15 bottle that tasted like $80 Caymus — the first *value-translation* wow (price-to-taste arbitrage, not just taste-match) and the first *group-witnessed* wow.

The punchline is the gap this doc closes: **Brad has to ask Katrina for the wine's name.** The product produced the discovery; the discovery has no persisted home. Under #18's save-tap snapshots, that bottle's name, category, and profile would already be a private `anchor_snapshots` row the moment it was saved — openable rich later (S4), shareable to the whole tasting group with one tap (S3). This anecdote is the S3/S4 opening story.

Copy bank: **"the $80 taste for $15."**
