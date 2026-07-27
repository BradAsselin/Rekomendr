# Title-Recycling Trace — read-only diagnosis

**Date:** 2026-07-24
**Field symptom (production, evening of 2026-07-23, post-ebacc99):** across several fresh
searches in one evening, the same canonical titles recycled — including already-liked
titles. *The Usual Suspects* and *The Girl with the Dragon Tattoo* were liked earlier in
the day (rows exist in `user_likes`, cards appeared in trail rows), then returned as
fresh frontier recommendations in later searches.

**Verdict up front:** the app has no liked-titles exclusion anywhere. Liked titles enter
the prompt as *positive steering only*, so after a memory wipe they are actually
*promoted*, not suppressed. The in-session seen-set is real but lives in module memory
and dies with the page load — and phone PWA lifecycle kills page loads constantly.
Comments in the UI layer claim an exclusion list that the engine never implemented.

---

## Layer 1 — Liked-titles exclusion (the sharp one)

### Where user_likes enters the prompt

**Persistence → fetch.** Likes are written per action to Supabase
(`src/lib/userPrefs.ts:34-40`, `recordLike`). Every fresh search re-fetches them through
the service-role route:

- `app/page.tsx:218` — `const prefs = await loadPrefsForCategory(nextCategory);`
- `app/page.tsx:224` — `const next = await getTop5FromEngine({ rawQuery: query, ...prefs });`

The route reads the newest 100 rows for (client_id, category)
(`app/api/prefs/route.ts:86-92`, `order created_at DESC, limit 100`) and buckets them
(`app/api/prefs/route.ts:102-108`): `like` / `save` / `more_like_this` → `likedTitles`,
`dislike` → `dislikedTitles`. So *The Usual Suspects*, liked earlier that day, is
guaranteed present in `likedTitles` on every later search that evening.

**Fetch → prompt.** All four AI generation paths funnel through one prompt builder,
`buildAIPrompt` (`src/engine/rekomendrEngine.ts:556`). Inside it, `likedTitles` lands in
exactly two places, both steering:

- Behavior rule, `rekomendrEngine.ts:635`:
  > `- If likes/dislikes are provided, use them to refine the taste lane only after the explicit text input has been satisfied.`
- Data line, `rekomendrEngine.ts:687-688`:
  > `Recent likes:` / `${likedTitles.length ? likedTitles.slice(-10).join(", ") : "(none)"}`

### The exclusion set — and what's not in it

The prompt's avoid list is built at `rekomendrEngine.ts:582-585`:

```ts
const avoidTitles = Array.from(
  new Set([...(currentTitles ?? []), ...(seenTitles ?? [])])
).filter(Boolean).slice(-100);
```

`currentTitles` = visible cards; `seenTitles` = the in-memory session seen-set.
**`likedTitles` and `dislikedTitles` are not in it.** The corresponding prompt lines
(`rekomendrEngine.ts:696-697`):

> `Avoid these already-used titles:` / `${avoidTitles.length ? avoidTitles.join(", ") : "(none)"}`

and the only repeat rule (`rekomendrEngine.ts:636`):

> `- Avoid repeating or returning titles already shown in this session.`

— "this session" only, backed only by session data.

The client-side hard filter has the same gap. `generateAIReks` builds its drop-set from
session titles only (`rekomendrEngine.ts:712-714`):

```ts
const seen = new Set<string>(
  Array.from(args.seenTitles ?? []).map((t) => t.toLowerCase())
);
```

and drops on `seen.has(titleKey)` at `rekomendrEngine.ts:793-796`. Liked titles never
join this set either. If the model re-generates a liked title, nothing downstream
removes it.

**The ranking layer doesn't save it.** `rankMovieCandidates` (fresh path only,
`rekomendrEngine.ts:878-883`) receives `likedTitles` in its signature
(`src/engine/movieProfileScorer.ts:17`) but **never reads it** — `scoreMovieCandidate`
uses `dislikedTitles` (−10 at `movieProfileScorer.ts:99-101`) and never touches
`session.likedTitles`. A re-generated liked title sails through ranking unpenalized. The
MLT and backfill paths don't rank at all (`rekomendrEngine.ts:1150-1152`, `1044-1045`),
so even the dislike −10 exists only on the fresh path.

