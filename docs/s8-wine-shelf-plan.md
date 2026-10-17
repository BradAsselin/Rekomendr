# S8 — The wine shelf (plan)

Written 2026-10-16, before any code, from Brad and Katrina's field findings
(red and white wine shelf snaps on production). Autonomous run in local agent
mode (charter §11). Brad's instruction for this run: "make the reasonable call
on anything ambiguous, log each call in the session log, and keep going. Merge
to main when green; never release/v2 or production."

The goal sentence this serves (charter §1):

> Standing at a shelf of bottles I've never heard of → I know which one is for
> me, described in terms of a wine I already love, before the person next to
> me finishes reading one label.

## Split

| Session | Branch | Scope |
|---|---|---|
| **S8a** quick fixes | `auto/s8a-wine-quick-fixes` | pairing-sentence deletion (+ test), bottle image search on titles, wine anchor verbs, shelf hints, dense-shelf diagnosis + fix, category reset |
| **S8b** shelf engine | `auto/s8b-wine-shelf` | shelf read (tags, talkers, staff picks), price targeting + chips + price on cards, per-visit no-repeats, shelf-first reks and replacements, never-return dislikes, taste bars, starred favorite + comparisons |
| **S8c** the haul | `auto/s8c-checkout-haul` | checkout snap: detect, confirm list, Bought list, next-open follow-up, rek→purchase link, conversions in `/api/stats`, haul share |

Each is its own PR into `main`, merged when green (§10.3, Brad's chat
instruction for this run), in order. S8b and S8c share one migration
(`wine_marks`), executed under §11.2 with a `pg_dump` first.

## Voice (§2.3, §10.4)

Brad authorized one voice decision in chat: **delete the pairing sentence**
("Built for X, not Y") from wine anchor descriptions, keep the rest as is.
Everything else here leaves the locked voice blocks untouched:

- The anchor's text still comes from the unchanged vision prompt; for wine the
  server deletes the pairing sentence after generation (deterministic, so the
  test can hold it at zero; a prompt "ban" is also a mention, per the prompt
  tuning law).
- New wine generation reuses `DIFFERENTIATOR_VOICE` verbatim for rek
  descriptions. The new text is task framing (read the shelf, price band,
  shelf-first, exclusions) and data fields (price, taste position, the
  "vs. your <favorite>" line whose format Brad specified).
