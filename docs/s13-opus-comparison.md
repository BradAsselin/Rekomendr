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

---

# S13d — Sonnet 5.5 and Haiku 5.5 on the steps that stayed on OpenAI

Run on 2026-10-23, local dev, live models, same fixtures and harness as above.

- **One step at a time.** Only the named step moves (dev header `x-reks-steps`); every other step stays on today's OpenAI default. In the wine runs, for example, the shelf and photo reads are still gpt-4o.
- **Settings:** effort `low`, streamed.
- **Runs:** 3 per case; 6 for Lioness lines after the fix below.
- **Opus rows** come from the all-Opus runs above. There every step was Opus, including the shelf read, which is why Opus's on-shelf numbers are higher. Its step times compare directly.
- **Costs** are the step's own calls at list prices:
  - Sonnet 5.5: $2 / $10 per million tokens (in/out).
  - Haiku 5.5: $0.10 / $0.50.

**A fix this run needed.** Without a schema, Sonnet 5.5 sometimes dropped a quote in the chooser's JSON (`"line":Same infiltrate…`). It failed **7 of 15** replies, each shipping an empty set.
- Claude calls on the lines step now send the chooser's reply shape as a structured-output schema. It's the same shape the prompt already states; no prompt words changed, and OpenAI calls are untouched.
- With it: Sonnet **9/9** full sets.
- The lines rows below are with the schema.

## Wine picks (step `wine`)

Median total / the wine call itself / on-shelf picks / in price band / cost of the wine call:

| case | OpenAI gpt-4o | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|
| Cab/red shelf | 11.5 s / 7.0 s / 8/15 / 15/15 / $0.014 | 29.9 s / 18.4 s / 9/15 / 15/15 / $0.052 | 15.0 s / 9.6 s / 8/15 / 15/15 / $0.020 | 14.1 s / 10.1 s / 7/15 / 15/15 / $0.0015 |
| End cap | 12.1 s / 6.2 s / 10/15 / 15/15 / $0.014 | 26.3 s / 17.4 s / 15/15 / 15/15 / $0.049 | 15.6 s / 9.4 s / 8/15 / 15/15 / $0.019 | 18.8 s / 13.6 s / 13/15 / 15/15 / $0.0020 |
| Two-shelf white | 12.1 s / 8.8 s / 3/15 / 15/15 / $0.014 | 24.2 s / 18.1 s / 11/15 / 15/15 / $0.047 | 12.2 s / 8.7 s / 3/15 / 15/15 / $0.019 | 19.4 s / 16.1 s / **0/15** / 15/15 / $0.0021 |
| Single bottle | 9.1 s / 5.9 s / — / 15/15 / $0.013 | 24.9 s / 18.4 s / — / 15/15 / $0.048 | 12.3 s / 9.4 s / — / 15/15 / $0.019 | 15.7 s / 13.0 s / — / 15/15 / $0.0018 |
| stock phrases (60 lines each) | 1 | 0 | 0 | 0 |

Every run of every model gave five picks.

## Poster / TV photo read (step `vision`)

Median total / the vision call / anchor right + on TMDb / cost of the vision call:

