# Typed-Lane Anchor Contract — Design Doc (Issue B)

**Status: DESIGN — no code. One recommendation at the end, pending Brad.** Written 2026-07-19 (overnight) against `main` @ `48317fa`. Companion to `docs/typed-lane-trace.md` §B, which established the mechanism: **no layer in the typed lane distinguishes recognition from free-association.** This is a prerequisite for `?q=` deep-linking of shared anchors (S3 handoff stays plain-link until one of these ships). Governing principle, applied to every option: **a silent failure is worse than a wrong answer** — a wrong answer the user can *see* is correctable; a silent one poisons trust.

## The contract gap, restated in one paragraph

Typed text enters the prompt as steering (`User text: Bonanza`, `rekomendrEngine.ts:244-251`), the seed slot is empty on fresh searches (`Seed title: (none)`, `rekomendrEngine.ts:652-653`), and the response is a bare JSON array of recommendations relayed as `text/plain` by `/api/openai` (`route.ts:51-54`). Nothing in the wire format has a place to say *"here is what I understood you to mean, and how sure I am."* Every option below is a different way of adding that slot.

---

## Option A — Recognition echo in the generation response (one call, contract extension)

**Shape:** `buildAIPrompt` instructs the model to return, alongside the array, an envelope: `{ "anchor": { "input": "Bonanza", "resolved": "Bonanza (TV, 1959)" | null, "kind": "title|person|style|phrase|unknown", "recognized": true|false }, "results": [...] }`. The engine parses it (extending `extractJsonArray`, `rekomendrEngine.ts:436-453`, which already handles object envelopes); `getTop5FromEngine` returns it beside the reks; the UI renders it always:

- Recognized: a quiet provenance line above the results — *"more like **Bonanza** (the 1959 western)"* — in the DescriptorLine register.
- Unrecognized: the results still render (the model's honest best guess for the lane), under the honest voice: *"Reks Ray doesn't know 'Bonanza' — here's the Comedy lane instead."*

**Cost:** prompt block (~10 lines), envelope parse, one UI line + one notice variant. No new calls, no added latency. ~half a day.
**Failure modes:** (1) the model *overclaims* — says recognized when it's guessing; mitigated by the echo being visible (a wrong "the 1959 western" is instantly catchable by the user — the wrong-answer-you-can-see trade this doc accepts by principle). (2) The model resolves to the wrong homonym ("Chicago" the band vs. the musical vs. the city); the visible echo again converts a silent miss into a correctable one. (3) Envelope breaks old parsing — `extractJsonArray` already falls back to array-hunting, so a malformed envelope degrades to today's behavior, not a crash.
**Bonus:** the JSON envelope on `/api/openai` responses is also the prerequisite for ever extending S3's HMAC custody to the search lane (`s3-minting-integrity.md` Part 3 noted `text/plain` rules it out today). One change, two roadmap items unblocked.

## Option B — Pre-generation resolution call (classify-first, two calls)

**Shape:** before generation, a fast, cheap call (gpt-4o-mini, ~200 tokens) resolves the typed text to a structured anchor `{name, kind, category, confidence}`; the generation prompt then receives a *resolved* seed instead of raw text; low confidence gates to the honest-fallback voice before any generation spend. The recipe route's classify-first safety gate is the in-house precedent for the pattern.

**Cost:** a second model call on **every** typed search — +300-600ms latency and +1 call of spend on the happy path, to improve only the miss path. Engine restructuring (two-phase search) is a bigger diff than A.
**Failure modes:** the resolver itself free-associates (same overclaim risk as A, now hidden in a pre-step the user never sees unless surfaced — which reintroduces A's echo anyway); latency regression on the product's core gesture; two calls to keep consistent.
**Verdict:** pays the most for the least-visible benefit. The resolution quality gain over A is marginal because the generation model is the same family that would do the resolving.

## Option C — `/api/resolve` anchor endpoint (the deep-link architecture)

**Shape:** a server route owning anchor resolution: `POST /api/resolve {text, category?, clientId}` → `{anchor: {name, kind, category, confidence, short?}, token?}`. The typed lane calls it and renders a true **anchor card** (the snap lane's `detected_item` grammar — accent frame, short profile, reks hanging off it); `?q=` deep links call the same endpoint; and because resolution happens server-side, the response can carry an S3-style HMAC token — a typed-lane anchor becomes save/mintable with the same custody chain as a snapped one (`s3-minting-integrity.md`'s chain extends for free).

**Cost:** the most build — new route, client anchor-card state in the search lane, lane-convergence design questions (does the anchor occupy a frontier slot? does it re-roll?). Realistically a multi-session slice on the order of a behavior-unification arc.
**Failure modes:** same resolver-overclaim risk (mitigated by the visible anchor card — the strongest form of the visible-echo principle: the user *sees the anchor itself*); scope creep into full lane convergence; latency on typed search (one added call, same as B).
**Strategic fit:** this is where the product grammar has been converging all year (card convergence → behavior unification → reks-carry-category → S3 anchor snapshots). C makes typed and snapped anchors the same object.

---

## Recommendation

**Ship A now; build C when `?q=` deep-linking is actually scheduled; skip B entirely.**

A is the smallest change that ends the silence, adds zero latency, honors the principle by making every resolution *visible* (right or wrong), and its envelope change is a stepping stone both to C (the `anchor` object IS C's response shape — extracting it to a route later is mechanical) and to search-lane HMAC custody. B is dominated: it spends latency and money on every search to buy accuracy A mostly gets free, while hiding the resolution unless it also implements A's echo. C is the right destination but is an arc, not a patch — and S3 v1's plain-link handoff removes the urgency. Sequencing: A rides any post-S3.6 session; C gets scheduled the day `?q=` deep-linking of shared anchors becomes a committed feature, with A's envelope already in place as its wire format.

**Brad calls:** (1) approve A's two copy strings (provenance line + honest-miss voice) — they're user-facing register; (2) on miss, A currently proposes *showing* the lane results under the honest voice rather than an empty state — confirm that's the right failure posture (the alternative, results-suppressed-on-miss, is stricter but turns every model hiccup into a dead end).
