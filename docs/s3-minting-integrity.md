# S3 Minting Integrity — Q5 + Q8 Resolved Together

**Status: APPROVED by Brad 2026-07-19 with amendments — Decision Ledger #19.** HMAC-stamped generation (option b) + lazy server-side long completion (option i) is the minting path. Amendments folded into this doc: **Catch 1** (token verification MUST cover `handleChain` — no side doors on the wall), **Catch 2** (the wall's FIFTH TWIN: the lazy-completion query excludes health categories via token-verified category), Calls 1+3 decided (client_id-only caps for v1 AND generous per-client caps on the OpenAI-burning routes in the S3 window — mint-flood is bounded by generation-rate, so generation must be bounded), Call 2 decided (moderation fails closed to private but NEVER silently). Original recon (read-only, 2026-07-19 against `main` @ `48317fa`) follows. Companion to `docs/s3-shareable-anchors-blueprint.md`; constraint locked by Decision Ledger #18: **snapshot mints at SAVE-TAP, privately, full rich profile; Share flips `shared_at` on the existing row.**

Q5 (long-tier completion) and Q8 (mint integrity) interact because the *same* trust question — "may this text be persisted under rekomendr.ai's name?" — must be answered twice: once for the short profile at save-tap, and once for a long tier that may not exist yet. They get one answer here.

---

## Part 1 — Save-tap data inventory

### 1.1 Snap anchor card (the S3 mint surface)

