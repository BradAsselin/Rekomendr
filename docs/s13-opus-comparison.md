# S13a — OpenAI vs Claude Opus 5.5, side by side

Run on 2026-10-23 on local dev (branch `auto/s13a-model-switch`), against the live models, with photos sized the way the phone sends them (2048 px, JPEG 0.85).

- **Runs:** 3 per case per provider, a fresh anonymous client each time.
- **Opus settings:** `claude-opus-5-5`, effort `low`, streamed.
- **Prompts:** byte-identical across both providers.
- **Timing:** server wall-clock as the page sees it.
  - "First content" means the shelf read finishing, which is what S13b paints first.
  - On media and typed paths, first content is the anchor.
- **Cost:** token usage at list prices.
  - gpt-4o: $2.50 / $10 per million tokens (in/out).
  - 4o-mini: $0.15 / $0.60.
  - Opus 5.5: $4 / $20.
  - Aborted OpenAI vision streams report no input tokens, so they're estimated from completed ones.

**Fixtures** (photos aren't committed; the sources are below):

| case | photo |
|---|---|
| Cab/red shelf | top two shelves of a Kingstowne Giant end cap (7 producers, tags, "90 POINTS" talkers) |
| End cap, five shelves | the same end cap whole (13 producers; reds, whites, 19 Crimes, Bota Box) |
| Two-shelf white | an Alsace Riesling aisle (Wikimedia Commons), euro tags |
| Three-shelf dense | a dense mixed/sparkling aisle (Commons). It is not white: no dense white aisle was available. |
| Single bottle | J. Lohr Sauvignon Blanc (Commons) |
| Cart | **synthetic**: six bottle crops from the end cap pasted into a drawn cart |
| TV and poster | Breaking Bad cable banner, The Bear title page, Winchester '73 poster |
| Typed and chip | typed "Lioness" (TV); Comedy → Feel-good, with no go-to and with Grand Budapest Hotel as the go-to |

"Read accuracy" counts producers hand-labelled from the photo that the shelf read named, and names it gave that aren't in the photo.

## OpenAI (today's default: gpt-4o for vision/shelf/wine, 4o-mini for lines)

| case | median total | median first content | read accuracy | on-shelf picks | in price band | cost / snap |
|---|---|---|---|---|---|---|
| Cab/red shelf (2 shelves) | 11.5 s | 3.5 s | 2/7 found, **4 not on photo** | 8/15 | 15/15 | $0.034 |
| End cap (5 shelves) | 12.1 s | 5.2 s | 7/13 found, **3 not on photo** | 10/15 | 15/15 | $0.037 |
| Two-shelf white (Alsace) | 12.1 s | 2.7 s | 1 bottle read; anchor "Riesling" | 3/15 | 15/15 | $0.032 |
| Three-shelf dense | 8.4 s | 1.3 s | 0 bottles read; anchor "wine" / "wine aisle" | 0/15 | 15/15 | $0.030 |
| Single bottle | 9.1 s | 9.1 s | "J. Lohr Chardonnay" (it's a Sauvignon Blanc) | — | 15/15 | $0.030 |
| Cart (synthetic) | 10.6 s | 10.6 s | haul detected **1/3**; read "whiskey bottles", "gin bottle" | — | — | $0.025 |
| Breaking Bad banner | 5.0 s | 5.0 s | TMDb 3/3* | — | — | $0.014 |
| The Bear title page | 5.0 s | 5.0 s | TMDb 3/3 | — | — | $0.014 |
| Poster | 5.0 s | 5.0 s | TMDb 3/3 | — | — | $0.014 |
| Typed "Lioness" | 3.1 s | 0.1 s | — | — | — | $0.0005 |
| Comedy → Feel-good, no go-to | 0.2 s | 0.2 s | no model call (TMDb synopsis) | — | — | $0 |
| Comedy → Feel-good, with go-to | 2.9 s | 2.9 s | — | — | — | $0.0003 |

\* In a trial run before the counted runs, gpt-4o read the banner as "Breaking Bad - Ozymandias". S11's episode stripper doesn't catch that form, so the snap fell to the 10 s vision path with no where-to-stream (see "Found, not fixed").

## Claude Opus 5.5 (every step on Opus, effort low)

| case | median total | median first content | read accuracy | on-shelf picks | in price band | cost / snap |
|---|---|---|---|---|---|---|
| Cab/red shelf (2 shelves) | 29.9 s | 5.3 s | 5/7 found, 1 not on photo | 9/15 | 15/15 | $0.106 |
| End cap (5 shelves) | 26.3 s | 6.4 s | **12/13 found, 0 not on photo** | **15/15** | 15/15 | $0.122 |
| Two-shelf white (Alsace) | 24.2 s | 5.1 s | 5 bottles read; anchor "Cave du Roi Dagobert Riesling 2007" | **11/15** | 15/15 | $0.127 |
| Three-shelf dense | 22.5 s | 2.3 s | 0 bottles read; anchor "Sparkling Wine Aisle" | 0/15 | 15/15 | $0.102 |
| Single bottle | 24.9 s | 24.9 s | "J. Lohr Carol's Vineyard Sauvignon Blanc" (right grape) | — | 15/15 | $0.123 |
| Cart (synthetic) | 14.4 s | 14.4 s | haul detected **3/3**; no names legible | — | — | $0.059 |
| Breaking Bad banner | 8.3 s | 8.3 s | TMDb 3/3 | — | — | $0.055 |
| The Bear title page | 17.2 s | 17.2 s | TMDb 3/3 | — | — | $0.052 |
| Poster | 16.3 s | 16.3 s | TMDb 3/3 | — | — | $0.062 |
| Typed "Lioness" | 5.2 s | 0.05 s | — | — | — | $0.022 |
| Comedy → Feel-good, no go-to | 0.1 s | 0.1 s | no model call (TMDb synopsis) | — | — | $0 |
| Comedy → Feel-good, with go-to | 7.2 s | 7.2 s | — | — | — | $0.016 |

**Where the Opus time goes**, as a median per step:

| step | OpenAI | Opus |
|---|---|---|
| shelf read | 1.3–5.2 s | 2.1–6.4 s (close) |
| vision read, first token | 0.9–1.9 s | 1.8–11 s (it thinks before it writes, even at effort low) |
| wine picks | 6–9 s | 17–18 s (~1,700 output tokens including thinking, vs ~800) |
| lines | 2.4–3 s | 4–7 s |

## The mix: shelf read on Opus, everything else on OpenAI (`REKS_PROVIDER_SHELF=anthropic`)

3 runs each:

| case | median total | median first content | read accuracy | on-shelf picks | in band | cost / snap |
|---|---|---|---|---|---|---|
| Cab/red shelf | 9.7 s | 3.3 s | 5/7, 1 not on photo | 9/15 | 15/15 | $0.026 |
| End cap | 14.1 s | 6.2 s | **11/13, 0 not on photo** | **14/15** | 15/15 | $0.039 |
| Two-shelf white | 12.3 s | 4.8 s | 5 bottles read | **11/15** | 15/15 | $0.041 |
| Three-shelf dense | 9.5 s | 3.1 s | 0 bottles read | 0/15 | 15/15 | $0.026 |
| Single bottle | 9.9 s | 9.9 s | — | — | 15/15 | $0.037 |

## Voice-mold counts

Every generated line was counted (anchor descriptions, rek descriptions, "vs." lines). TMDb synopses are excluded because neither model wrote them.

| mold | OpenAI (192 lines) | Opus (192 lines) |
|---|---|---|
| "Built for" | 2 | 1 |
| "You'll find yourself" | 0 | 0 |
| "grapples" | 4 | 0 |
| "leading to" | 2 | 0 |
| "navigates" | 11 | 0 |
| "explores" | 7 | 0 |
| "More X and Y, with a focus on" | 0 | 0 |
| **total** | **26** | **1** |

## Three cards per provider, side by side

**1. Wine, end-cap snap (first card of run 1).** gpt-4o's anchor, "7 Moons Red Blend", is not on the shelf (it misread "Inspiration 7.9"). Opus anchored on 19 Crimes, which is there.

| OpenAI | Opus 5.5 |
|---|---|
| **Colossal Reserva** · $12.49 on this shelf<br>Slightly drier with more structure. Dark fruit and oak spice build up the mid-palate, leading to a robust finish. If you love the smoothness, this adds depth and intensity without losing balance. | **Paxis Red Blend** · $7.99 on this shelf<br>Similarly soft and fruit-forward, with a touch less oak sweetness. The ripe plum and blackberry ride up front and the finish stays smooth, with only a light spice edge. Keeps the plush, low-grip feel and dials the vanilla back slightly, so it reads juicy more than dessert-like. |

**2. TV, The Bear title page.**

| OpenAI | Opus 5.5 |
|---|---|
| **The Chi**: Similar Chicago setting, with Brandon aspiring to open his own restaurant while navigating the challenges of the South Side. | **Boiling Point**: Same pressure-cooker kitchen and loyal crew, but in London, where head chef Carly fights to keep Point North afloat. |

**3. Chip with a go-to: Comedy → Feel-good, steering by Grand Budapest Hotel.**

| OpenAI | Opus 5.5 |
|---|---|
| **The Truman Show**: vs. your Grand Budapest Hotel: similar quirky humor, as an insurance salesman discovers his life is a constructed reality for an unseen audience. | **Knives Out**: vs. your Grand Budapest Hotel: same whimsical caper energy around a contested fortune, but here a dead novelist's estate and debonair Detective Benoit Blanc drive the mystery. |

Also, typed "Lioness": gpt-4o's second card was "Condor … grapples with the moral implications". Opus's was "The Night Manager: Same deep-cover infiltration tension, but a former British soldier, Jonathan Pine, embeds himself inside arms dealer Richard Roper's inner circle."

## Reading it

- **Opus reads shelves much better.** It names what's actually there and makes up nothing. That's why its picks stay on the shelf: 15/15 on the end cap vs 10/15, and 11/15 on the white aisle vs 3/15.
- **It also writes with almost none of the molds** (1 vs 26), with the same prompts.
- **It is too slow for the steps a person waits on** at these settings:
  - wine picks take ~18 s;
  - a poster or title page takes 16–17 s, against 5 s;
  - a chip with a go-to takes 7 s, against 3 s.
- **It costs ~3–4× per snap.**
- **The mix gets almost all of the reading win at today's speed and cost.**

## Recommendation, per step (Brad decides)

| step | recommendation | why |
|---|---|---|
| shelf | **flip to Opus** | read accuracy 11–12/13 with nothing invented, at about the same time and +$0.005 |
| vision | keep OpenAI | 2–11 s to first token on Opus |
| wine | keep OpenAI | 18 s on Opus |
| lines | keep OpenAI for now | 2× slower. The register win is real, but voice is a joint-session call (§5). Revisit with Sonnet 5.5 or prompt caching |
| mood | keep OpenAI | 4o-mini is fast enough; see S13c's numbers |