- §10.4 says prompt-touching PRs never self-merge. Brad's chat instruction for
  this run ("Merge to main when green") is read as overriding that for S8
  (charter §0: Brad's notes win). Logged as a call.

## Mechanism

### S8a

1. **Pairing sentence** — `stripPairingSentence()` in `src/lib/wineShelf.ts`,
   applied in `/api/reksnap` to wine anchors (snap and typed) *before* the
   token signs the short, so save/share/detail all attest the stripped text.
   A sentence is dropped when it matches the "Built for X, not Y" mold or its
   pairing variants (made/meant/designed for…, pairs with…, "X, not Y" ending
   on a dinner/food). Sentence 1 (dry↔sweet placement + notes) is never
   touched. Test: `scripts/validate-s8a.cjs` runs the field strings plus
   generated variants and fails if the mold survives.
2. **See the bottle** — wine titles (anchor and reks, frontier and trail) link
   to a Google Images search for `"<name> bottle"` in a new tab. Same
   `titleHref` slot the media titles use (Aug decision: title = info page).
3. **Wine anchor verbs** — "View recipe" leaves wine anchors. MIDDLE becomes
   "See the bottle" (same image search); expanded, "Where to buy" (Google
   search for the exact bottle) when the wine didn't come from a shelf; on a
   shelf snap the shelf price shows instead (S8b fills it). Food keeps View
   recipe; the "Use it for" pairing cards on a wine snap keep their recipe
   push-through (those *are* food).
4. **Shelf hints** — one line on the home screen under the snap button and
   under the snap loading state: "Tip: snap one or two shelves to compare
   bottles". After a single-bottle wine snap, one quiet line: "Next time, try
   the whole shelf — I'll compare the bottles for you." Each dismissible (×),
   each shown at most 3 times (localStorage counters). Precedent: Google
   Lens/Vivino first-run tips are one line, dismissible, capped.
5. **Dense shelves** — diagnosis first:
   - Upload today: longest edge 1280px, JPEG 0.85. OpenAI's high-detail
     pipeline fits to 2048 and then scales the *short* side to 768 — a
     three-shelf portrait photo of ~40 bottles reaches the model at about
     768×1024, ~19px per label. That is the likely cause; logs will confirm.
   - Log the vision model's raw failure: `[snap-read-fail]` with
     `finish_reason`, output length, the first 300 chars, refusal text.
   - Fix order: (a) upload at 2048 long edge, `detail: "high"` explicit;
     (b) on a failed read, the client splits the original photo into
     overlapping horizontal strips (one per shelf, 3 strips) and the server
     reads them in one call; (c) if that fails too: "That's a lot of bottles.
     Try one or two shelves."
   - Category reset: the snap never touches the bar's category, and the
     page's own `category` defaults to Movies. After a wine snap the bar
     follows the snap (Wine); a failed snap leaves the bar alone.

### S8b

- **Shelf read** — a dedicated vision call (wine only, `detail: "high"`):
  scene (single / shelf / haul), each readable bottle with its tag price
  (`$17.99`, only if read), any shelf talker ("Wine Enthusiast 90") or
  staff-pick sign attached to the bottle it sits on. Starts at request time
  when the bar is on Wine, otherwise the moment the streamed anchor says wine
  (the media path's pattern). Never invents scores: talker text is only ever
  read off the photo and only attached to a bottle on that shelf; off-shelf
  reks carry no score field at all.
- **Wine reks** — one text-only generator (`/api/reksnap` `wine` branch) used
  by the first set, price chips, thumbs-down replacement, More like this and
  the anchor re-roll. Input: the anchor, the shelf list, the price band, the
  visit's already-shown and rejected names, the favorite. Output: 8
  candidates (over-ask) with price and taste positions.
- **Guarantees at the response site (two-tier canon §2.12)** — uncapped
  drop-set: anchor, everything shown this visit, rejected this visit, and
  every wine this client ever thumbed down (Decoy never returns); price band
  enforced with a small tolerance; on-shelf is decided by matching names
  against the shelf read, never by the model's say-so; shelf bottles rank
  first; off-shelf on a shelf snap is labeled "not on this shelf".
- **Price** — anchor price = its tag if read, else the model's typical retail
  ("about $X"). Default band ±35% (a $23 bottle → $15–31). Chips: Under $20 ·
  $20–35 · $35–60 · Splurge ($60+); one tap re-runs, tap again clears; same
  bubble as the mood chips. Each wine card shows "$17.99 on this shelf" or
  "about $22".
- **Per-visit no-repeats** — the visit's shown/rejected lists live in
  `sessionStorage` (a visit = the browser session; the home reset keeps them,
  a new visit starts clean) and ride every wine call.
- **Taste bars** — two slim 5-step bars, Dry↔Sweet and Light↔Bold, labeled
  "approx." Our own design: a track with a filled dot; the favorite shows as
  a hollow ring on the same track. Shown on wine cards only.
- **Starred favorite (go-to)** — a star on wine cards, separate from Save.
  Stored per anon id in `wine_marks` (service-role route `/api/wine`, mirror
  in localStorage for instant UI). With a favorite, each rek leads with
  "vs. your Bonanza: drier, less vanilla, similar body"; if the favorite is on
  the shelf: "Your Bonanza is here, $16.99".

### S8c

- **Detect** — the shelf read's scene `haul` (bottles in a cart, basket, bag,
  checkout belt). Also "I bought these" under a multi-bottle snap (2–8
  bottles read).
- **Confirm** — "You bought: … Correct?" Each bottle: × to remove, tap to
  correct the name. Confirm saves.
- **Bought** — `wine_marks` rows (kind `bought`, date). A "Bought" list on the
  home screen. Bought is the strongest signal: it also writes a `save` signal
  so existing shading sees it.
- **Follow-up** — on the next open ≥ 24h later, one quiet card: "How was the
  Cannonball? 👍 / 👎 / ⭐ new go-to · Skip". One bottle per open, never a
  form, never asked twice (answer stored on the row). 👍/👎 write the like or
  dislike signal; ⭐ sets the favorite.
- **Rek → purchase** — a bought name that matches a rek shown this visit
  stores that rek and its anchor; `/api/stats` gains bottles bought, hauls,
  snap-to-cart conversions.
- **Share** — "Our haul today" mints an ordinary card (signed by the server,
  same Share row and `/a/<id>` page, same moderation on share).

## Races considered

- Wine shelf read runs beside the streamed generic read; whichever fails, the
  other's result still ships (anchor from the generic read always). A wine
  generator failure ships the generic Similar list with a `[wine]` tripwire —
  never silent.
- Every new client fetch uses the existing `resultRef` + per-mode epoch guards
  (async lifespan rule): price-chip re-runs bump the epoch like a re-roll.
- The strip retry only fires on a failed read, so no double reads on success.

## Blast radius

`/api/reksnap` (wine branches only; media, health, other categories
byte-identical), `RekSnapResults.tsx` (wine-gated rendering), `RekCard.tsx`
(three optional props), `app/page.tsx` (upload size, hints, strip retry,
visit state, follow-up), new `src/lib/wineShelf.ts`, `src/components/Wine*`,
`/api/wine`, `/api/stats`, `docs/sql/s8-wine-marks.sql`.

## Deliberately out of scope

Push notifications; account-merge of `wine_marks` (anon id only — logged);
the search lane's typed wine moods (S8 is the snap lane); any change to the
locked voice blocks beyond the authorized deletion; a stronger vision model
(invariant §2.10 — the dense-shelf result is noted for the model pilot).
