# S13 — Claude Opus 5.5 behind a switch (A) + voice mood input v1 (B)

Written 2026-10-23, before any code, on Brad's instruction. Local agent mode (§11). Plumbing merges to main when green; never `release/v2`, never Production. §0 and §12 apply. Spec for Part B: the Claude Doc "Rekomendr — Voice Mood Input Spec", narrowed by Brad's brief (Movies, TV, Wine; music is S14).

## State at start

- main @ `0a81a81` (#45). Working tree: six modified screenshots under `docs/screenshots/` from an earlier session. They are not this session's and stay unstaged.
- Last log entry: the typed-category fix (#44). Its harness, `validate-typed-category`, must stay green.

## The charter conflict, named first

§2.10 says: "The model is gpt-4o-mini + the tuned prompts. No model swaps… `ANTHROPIC_API_KEY` … is dev-only and not to be used in product code."

Part A puts the Anthropic SDK in product code. I read Brad's brief as the in-chat authorization §11.6 asks for. The guard is that **the default stays OpenAI**, so the live app's behavior doesn't change until Brad flips the flag.

- I do not edit §2.10. Only Brad edits §2.
- The log proposes the amendment wording: "The default is the tuned OpenAI path; a provider switch (REKS_MODEL_PROVIDER) exists, and only Brad flips Production."
- §10.4 forbids self-merging anything that changes §2. The switch PR doesn't change the invariant in effect: Production still runs OpenAI. So it merges under Brad's "plumbing merges when green". The PR description flags this.

## Part A — the switch

### A1. Provider layer: `src/lib/llm.ts`, server-only, plumbing PR

One door for the five steps Brad named:

| step | call sites today | OpenAI model today |
|---|---|---|
| `vision` | the streamed snap read (`startVisionStream`), the dense-shelf strip read, the typed-wine read (`/api/reksnap`) | gpt-4o |
| `shelf` | `readShelf` (`wineReks.ts`) | gpt-4o |
| `wine` | `generateWineReks` (`wineReks.ts`) | gpt-4o |
| `lines` | `chooseMediaReks` (typed/snapped title reks) and `linesVsGoTo` (chip "vs." lines), `mediaReks.ts` | gpt-4o-mini |
| `mood` | new: the voice mood parser (Part B) | gpt-4o-mini |

**Environment**
- `REKS_MODEL_PROVIDER=openai|anthropic` sets the default for every step. Unset means `openai`.
- `REKS_PROVIDER_<STEP>` overrides one step, e.g. `REKS_PROVIDER_SHELF=anthropic`. This lets Brad flip per step.
- `REKS_MODEL_<STEP>` overrides the model name for whichever provider that step runs on. Defaults:
  - OpenAI: today's model, unchanged.
  - Anthropic: `claude-opus-5-5`.
- `REKS_ANTHROPIC_EFFORT`: `low` by default. Opus 5.5 can't turn thinking off, and effort is the latency lever. The skill confirms `low` for latency-sensitive routes.
- `ANTHROPIC_API_KEY` is required only when some step resolves to `anthropic`.
- Boot check (`envCheck.ts`): a step on anthropic with no key logs an error naming the steps. `/api/health` reports the resolved provider per step.

**Transport.** The native `@anthropic-ai/sdk`, streaming (`messages.stream`), for every Anthropic call.
- Images: data URLs become base64 image blocks.
- JSON: Opus 5.5 has no `json_object` mode and no prefill. The prompts already say "Return JSON only".
  - The layer strips code fences and takes the outer object.
  - A parse failure logs `[llm] non-JSON` with the step and provider.
- `temperature` is dropped on Anthropic, because Opus 5.5 rejects sampling parameters.
- `max_tokens` gets headroom on Anthropic, since thinking tokens count against it.
- Refusals: per the Anthropic skill, the `fallbacks: "default"` server-side fallback is on (beta `server-side-fallback-2026-07-01`). A `refusal` stop reason is logged by name.

**Prompts stay byte-identical** in this PR. If Claude needs a different wording, that goes in its own VOICE PR and waits for Brad (his rule, 2026-10-16).

**Failures.** Anthropic errors (401 / 429 / credit / connection) map onto the existing honest plain-voice copy in `openaiFailure.ts`, the same four kinds. No new wording.

**Dev-only comparison hook.** A request header `x-reks-provider` overrides the provider. A dev-only `_diag` field (provider, model, per-call ms, tokens, cost) rides responses. Both are ignored when `isProductionRuntime()` is true, and a production request carrying them logs a warning. This lets one dev server run both providers side by side.

**Not covered:** the typed-wine classifier (gpt-4o-mini), backfill/chain/anchor-detail (gpt-4o), the search engine (`/api/openai`), recipe, profile, share. Brad's list didn't name them. They stay on OpenAI and are listed under "found, not fixed".

### A2. Early paint on shelf snaps, plumbing PR (feel call, §12.4)

- The client asks `/api/reksnap` for NDJSON (`stream: "ndjson"` in the body). Old clients and every harness still get one JSON response.
- When the shelf read finishes, the server writes `{"type":"shelf","scene","bottles":[{name,price}]}` at once. The final line carries the same body and status the JSON path returns.
- The client paints the bottles in the loading view as soon as they arrive: names, plus the tag price when one was read. The picks fill in when the final line lands.
- **No new words.** The loading label stays as it is. Prices use the existing "$17.99" format.
- Only when the read says shelf with ≥2 bottles. A single bottle, a haul and a media snap don't change.

### A3. Side-by-side run (report, not code)

- **Fixtures** (`docs/s13-fixtures.md` will list sources):
  - Cab/red shelf: the Kingstowne end cap.
  - Two-shelf white: a crop of the Alsace aisle.
  - Three-shelf white, dense: the full Alsace aisle.
  - Also the dense mixed aisle.
  - Single bottle: J. Lohr Sauvignon Blanc, Wikimedia Commons.
  - Cart: synthetic, assembled from bottle crops and labeled synthetic.
  - Breaking Bad cable banner, The Bear title page, Winchester '73 poster.
  - Typed "Lioness".
  - Comedy→Feel-good with and without a go-to.
- **Runs:** ≥3 per fixture per provider, against local dev with the live models.
- **Measured:**
  - median total time;
  - time to first content (the shelf event; the anchor on typed and media paths);
  - read accuracy against a hand-labelled bottle list (recall, plus invented names);
  - on-shelf rate and price-band adherence;
  - the dense-shelf outcome;
  - cost per snap from the token usage at list prices (gpt-4o $2.50/$10 per M tokens, 4o-mini $0.15/$0.60, Opus 5.5 $4/$20);
  - voice-mold counts across every generated line: "Built for", "You'll find yourself", "grapples", "leading to", "navigates", "explores", "More X and Y, with a focus on".
- **Note:** Comedy→Feel-good with **no** go-to makes no model call (TMDb synopsis, S12 call 3). Its time is provider-independent, and the report says so.
- **Output:** one table per provider and three example cards per provider side by side, in `docs/s13-opus-comparison.md`, the PR and the log. Brad decides per step.
- **Spend:** local runs only, on the `.env.local` key. Opus 5.5 at $4/$20 per M tokens; I estimate under $10 for the whole run and will report the actual figure.

## Part B — voice mood input v1 (Movies, TV, Wine)

**One new affordance (§2.6):** a mic button in the search box, next to the camera.

### B1. Capture
- Browser speech recognition (`SpeechRecognition` / `webkitSpeechRecognition`), with `interimResults` on so the transcript shows in the box as you speak.
- One tap starts. A second tap stops, or a pause ends it (non-continuous mode, the iOS default).
- While listening, the box's placeholder is the approved hint: "Say what you're in the mood for".
- **Fallback** (the API is missing, or the error is `not-allowed`, `service-not-allowed`, `audio-capture` or `network`):
  - focus the text box;
  - show the approved hint "Tap the keyboard mic to speak", so iOS dictation does the work.
  - Never a dead button. The home-screen app on iOS is the likely case for this.
- Precedent (§12.2): Google and YouTube search put the mic inside the search field. iOS dictation from the keyboard is the platform's own fallback.

### B2. The mood parser: `/api/mood`, step `mood`
- **In:** the transcript (≤300 chars), the bar's category, and the person's go-to names per category.
- **Out:** `{category, chip, refiner, goTo, price, mapped}`.
- **The vocabulary is the existing one, validated server-side.** The chips and refiners come from `moodChips.ts`, the price chips from `wineShelf.ts`. Anything outside them is dropped.
- A spoken title becomes a go-to steer:
  - a starred go-to steers directly;
  - an unstarred title ("like Lioness but funnier") resolves on TMDb and rides that one request as a transient go-to. It is not stored.
- **Unclear category:** the bar's category is used.
- **Unmapped mood:** `mapped:false`, plus the closest chips. The client puts the transcript in the box and moves those chips to the front of the existing row. Never an error.
- **Writing the parser:** its prompt is new. It produces tags, never text a person reads, so I treat it as plumbing, not VOICE. Brad can veto.
- Capped like every model route (`api_usage`), with a `[mood]` log line naming any failure.

### B3. Results reuse existing paths (no new pick logic)
- **Movies / TV:** the S12 slot recipe (`/api/slots`) with the mapped chip and refiner, steered by the go-to when one was named.
- **Wine:** the existing wine chip search (lane + vibe), with the price band added as a qualifier in the existing free-text lane slot ("Crisp White under $20").
  - This is pressure, not a guarantee.
  - The **guaranteed** band needs the wine pick path (`runWineSet`), and that path is written around an anchor bottle. A mood has none.
  - Framing it without one needs new prompt words, so that change ships as a separate **VOICE PR** and waits for Brad.
  - With a starred wine go-to, the pick path could anchor on the go-to with no new words. That also waits, as part of the same VOICE PR, so wine mood behavior changes once, not twice.
- **Five cards** with the usual actions, no new card controls.

### B4. Signals
- **Schema SQL first** (§11.2: `pg_dump` backup, block by block, adversarial suite with positive control): `docs/sql/s13-voice-moods.sql`.
  - `voice_moods`: client id, transcript text (never audio), bar category, mapped category/chip/refiner/go-to/price, mapped flag, provider/model, ms.
  - `voice_events`: mood id, card title, position, kind `shown|tap|play|share|save|star`.
  - Both tables: RLS on, zero client policies, `anon`/`authenticated` revoked, explicit `service_role` grants.
- **Route:** `/api/voice` (service role). `/api/stats` gains moods, mapped rate per category, and for the five cards the tap/play/share/save/star rate vs ignored. "Ignored" means shown with no action in that set.
- **Client:** the active voice set's mood id rides the existing card handlers. One `logVoiceEvent` call per handler, fire-and-forget.

### B5. Acceptance (machine part)
- Five moods across three categories each give five relevant picks.
- Screens finish in under 5 s on the default model; the same timing is recorded on Opus.
- The real-iPhone checks (Safari and the home-screen app) are Brad's checklist.

## PR split

| PR | branch | contents | merge |
|---|---|---|---|
| S13a | `auto/s13a-model-switch` | plan doc, `llm.ts`, the five steps routed, env/boot/health, dev hook, harness | when green |
| S13b | `auto/s13b-shelf-early-paint` | NDJSON + loading-view bottles | when green (feel call, preview) |
| S13c | `auto/s13c-voice-mood` | migration, `/api/mood`, `/api/voice`, mic, parser, routing, stats | when green |
| S13v | `auto/s13v-voice-wording` | VOICE: wine mood framing for the pick path, plus any Claude-specific prompt rewording the comparison shows a need for | **waits for Brad** |

The comparison report rides S13a's log entry and `docs/s13-opus-comparison.md`.

## Races and blast radius

- **The streamed vision read** keeps its contract: `detected` and `similar` settle the moment their JSON closes; `stop` aborts; `done` returns text, usage, finish reason and refusal. Only the token source changes. Claude's text deltas feed the same buffer and extractors.
- **NDJSON:** the final line is written after the same handler returns. The client keeps its `snapIdRef` guard, so an early shelf event from a dismissed snap is dropped like any late answer.
- **Voice:** a recognition `onend` firing after the person has typed or tapped a chip is dropped by a voice epoch (the `searchIdRef` pattern).
- **Default-off:** with no env set, every call goes through the OpenAI branch with today's arguments. Harnesses pin that (a byte check of the model and params per site).

## Deliberately out of scope
- Music (S14), voice follow-ups, playlists.
- Moving other routes to the switch.
- Production env (Brad's step).
- Any prompt wording (S13v).
- The Preview Anthropic key: Brad picks the key and cap before I set it.

## §0 check (planned)
Voice is a shorter path to a choice: say it instead of tapping through chips. Nothing persuades, and nothing is kept except the transcript text the person chose to speak, used for their own picks and the stats. The model switch changes no ranking incentive.