### The stale comments — evidence the exclusion was *intended*

`src/components/ResultsV4.tsx:74-77`:

> `// Kept as full Reks so their titles still feed the engine's`
> `// liked-exclusion list even after their cards leave the view.`

`src/components/ResultsV4.tsx:166-169`:

> `// The marks persist in contenders/saved, so their titles keep feeding the engine's exclusion lists (unchanged).`

There is no liked-exclusion list in the engine. The UI dutifully maintains
`allLikedTitlesRef` (`ResultsV4.tsx:132-140` — persisted + saved + contenders) and passes
it to backfill (`ResultsV4.tsx:215`) and MLT (`ResultsV4.tsx:312`) — where it feeds the
"Recent likes" *steer* line, the opposite of exclusion.

### Why the symptom presents exactly as observed

Within one JS session, a liked title can't recycle — it was served, so it's in
`sessionSeen` (added at `rekomendrEngine.ts:887`), and the seen-filter drops it. But
after a page reload / PWA cold resume (module memory wiped — see Layer 2), the *only*
surviving record of *The Usual Suspects* is the `user_likes` row, which re-enters the
next search's prompt as a **"Recent likes" positive signal naming that exact title**,
with an empty avoid list. The prompt is affirmatively pointing the model at the titles
the field saw recycle. Famous canonical titles (exactly the class of *The Usual
Suspects* / *Dragon Tattoo*) are also the model's prior default absent avoid pressure
(Layer 3), so the two failure modes compound on the same titles.