| case | OpenAI gpt-4o | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|
| Breaking Bad banner | 5.0 s / 1.6 s / 3/3 / $0.014 | 8.3 s / 3.7 s / 3/3 / $0.033 | 5.6 s / 2.4 s / 3/3 / $0.017 | 5.5 s / 1.8 s / 3/3 / $0.0008 |
| The Bear title page | 5.0 s / 1.9 s / 3/3 / $0.014 | 17.2 s / 12.2 s / 3/3 / $0.033 | 5.4 s / 2.5 s / 3/3 / $0.017 | **16.5 s / 12.0 s** / 3/3 / $0.0008 |
| Poster (Winchester '73) | 5.0 s / 2.1 s / 3/3 / $0.014 | 16.3 s / 8.1 s / 3/3 / $0.038 | 6.5 s / 3.0 s / 3/3 / $0.019 | 5.0 s / 2.2 s / 3/3 / $0.0009 |

- Every model named all three correctly.
- Haiku stalled ~12 s before writing on The Bear, as Opus did. Sonnet never stalled.

## "vs." lines (step `lines`: typed-title reks and chip lines against a go-to)

Median total / the lines call / full five / stock phrases / cost of the call:

| case | OpenAI 4o-mini | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|---|---|
| Typed "Lioness" | 3.1 s / 2.4 s / 3/3 / 3 of 15 / $0.0005 | 5.2 s / 4.7 s / 3/3 / 0 / $0.022 | 4.2 s / 3.6 s / **6/6** / 0 of 30 / $0.012 | 3.8 s / 3.0 s / 5/6 (one set of 2) / 0 of 27 / $0.0007 |
| Comedy → Feel-good, go-to Grand Budapest | 2.9 s / 2.6 s / 3/3 / 3 of 15 / $0.0003 | 7.2 s / 6.9 s / 3/3 / 0 / $0.016 | 4.5 s / 4.1 s / 3/3 / 0 of 15 / $0.008 | 3.9 s / 3.5 s / 3/3 / 0 of 15 / $0.0006 |

## Mood parser (step `mood`)

12 spoken moods × 3 runs. Scored on the expected category + lane (+ refiner, price or named title where one was said). Includes the cross-bar cases ("a horror movie" on the Wine bar), "something bubbly to celebrate", "a cozy british mystery series", and nonsense.

| | accuracy | median end to end | median model call | cost per parse |
|---|---|---|---|---|
| OpenAI 4o-mini | 36/36 | 1.28 s | 0.91 s | $0.00012 |
| Opus 5.5 | 36/36 | 2.44 s | 2.00 s | $0.0060 |
| Sonnet 5.5 | 36/36 | 2.03 s | 1.69 s | $0.0024 |
| Haiku 5.5 | 36/36 | 1.22 s | 0.89 s | $0.00014 |

## Three cards each

| | Sonnet 5.5 | Haiku 5.5 |
|---|---|---|
| Wine, end cap | **Rocca Chianti** · $10.99 on this shelf — Similarly dry, but lighter in body and higher in acidity. The sour cherry leads and a dusty, earthy edge follows, with tannin that grips at the finish. Trades the weight for brightness — if the earthiness is what you love, this keeps it in a leaner frame. | **Ruffino Chianti** · $10.99 on this shelf — Similarly dry, but lighter on the body. The cherry leads and the tannin stays soft through the finish, with the dark fruit pulled back. Trades the weight for brightness: if the full dark fruit is what you love, this will read thin, but if you want something lighter on the palate, this is it. |
| Typed "Lioness" | **Homeland**: Same CIA-versus-terror pressure, but the lead is a volatile officer, Carrie Mathison, and her mentor Saul Berenson guides her instead of a station chief. | **Homeland**: Same CIA pressure and a handler at its center, but Carrie Mathison's bipolar volatility makes the spycraft far more personal than Cruz's recruitment. |
| Comedy → Feel-good, vs. Grand Budapest (the recipe picks the title; the model writes the line) | **The Wolf of Wall Street**: vs. your Grand Budapest Hotel: louder and far more debauched, following a New York stockbroker Jordan Belfort whose fraud-fueled excess drives the dark comedy. | **Ted**: vs. your Grand Budapest Hotel: lighter and sillier, with a grown man torn between his girlfriend Lori and a teddy bear brought to life. |

The shelf names in the two wine cards differ ("Rocca" vs "Ruffino" Chianti) because the gpt-4o shelf read, still on in these runs, named that bottle differently each time. The label is a Fontella Chianti, which the Opus shelf read gets right.

## Recommendation, per step (Brad flips)

| step | recommend | why |
|---|---|---|
| shelf | **Opus** (unchanged) | see above |
| wine | keep OpenAI | Sonnet: same on-shelf, ~+3 s, +$0.005. Haiku: 10× cheaper but 13–16 s and 0/15 on-shelf on the white aisle |
| vision | keep OpenAI | No accuracy difference on these three; OpenAI is fastest. Sonnet is the safe second (+0.5–1.5 s, never stalled); Haiku stalled 12 s on The Bear |
| lines | OpenAI today; **Haiku 5.5 if you want the register** | Haiku: 0 stock phrases vs 6 in 30, +0.6–0.9 s, about the same cost ($0.0006 vs $0.0004), one short set in 9. Sonnet: also 0, 9/9 full, ~+1.5 s, ~25× the cost. The register change is a voice call (§5): read the cards first |
| mood | keep OpenAI | All four are perfect; Haiku ties 4o-mini on time and cost, so there's no reason to move |

**How to flip one step** (Production env, Brad's step):
- `REKS_PROVIDER_<STEP>=anthropic` plus `REKS_MODEL_<STEP>=claude-haiku-5-5` (or `claude-sonnet-5-5`).
- Example: `REKS_PROVIDER_LINES=anthropic`, `REKS_MODEL_LINES=claude-haiku-5-5`.
- An Anthropic step with no model name runs Opus 5.5.
