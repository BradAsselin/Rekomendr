# S14 — All Claude (off GPT-4o) — plan

Brad's brief (2026-10-23, unattended evening run): "S14: migrate fully off
GPT-4o to Claude." The pasted brief referenced "the prompt below", which did
not arrive (the paste was cut). This plan is built from the S13/S13d
findings and is logged as a call in SESSION_LOG.

## What moves

Every model call in the app goes through `llmCall` (`src/lib/llm.ts`).
S13 put five steps on the switch. S14 adds the rest:

| new step | call sites | today |
|---|---|---|
| `search` | `/api/openai` (search-lane engine prompt + the unused picker mode) | gpt-4o-mini |
| `snap` | `/api/reksnap` backfill + chain steer/reroll | gpt-4o |
| `detail` | `/api/reksnap` anchor "Show details" + `anchorCompletion.ts` (same prompt; must share a model) | gpt-4o |
| `recipe` | `/api/recipe` | gpt-4o |
| `classify` | `/api/reksnap` typed-wine classifier | gpt-4o-mini |

After S14 there is no `chat.completions` call outside `llm.ts`.

**Not moved: moderation** (`/api/profile`, `/api/share`, `omni-moderation-latest`).
It is not GPT-4o, it is free, and it fails closed (Ledger #19). Replacing it
with a Claude classifier means new safety wording and a new failure mode;
that is Brad's call. `OPENAI_API_KEY` therefore stays in Production for
moderation only.

## The default flips — gated on the key

- `ANTHROPIC_API_KEY` present → every step defaults to Claude, per-step model below.
- Key absent → every step stays on today's OpenAI models (so promoting `main`
  before the Production key exists cannot break production). The boot check
  logs it by name and `/api/health` shows `models` per step.
- `REKS_MODEL_PROVIDER=openai` puts everything back on OpenAI (the one-line rollback).
- `REKS_PROVIDER_<STEP>` / `REKS_MODEL_<STEP>` still override one step.

Per-step Claude defaults (from S13/S13d measurements, finalized by S14's own
counted runs — see the comparison section of `docs/s13-opus-comparison.md`):

| step | Claude default | why |
|---|---|---|
| shelf | Opus 5.5 | 11–12/13 producers read, nothing invented |
| vision | Sonnet 5.5 | 2.4–3.0 s, 3/3 TMDb, never stalled (Opus/Haiku stalled 12 s) |
| wine | Sonnet 5.5 | 9–10 s, same on-shelf as gpt-4o (Opus 18 s) |
| lines | Sonnet 5.5 | 9/9 full sets, 0 stock phrases (Haiku 8/9) |
| mood | Haiku 5.5 | 36/36, 1.2 s |
| classify | Haiku 5.5 | a yes/no parse, like mood |
| search | Haiku 5.5 | 13 stock phrases in 30 cards (4o-mini 43), 19–25 s, $0.0035; Sonnet 1 phrase at $0.05 |
| snap | Sonnet 5.5 | backfill 2.3–2.8 s, chain 5.6–7.7 s |
| detail | Haiku 5.5 | keeps the 3-sentence limit (Sonnet wrote 4–5), 2–3 s |
| recipe | Haiku 5.5 | high-stakes gate held 6/6, 3–6 s |

## Mechanism

- `LlmStep` gains the five steps; `OPENAI_DEFAULT` keeps each site's old model.
- `LlmRequest.json?: boolean` (default true): the search prompt mode only
  asked OpenAI for json_object when `jsonResponse` was set; that stays exact.
- Each converted site: `openai.chat.completions.create(...)` →
  `llmCall({ step, system, user, maxTokens, temperature })`, reply through
  `jsonText` (object replies) or as-is (the search array reply —
  `extractJsonArray` already finds the array in prose or a fence).
- `/api/openai` and `/api/recipe` are wrapped in `withLlmContext` (dev hook).
- Search had no `max_tokens`; it gets 6000 (above the ~4,800-token 12-item
  backfill ceiling in `rekomendrEngine.ts`).
- Schemas (structured output, Claude only) where the reply shape is small and
  fixed: recipe, detail, classify. Others rely on the prompts' "Return JSON
  only" + `jsonText`, which held 0 failures in S13d; S14 counts failures.

## Prompts

Byte-identical. No prompt text changes, so no VOICE PR. The search-lane and
snap-lane voices are locked (§2.3); the model under them changes on Brad's
explicit instruction. The harness checks every prompt string line is
unchanged vs `main`.

## Races / timeouts (§2.11)

- Search backfill client abort is 90 s; Claude must sit well under it at the
  12-item ceiling — measured, not estimated.
- Anthropic calls stream inside `llmCall`, so no SDK long-request refusal.
- No new landing sites: every reply lands where it always did.

## Blast radius

Server-only. With no `ANTHROPIC_API_KEY` the app is byte-for-byte today's.
With it, every generation path changes model. Rollback: `REKS_MODEL_PROVIDER=openai`.

## Out of scope

Moderation; any prompt wording; the §2.10 charter text (proposed amendment
in the log for Brad); Production env (Brad's).