**Side quirk worth noting:** the prefs route returns likes newest-first (DESC), and the
prompt line takes `slice(-10)` — the *tail*, i.e. the **oldest** ten of the fetched
window. For a user past ten likes, "Recent likes" is actually oldest-likes. (For
backfill/MLT the UI appends session marks last — `ResultsV4.tsx:135-139` — so those do
survive the slice; the fresh path passes the route's array as-is at `page.tsx:224`.)

### Smallest safe fix (not applied)

Single generation site — all four AI paths (fresh `rekomendrEngine.ts:868`, RC-2 top-up
`:812-817`, MLT `:1140`, backfill `:1032`) go through `generateAIReks` → `buildAIPrompt`.
Two touchpoints, one function pair, one file:

1. **`buildAIPrompt` (`:582-585`)** — fold `likedTitles` (full array, not the −10 slice)
   and `dislikedTitles` into the `avoidTitles` set. They should sit *ahead of* the
   `slice(-100)` decision deliberately (see cap note below).
2. **`generateAIReks` (`:712-714`)** — add lowercased `likedTitles`/`dislikedTitles` to
   the `seen` drop-set, so a model that repeats them anyway is filtered client-side.
   This is the hard guarantee; the prompt line is soft pressure. It also adds a `seen`
   drop counter tick (`drops.seen`), so the RC-4 tripwire keeps naming what filtered.

That covers every AI path with no per-path edits. **Not** covered (deliberately out of
scope for "smallest"): the two deterministic pool paths also lack liked exclusion — pool
selection `used` = sessionSeen only (`rekomendrEngine.ts:922-927`) and pool backfill
`used` = current + sessionSeen (`:1067-1069`). Play-mode re-serving a liked title
cross-session is a separate, milder product question; extending there means two more
sites.

**Avoid-cap interaction (the watch-bank item):** `avoidTitles` is capped at
`slice(-100)`, and the prefs route already caps likes at 100 rows. A heavy user's likes
alone can consume the whole prompt-side cap, evicting session-seen titles from the
*prompt* (the client-side hard filter is uncapped — the engine comment at `:580-582`
already relies on exactly that split). Ordering inside the concat decides who gets
evicted first under pressure; today `currentTitles` sit at the head and are truncated
first, which is already backwards (visible cards are the most important to avoid).
Whatever order the fix picks, the client-side filter must carry all three sets unsliced
— that's what makes the cap a distribution-pressure concern (Layer 3) rather than a
correctness hole.

---

## Layer 2 — Per-search seen-set scope

### The store

One module-level Map of Sets, per category (`rekomendrEngine.ts:70-79`):

```ts
const sessionSeenByCategory: Record<Category, Set<string>> = {
  Movies: new Set(), "TV Shows": new Set(), Books: new Set(), Wine: new Set(),
};
```

Keys are normalized trim+lowercase (`seenKey`, `:85-87`). Titles are added at serve
time: fresh top-5 (`:887`), pool fallback (`:965`), AI backfill winner (`:1047`), pool
backfill winner (`:1093`), and the full MLT batch (`:1151`).

### What resets when

| Event | sessionSeen | Receipts |
|---|---|---|
| **New search fires** | **Nothing resets.** Engine: `getTop5FromEngine` never clears (`:862` just reads the set). UI: the new-search sync effect resets *display* only — trail, migrating, entering, epoch (`ResultsV4.tsx:165-183`); `contenders`/`saved`/`sessionDislikedTitles` persist. `page.tsx handleSearch` (`:199-239`) touches no engine state. | accumulates across searches |
| **Category switch** | Nothing — each category owns its Set; switching back finds it intact. | `:70-79` |
| **Pool exhaustion** | `sessionSeen.clear()` at `:940` when the pool fallback can't fill five. **Edge:** this clears the *category's whole set*, which the AI lane shares — a Play session drained to exhaustion silently wipes the AI lane's never-repeat memory for that category too. | `:940` |
| **Page reload / PWA cold resume** | Everything. Module memory; no persistence of any kind — no localStorage, no server table. Same for `lastIntentByCategory` (`:89-94`). | module scope |
| **Cross-session** | Nothing persists *as seen-data*. The only cross-session record is `user_likes` — which feeds steering, not exclusion (Layer 1). | — |

### The plain answer

**Can search #3 re-serve search #1's cards? Within one page load: no, by design.**
Session-scoped never-repeat is real and correctly plumbed — every serve site adds to the
set, every generate site filters against it, normalization is shared. **Across page
loads: yes, entirely by design-absence** — there is no cross-session seen layer at all.
"Several fresh searches in one evening" recycling titles is the signature of the phone
PWA lifecycle recycling the JS heap between searches (the same PWA-resume behavior
already on file as typed-lane issue A). Each resume starts a virgin seen-set while
`user_likes` keeps steering toward the same liked titles.

---

## Layer 3 — Distribution head (characterization only, no fix)

Under the caps and exclusions as they exist, the total pressure toward non-obvious picks
is **three soft prompt sentences and nothing else**:

- `rekomendrEngine.ts:665` — `- prefer strong but less obvious titles over the most famous mainstream picks when possible.` ("when possible" is a model-sized escape hatch)
- `rekomendrEngine.ts:667` — `- avoid repeating the same very famous titles across different searches.` (the model has no cross-search memory; this instruction can only work if the avoid list carries the data — which it does only within a page load)
- `rekomendrEngine.ts:616` (Movies category guidance) — `Prefer discoverable, vibe-matching films over obvious catalog filler unless the context points there.`

**The scoring machinery that was built for this is dead.** `scoreMovieCandidate` has a
real hidden-gem engine — `isHiddenGem` +1.6 and a popularity penalty
(`movieProfileScorer.ts:80-89`) — but the live generation schema
(`rekomendrEngine.ts:641-651`) asks only for `title/year/short/long/genre/vibeTags/trailerUrl`.
No `tags`, `actors`, `lane`, `isHiddenGem`, or `popularity` ever come back, so against
real generated candidates the scorer reduces to approximately the dislike −10 and zeros.
The schema that *does* request those fields lives in `src/engine/buildMoviePrompt.ts`
(`:56-68`, with its own `Strongly favor hidden gems` rule at `:44`) — which is
**orphaned**: no file imports it.

Generation runs on `gpt-4o-mini` at temperature 0.85 fresh/MLT
(`app/api/openai/route.ts:27-32`) and 0.5 for backfill (`rekomendrEngine.ts:764`). A
small model's prior for "great crime movie" *is* the canonical head — *The Usual
Suspects* class — and two "prefer less obvious" sentences don't outweigh it. The Tom
Hanks deep-cuts night proved the lever that works: with the famous titles physically in
the avoid list, the same model went deep without complaint. **Avoid pressure moves the
distribution; preference wording doesn't.** That's also why the Layer 1 fix has a
Layer 3 side-effect: putting liked titles into the avoid list is exactly the pressure
class that produced the deep-cuts behavior.

### What to watch to know Layer 3 needs work (post-Layer-1-fix)

- **Canonical-head repeat rate on unmarked titles:** after liked titles are excluded, do
  fresh searches across different evenings still *open* with the same famous unmarked
  titles per lane? (Excluded-title recycling is Layer 1/2; same-opener-every-cold-start
  is pure Layer 3.)
- **Avoid-cap crowding:** the RC-4 `[short-sets]` logs plus a glance at prompt sizes as
  a user's like-count approaches 100 — when likes dominate the 100-slot prompt cap and
  session-seen falls off, does in-session variety degrade?
- **Deletion test on the three sentences:** the vibe-tone playbook applies — if removing
  `:665`/`:667` changes nothing observable, they're dead weight and the lever is
  elsewhere (avoid list, model, or a real popularity field).
- **The description-port session is the natural vehicle:** if the ported schema adds
  `popularity`/`isHiddenGem` back to the wire format, the dormant scorer machinery
  (`movieProfileScorer.ts:80-89`) revives for free, and the orphaned
  `buildMoviePrompt.ts` should be either merged or deleted in the same pass.

---

## Summary

| Layer | Root cause |
|---|---|
| 1 — Liked exclusion | `likedTitles` is steer-only: it enters the prompt as "Recent likes" (`:687-688`) and rule `:635`, never joins `avoidTitles` (`:582-585`) nor the client-side `seen` filter (`:712-714`); the scorer accepts it and ignores it. After a heap wipe, likes *promote* their own recycling. UI comments (`ResultsV4.tsx:74-77`, `:166-169`) document an exclusion that was never built. |
| 2 — Seen-set scope | Never-repeat is session-scoped module memory, correct within a page load, nonexistent across them; PWA lifecycle makes "one evening" span many page loads. Plus one edge: pool exhaustion clears the shared category set (`:940`). |
| 3 — Distribution head | Anti-obvious pressure is three soft sentences against gpt-4o-mini's canonical prior at temp 0.85; the hidden-gem scorer is dead because the live schema never emits the fields it scores; the proven lever is avoid-list pressure, not preference wording. |

**Smallest safe fix (Layer 1):** in `rekomendrEngine.ts` only — fold full
`likedTitles`+`dislikedTitles` into `avoidTitles` in `buildAIPrompt`, and into the
`seen` drop-set in `generateAIReks`. Single site covers fresh, top-up, MLT, and
backfill; pool paths deliberately untouched. Mind the 100-cap ordering (visible cards
currently truncate first) and keep the client-side filter unsliced.

**Design options (Layer 2, no recommendation):**
1. Persist `sessionSeenByCategory` to localStorage with a size cap and TTL — survives
   PWA resume, no server change; the staleness-guard work already queued for typed-lane
   issue A is the natural home.
2. Server-side served-ledger keyed by `client_id` (new table or a `served` action row) —
   true cross-device memory; write volume and grants rule (explicit GRANTs per the
   2026-10-30 enforcement) are the costs.
3. Accept Layer-1-only: liked/disliked titles never recycle (the sharp, trust-breaking
   case), unmarked cards may — cheapest, ships with the Layer 1 fix, defers the rest.
4. Fold into the S3 session-snapshot machinery when it lands — seen-state rides whatever
   session persistence S3 introduces, avoiding a second persistence mechanism.

No fixes applied. No code edited.
