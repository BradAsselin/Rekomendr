# S15 — Barry's streaming-screen snap — plan

Brad's brief (2026-10-23): snap a streaming app's row or Top 10 → the visible titles (up to 5) as cards. Each card has:
- TMDb synopsis;
- commitment (runtime, or seasons · episodes);
- where to watch ("on Netflix", the service in the photo);
- the "vs. your [go-to]" lead when a go-to exists.

The cards are ranked against the nearest go-to, best match on top. Use the S14 Claude vision path and the TMDb title guard: never invent a title.

Approved new wording: "From your screen", "Start with this one". Nothing else new.

**Acceptance:** a Netflix home-row photo gives the correct titles with no inventions, and the ranking changes when Steer by switches.

## Mechanism

**1. Read** (`src/lib/screenSnap.ts`, `readScreen`)
- One call on the `vision` step (Sonnet 5.5), with a structured-output schema.
- It returns `{ is_screen, service, titles[] }`: only names legible on the tiles, in reading order, at most 8.
- The prompt is extraction plumbing (like the S13c mood parser): it writes no text a person reads.

**2. Guard** (`resolveScreen`)
- Each title goes through `resolveSnappedTitle`: exact TMDb match, or TMDb's top hit by containment.
- Anything that doesn't resolve is dropped and logged. Duplicates collapse. The first 5 survive.
- Cards carry TMDb's title, never the model's.
- Fewer than 2 real titles → `screen: null`, and the normal snap answers.

**3. Rank** (`rankScreen`)
- Closeness to a go-to scores:
  - TMDb's neighbour link, either direction: +3 each;
  - shared genres: 2 × Jaccard;
  - same kind: +0.5;
  - weighted rating as a tiebreak.
- The nearest go-to is the one with the highest total over the screen's titles. Steer by picks another.
- With no go-to, cards are ranked by TMDb's vote-weighted rating.
- The ranking is deterministic and explainable, and nothing pays to move it (§0.2).

**4. Lines**
- `linesVsGoTo`, the S12 writer, with its prompt verbatim, writes one line per card against the steering go-to.
- A cap refusal or a failure ships TMDb synopses, with a named log line.

**5. Route** `/api/screen`
- A photo, or `{ titles, service, steer }` for a Steer by re-rank (no new read).
- Caps: the photo counts against `reksnap-vision`; the lines count against `reksnap-text`.

**6. Page**
- On the Movies/TV bar, the screen read runs beside the normal `/api/reksnap` snap.
- A screen answer aborts the snap and shows in the search lane, with:
  - "From your screen" above the Steer by row (movie and TV go-tos both);
  - "Start with this one" on the top card (the marker line);
  - commitment and "on Netflix" on the descriptor line.
- Steer by re-ranks the same titles.
- A thumbs-down removes the card with no replacement (honest-short: only what was on the screen).
- A new search, snap or home clears screen mode.

## Races
- Stale-snap guard: `snapIdRef` checked after the screen read.
- `searchIdRef` bumped on show, so an in-flight search can't land over it.
- The Steer by re-rank is guarded by `searchIdRef`.
- The aborted snap's rejection is swallowed.

## Blast radius
- Wine, Books and other bars: unchanged.
- Movies/TV bar posters and banners: unchanged result, plus one parallel screen read (vision cost; it can add a few seconds when the screen read is slower than the snap).

## Out of scope
- A screen snap on the Wine bar.
- Saving or sharing a screen set as an anchor (cards keep the search lane's Share and Save).
- Any new wording beyond the two approved lines.