Tap: `RekSnapResults.tsx:1090` — `onSave={() => handleSave(result.detected_item.name)}` (no category argument; the fallback in `handleSave` IS the anchor's category).

In client state at that moment:

| Field | Source | Present? |
|---|---|---|
| `name`, `description` (short), `category` | `result.detected_item` — vision response, server-normalized (`SnapResult`, `RekSnapResults.tsx:29-33`; built at `app/api/reksnap/route.ts:1031-1045`) | always |
| `mode` | `result.mode` (server-validated inferred intent) and `activeMode` (`RekSnapResults.tsx:191`, a browsing pill flip) — blueprint §3.3 picks `result.mode` | always |
| long tier | `anchorLong` state (`RekSnapResults.tsx:125`) | **often absent — see 1.4** |
| chain context | `chainDepthRef`/`pursuedNamesRef`/`everShownRef` (`RekSnapResults.tsx:179-187`) | always (refs; not part of #18's snapshot scope) |
| photo | nowhere — transient (`app/page.tsx:166-172`) | never |

### 1.2 Other save surfaces (not the S3 mint surface, listed for completeness)

- **Snap frontier rek cards** — `RekSnapResults.tsx:1271` `onSave={() => handleSave(rek.name, rek.category)}`. State: `SnapRek { name, description, category?, rank }` (`RekSnapResults.tsx:19-27`). **The type has no long field — a rek's long tier never exists.** Mode: `activeMode`.
- **Snap trail rows** — `RekSnapResults.tsx:1181`. State: `TrailEntry { rek, mode }` (`RekSnapResults.tsx:39`) — origin mode preserved; same no-long shape.
- **Search-lane cards (frontier + trail)** — `ResultsV4.tsx:582` / `ResultsV4.tsx:526` → `handleSave` (`ResultsV4.tsx:432-441`). State: engine `Rek { id, title, year, short, long, genre, vibeTags, trailerUrl, tier }` (`rekomendrEngine.ts:31-42`). **Long is always present** — the generation delivers it, and `sanitizeGeneratedRek` floors it (`rekomendrEngine.ts:495`: `const safeLong = long || safeShort;`). Category is the UI label ("Movies") — the case-mismatch noted in the watch bank.
- **RecipeModal** — `RecipeModal.tsx:184-188` renders a Save `SignalButtons` variant; `handleSignal` (`RecipeModal.tsx:71-76`) writes `recordSnapSignal({ itemName: dish, itemCategory: "food", action })`. State at tap: the full `Recipe { title, intro, ingredients, steps, safety_note }` (`RecipeModal.tsx:11-17`) — rich content exists in memory but only the dish name is persisted. A future "saved recipes" wants its own snapshot design; out of S3 scope.

### 1.3 Which surfaces can save without a long tier

1. **Snap anchor, details never expanded** — the common case. `anchorLong` starts null and is fetched only inside `toggleAnchorDetails` (`RekSnapResults.tsx:938-952` → `fetchAnchorLong` `906-936`). No expand, no long.
2. **Snap anchor, health category** — structurally *never*: `expandable={!anchorIsHealthMedical}` (`RekSnapResults.tsx:1082`) means the affordance doesn't render, and the server twin 403s any attempt (`app/api/reksnap/route.ts:337-342`). A health anchor **cannot** have a long tier — but per the blueprint it also cannot mint at all, so this case exits the design.
3. **Snap anchor, fetch failed or in flight at tap** — failure leaves the cache null with free retry (`RekSnapResults.tsx:930-935`); a save during `anchorLoading` sees null.
4. **Every snap rek/trail save** — no long field exists (`SnapRek`).

Only the search lane always has a long. **The S3 mint surface (the anchor) is exactly the surface where the long is usually missing.** Q5 is not an edge case; it is the default case.

## Part 2 — Current save write path (what the mint rides beside)

Snap lane, end to end:

1. `handleSave` (`RekSnapResults.tsx:424-442`): first tap sets local mark + calls `recordSnapSignal(...action:"save")` + `migrateToTrail`; second tap un-marks **visual-only — no write, no delete**.
2. `recordSnapSignal` → the insert (`src/lib/reksnapSignals.ts:49-59`):

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

3. Table `reksnap_signals`, write-only from the browser (S2a), no id returned to the client.

(Search lane analog: `handleSave` → `recordLike` → `user_likes` insert, `src/lib/userPrefs.ts:32-38`.)

**Mint shape implied:** the mint is a *second, parallel call* from the anchor's `handleSave` path to the mint route — it must not replace `recordSnapSignal` (the taste signal is separate telemetry and stays fail-soft-independent), and a mint failure must not block or throw into the save gesture.

---

## Part 3 — Minting-integrity options (Q8)

Relevant current response shapes (receipts):

- Vision: `{ detected_item: {name, description, category}, mode, results }` — `app/api/reksnap/route.ts:1031-1045`; `category` normalized **server-side** from model output (`route.ts:962-967`). `clientId` already rides the vision request (`app/page.tsx:172`).
- Anchor detail: request is **client-asserted** `{name, category, shortDescription}` (`route.ts:318-333`); response `{ long }` (`route.ts:374`).
- Search `/api/openai`: returns raw `text/plain` model output, no JSON envelope (`app/api/openai/route.ts:51-54`) — irrelevant to anchor minting but rules out trivially extending option (b) to the search lane later without an envelope change.

### (a) Client-payload minting + sanitation + rate limits

Save-tap POSTs `{name, category, short, long?, mode, clientId}`; server validates lengths/shape, health-gates, inserts.

- **Named honestly: content is client-asserted.** Anyone with the endpoint URL can mint arbitrary text (length-capped) into a row that one more call makes publicly resolvable at `rekomendr.ai/a/{id}`. Sanitation bounds *format*, never *content*.
- **Health wall: FAILS.** The gate would key off a client-asserted category — a health anchor minted under `category: "products"` sails through and becomes shareable. Per Part 5 this is a blocking finding, and it is not patchable within (a): the server has no independent knowledge of what the item is.
- Never-regenerate: complies (renders stored text). DoS/cost: no generation cost; cheapest. Fail-soft: trivial. Complexity: lowest. Lazy long: client sends what it has.

### (b) Server-stamped generation (HMAC token) — RECOMMENDED

Every anchor-bearing generation response carries a compact integrity token; save-tap sends payload + token; the mint route verifies the signature. Stateless, no DB at generation time, no regeneration ever.

**Token construction** (Node `crypto`, no new dependency): `HMAC-SHA256(MINT_SIGNING_SECRET, name | category | sha256(short) | sha256(long ?? "") | clientId | issued_at)`, shipped as `{ sig, issued_at }` base64url. Binding `clientId` is free — it already rides the vision request (`page.tsx:172`).

**Where it rides in each current shape:**
- Vision response: one additive sibling field on the payload, e.g. `detected_item_token` next to `detected_item` (`route.ts:1031-1045`). Old clients ignore unknown fields; nothing breaks.
- Anchor-detail: the request gains the vision token; the route **verifies it before generating** (which also closes the pre-existing gap where `handleAnchorDetail`'s health 403 trusts a client-asserted category, `route.ts:318-342`), then returns `{ long, token }` with the token extended over the long-hash. Chain of custody: every field the mint accepts was attested by a server at the moment a server produced it.
- **Chain (CATCH 1 — required, per #19): `handleChain` verifies the anchor token the same way, before generating.** Its health gates currently trust client-asserted categories on both the anchor and the chained direction (`route.ts:694-717`) — the same spoofable pattern as anchorDetail, and chains generate five cards at a time. The retrofit rule is: **every text-only generation path that accepts a detected-item payload verifies its token first.** anchorDetail, chain (steer + reroll), and backfill all qualify; backfill rides along for free once the helper exists. No side doors on the wall.
- Mint route: recompute HMAC over the exact submitted payload; mismatch → decline (200-with-`ok:false` style, merge-route convention), the save signal is unaffected, log the reject.

**Expiry:** `issued_at` checked against a window. Recommend **48h** — generous for resumed-PWA sessions (see `docs/typed-lane-trace.md`), tight enough that leaked tokens age out. Expired → decline mint; the save signal still writes; harmless.

**Replay:** re-submitting a valid token re-mints byte-identical, server-generated content, bound to the same `clientId`. Cross-client replay fails (clientId is in the MAC). Same-client replay produces duplicate identical private rows — bounded by the Part 6 mint cap and the client's per-snap id cache (blueprint §3.3). **Harmless by construction; no nonce store needed.**

**Pre-feature anchors:** sessions in flight when this deploys hold tokenless results → their saves mint nothing (signal-only). Self-heals within a session's lifetime; at current scale, accept. (A time-boxed grace flag is possible but adds a bypass — don't.)

- **Health wall: HOLDS.** `category` inside the MAC is the server's own vision-normalized label (`route.ts:962-967`); spoofing it breaks the signature. Mint gate, share-flip re-check, and landing-page 404 all key off server-attested data.
- Never-regenerate: strengthened — minted content is *hash-provably* the generated content. DoS/cost: one HMAC per generation/verification, negligible. Fail-soft: missing `MINT_SIGNING_SECRET` → minting disabled, saves never 500 (guarded-env pattern, same as `supabaseServer`). Complexity: moderate — touches the vision response, the anchorDetail request/response, and the mint route; ~1 day. Lazy long: short-only token at save; extended token if long was loaded; Q5's completion needs no token at all (§Part 4).

### (c) Server-side snapshot-candidates at generation time

Vision handler persists a candidate row per snap (anchorDetail UPDATEs the long); the response carries the row id; save-tap flips a `saved` flag.

- Integrity: strongest — content never leaves server custody. Health wall holds.
- **Row volume/cost:** one row per *snap*, saved or not. At current scale (client-side cap of 5/session, `page.tsx:53-63`) this is trivial in storage — but the row write couples the generation path to the DB (or goes fire-and-forget with its own failure mode: generation succeeded, candidate lost, save can't mint), and *unsaved* candidates are a new retention/privacy surface: a server-side log of everything every user photographed and rejected, needing a TTL cleanup job the stack doesn't currently have anywhere to run.
- Never-regenerate: perfect. DoS: vision calls already cost OpenAI money — the marginal insert is noise, but the candidate table gives bots a free write primitive via an endpoint that must stay unauthenticated. Fail-soft: more states to get right (candidate missing at save). Complexity: highest — id plumbing through `SnapResult`, generation-path writes, cleanup, and a second write path for the long.

### Decision matrix

| Criterion | (a) client-payload | (b) HMAC token | (c) server candidates |
|---|---|---|---|
| Health hard wall | **FAILS (blocking)** | holds (signed category) | holds (server rows) |
| Arbitrary-text minting | possible, length-capped | closed (sig required) | closed |
| Never-regenerate fidelity | trusts client | hash-provable | perfect |
| DoS / cost | none added | ~zero (HMAC) | +row/snap, TTL job, retention surface |
| Fail-soft | trivial | env-guarded, decline-quietly | more failure states |
| Complexity | lowest | moderate (~1 day) | highest (several days) |
| Lazy long fit | client sends what it has | short/extended tokens; completion server-side | UPDATE on detail call |
| Pre-feature sessions | unaffected | signal-only until session refresh | unaffected (rows start at deploy) |

**Recommendation: (b).** (a) is disqualified by the health wall alone. (c) buys marginal integrity over (b) at the price of a retention surface, a cleanup job, and generation-path coupling — none of which S3 needs. (b) closes the two real threats (arbitrary text on the domain, category spoofing past the health gate) statelessly, incidentally fixes the existing client-asserted-category gap in `handleAnchorDetail`, and its custody chain extends naturally if minting ever comes to the search lane (after an `/api/openai` envelope change) or to (c) later.

---

## Part 4 — Q5 resolved, conditional on (b)

The anchor's long tier is usually absent at save-tap (Part 1.3). Options:

- **(i) Mint short-only; complete the long lazily, server-side, from the trusted row — RECOMMENDED (decided, #19).** When the saved anchor is first *reopened* (S4 list) or *shared* (flip route), fire-and-forget a server-side long-tier generation using the **snapshot row's own fields** as input — the row is token-verified at mint, so this needs no client trust and no token: the server is generating from data it already attested. Idempotent write: `UPDATE anchor_snapshots SET long_description = $1 WHERE id = $2 AND long_description IS NULL`.
  **CATCH 2 — THE WALL'S FIFTH TWIN (named guard, per #19): the completion path MUST exclude health categories, checked against the row's token-verified `item_category` (never a client-asserted value) at completion time.** Without it, the server itself generates rich health profiles unprompted — the exact output every other twin exists to prevent. The guard matters even though the mint 403s health rows, because the health word-list GROWS (`categoryGates.ts:12-13` — "Add words as real leakers are observed"): a category added to the list *after* a row minted makes that row health-classified retroactively, and completion must re-check the CURRENT list before generating. Implementation: `if (HEALTH_MEDICAL_CATEGORIES.has(row.item_category)) skip` inside the completion helper, plus `AND long_description IS NULL` in the WHERE — same prominence as the other four twins; the S3 verify checklist tests it explicitly. This satisfies #18's "opens back up and tells you the details": the reopen that *asks* for details is the event that completes them (first reopen shows short + the existing pulse treatment, then rich; every later reopen is rich). Cost scales with anchors people actually return to or share — strictly cheaper than per-save.
  Failure modes, named: completion API failure → row stays short-only, retried free on next reopen/flip (the `anchorLong` retry philosophy, `RekSnapResults.tsx:903-905`); shared-before-completed → public page renders short-only until the flip-triggered completion lands (OG card renders from `short` regardless, blueprint §5.2/§5.4 — no cache poisoning); race between reopen and flip → the `WHERE ... IS NULL` guard makes the second write a no-op; health anchors → unreachable (never minted).
- **(ii) Background generation on every save.** Rich-on-return is instant, but it pays one gpt-4o call per anchor save including the majority never reopened, puts generation on the hottest write path, and — the Q5/Q8 interaction — if done client-initiated it needs its own token dance, while server-initiated it is identical to (i) but fired earlier for no user-visible gain. Rejected on cost-for-nothing.
- **(iii) Mint immediately, gate Share until complete.** Puts a synchronous generation wait inside the share gesture — the exact moment WOW #6 says must be instant (sharing the bottle at the tasting). Rejected on product grounds.

**Never-regenerate stays intact under (i):** the public render path (landing + OG) still reads columns only. Completion is an *owner-action-triggered, server-custody, write-once* generation — the rule the blueprint actually needs ("no generation on the public path; content never regenerated once written") is preserved; the blueprint's Q5 text already anticipated exactly this shape.

---

## Part 5 — Public-URL abuse surface (under option b)

**What hostile content can reach `/a/{id}` and the OG image at all:** only text a server generated and signed. The residual channels are (1) **prompt injection via the photographed scene** — text in the photo steering gpt-4o's `detected_item` fields; (2) rude/wrong model output on its own; (3) hostile strings physically on a product label. All three arrive server-signed — signing proves *custody*, not *civility*.

- **XSS:** zero `dangerouslySetInnerHTML` anywhere in the repo (grep, 2026-07-19: no matches). The landing page will be a server component rendering snapshot fields as JSX text nodes — React-escaped end to end. **Standing rule for the build: snapshot text is only ever rendered as text children; no raw-HTML or markdown rendering of stored content, ever.** Effort: free (default behavior); the risk is a future convenience slipping markdown in.
- **OG `ImageResponse` text injection:** satori renders text nodes — no HTML/markup parsing, so no injection class. Remaining games are Unicode: bidi-override/zero-width characters distorting the card, and length overflow. Mitigation: schema length caps (already in blueprint §3.2) + strip control/bidi characters (`‪-‮`, `⁦-⁩`, C0) at mint + line-clamp in the card layout. Effort: ~1 hour.
- **Abusive/profane content under the domain:** nothing mitigates this today. Minimum viable: **moderation check at share-flip** (OpenAI `omni-moderation-latest`, free tier) over `name + short + long` — flag → the flip declines and the row stays private (fail-closed on the *publish* moment only; private saves are never blocked, so the save gesture stays instant and a moderation outage degrades to "sharing temporarily unavailable", not data loss). Plus `noindex` on `/a/*` (blueprint Q8) and the length caps. Effort: ~half-day. A user-facing report path can wait (footer mailto is fine for v1).
- **HEALTH-GATE BYPASS — the hard wall, traced:**
  - Today's text-only gates trust the client: `handleAnchorDetail` 403s on `anchorDetail.category` (`route.ts:320-324`, `337-342`) and `handleChain` on `item.category` (`route.ts:694-701`) — **both client-asserted**. Existing finding (pre-S3, severity low today): a spoofed category can coax a rich text profile for a health item out of the anchorDetail path; the vision prompt's thin-profile rule is the only backstop. No public surface exists yet, so today this leaks text to the requester only.
  - Under (a), that same trust pattern would let a health anchor mint and go public: **blocking** — this is what disqualifies (a).
  - Under (b): the category in the mint payload is MAC-bound to the **server's own** vision-normalized label (`route.ts:962-967`); altering it breaks the signature. The wall then has **five** server-attested twins: (1) no Share affordance client-side, (2) mint-route 403 on signed category, (3) flip-route re-check, (4) landing-page 404, (5) **lazy-completion health exclusion on the row's verified category (Catch 2)**. **No spoof path remains through the mint, and no generation path exists for a health row that slips in.**
  - Residual, honestly: the wall is only as good as the *word list* — membership is exact-match (`src/lib/categoryGates.ts:10-13`) and the model can emit an unlisted health-adjacent label, which passes every twin. Same accepted risk as every existing gate, same remedy (grow the list as leakers appear), now backstopped by moderation-at-flip. Not a bypass — a coverage limit; flag it in the S3 verify checklist (snap a pharmacy item, confirm the label lands in the list or the gate).

## Part 6 — Rate-limit posture

**Today: no server-side rate limiting exists anywhere.** Receipts: no `middleware.ts` in the repo (glob — only node_modules templates); no limiter dependency (`package.json:11-25`); grep for `rate|429|limiter` across `app/` matches only prose in prompts. The only limits in the product are client-side and trivially bypassed: the snap cap in sessionStorage (`app/page.tsx:53-63`, prod-only) and the softWall daily counters in localStorage (`src/lib/softWall.ts:42-56`). Adjacent finding: the OpenAI-burning routes (`/api/reksnap` vision, `/api/openai`, `/api/recipe`) are all unauthenticated and unlimited — S3 doesn't worsen this, but it is the *actual* cost exposure today.

Minimum viable for S3 on the current Vercel + Supabase stack, no new dependencies:

- **Mint route:** before insert, one indexed count — `anchor_snapshots WHERE client_id = $1 AND created_at > now() - interval '24 hours'` — cap ~30/day (sized for saves, per blueprint Q8). Over cap → decline quietly (`ok:false`), signal write unaffected. Needs the `(client_id, created_at)` index anyway for S4.
- **Share-flip route:** same-table count of `shared_at`-in-last-24h per client, cap ~20/day, plus the moderation check (Part 5).
- **Honest limitation, named:** counters keyed on `client_id` don't stop an attacker who mints fresh ids per request. True per-IP limiting on this stack means either a small hashed-IP counter table in Supabase (~50 lines, `x-forwarded-for`, daily TTL via the query window — shared-IP false-positive risk) or adopting Vercel WAF / Upstash (new dependency or spend — Brad call). For v1, client_id caps + moderation-at-flip + `noindex` bound the *damage* (spam rows are private and unpublishable at scale) even where they can't bound the *requests*.
- **Landing + OG routes:** read-only single-row lookups; `Cache-Control: public, max-age=31536000, immutable` on the OG image (blueprint §5.4) and Vercel's edge cache absorb crawler load; `noindex` keeps them out of indexes; volumetric DDoS is Vercel-platform territory, not app code. No app-level limiter needed for v1.

---

## The recommended integrated path (Q8 + Q5, one answer)

1. **Q8 = option (b):** HMAC-stamped generation. Vision response carries a token binding `name|category|short-hash|long-hash|clientId|issued_at` (48h window); anchorDetail verifies-then-extends it; the mint route verifies before insert. Category becomes server-attested end to end — the health wall holds structurally.
2. **Q5 = option (i):** mint short-only when the long is absent (the default case); complete the long **server-side from the trusted row**, fire-and-forget, on first S4 reopen and on share-flip, idempotent `WHERE long_description IS NULL`. Rich-on-return per #18; the public path still never generates.
3. **Publish-moment guards:** moderation-at-flip (fail-closed to private), control/bidi-char strip at mint, length caps, `noindex` on `/a/*`, per-client mint/flip caps via indexed counts on `anchor_snapshots`.
4. **Ride-along fix:** anchorDetail's existing client-asserted-category gap closes for free when it starts verifying tokens.

Estimated build cost over the blueprint's baseline: roughly two extra days (token plumbing ~1, moderation + strip + caps ~1). Everything is fail-soft: any integrity component missing (secret unset, moderation down) degrades to "minting/sharing quietly unavailable," never to a broken save.

## Brad calls — ALL DECIDED 2026-07-19 (#19)

1. **Per-IP rate limiting → client_id-only caps for v1.** No per-IP infrastructure, no new dependency. DECIDED TOGETHER WITH:
3. **The OpenAI-burning routes get generous per-client rate caps IN the S3 window** (S3.6 in the build plan). Rationale as decided: mint-flood is bounded by generation-rate, so generation must be bounded — capping the mint without capping the generators leaves the expensive half open. Caps sized so no real user ever sees them.
2. **Moderation fails closed to private but NEVER silently.** Soft client notice — *"couldn't share this one — it's still saved"* — plus a server log line naming every block (the fail-soft tripwire rule: fail-soft is permitted only when a tripwire logs the failure).

With these, the whole path is decided: option (b) + Q5(i) + the guard set + Catch 1 (chain coverage) + Catch 2 (fifth twin). Implementation plan: `docs/s3-build-plan.md`. One SQL note recorded with #19: the `anchor_snapshots` migration must explicitly `REVOKE ALL ... FROM anon, authenticated` — it ships before the 2026-10-30 Supabase Data-API-grants enforcement, so it would otherwise inherit auto-grants that contradict its zero-policy service-role-only design (grants ≠ policies; belt and suspenders).
