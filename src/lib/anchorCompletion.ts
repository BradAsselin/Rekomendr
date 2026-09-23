// src/lib/anchorCompletion.ts — server-only.
// S2: the lazy long completion (blueprint Q5, decided option (i), #19).
//
// A snapshot minted from a collapsed anchor has no long tier. When its
// owner SHARES it, the long is generated here, server-side, from the
// row's OWN fields — fields that were token-attested at mint, so no
// client input reaches the prompt — and written once:
//   UPDATE ... SET long_description = $1 WHERE id = $2 AND long_description IS NULL
// Two completions racing each other both run; the IS NULL guard means
// only one lands.
//
// Kept OUT of anchorSnapshots.ts on purpose: the public page and the OG
// image import that file, and neither may ever import an OpenAI client.
// Generation happens only on an owner's action, never on a public read.
if (typeof window !== "undefined") {
  throw new Error("anchorCompletion.ts was imported in a browser bundle.");
}
import { createHash } from "crypto";
import OpenAI from "openai";
import { ANCHOR_DETAIL_PROMPT } from "./anchorDetailPrompt";
import { isProductionRuntime } from "./envCheck";
import {
  LIMITS,
  isHealthCategory,
  reasonForDbError,
  type SnapshotRow,
} from "./anchorSnapshots";
import type { SupabaseClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type CompletionOutcome =
  | "completed"
  | "already_rich"
  | "health_skipped"
  | "generation_failed"
  | "db_error";

export async function completeLongIfMissing(
  store: SupabaseClient,
  row: Pick<
    SnapshotRow,
    "id" | "item_name" | "item_category" | "short_description" | "long_description"
  >
): Promise<CompletionOutcome> {
  if (row.long_description) return "already_rich";

  // CATCH 2 — THE FIFTH TWIN (verbatim requirement, #19). The category was
  // token-verified at mint; it is re-checked against the CURRENT list, so
  // a word added to the wall after the save still stops the generation.
  if (isHealthCategory(row.item_category)) {
    console.warn("[snapshot-completion] health category — skipped", { id: row.id });
    return "health_skipped";
  }

  // Charter §3.7 — a new generation site gets a dev-only fingerprint. The
  // search-lane markers don't apply to this prompt; its identity does: the
  // hash must equal the "Show details" prompt's (d500c0cf5cf5…), which is
  // the proof the completion reads in the same voice.
  if (!isProductionRuntime()) {
    console.log("[prompt-diag] snapshot-completion", {
      promptSha: createHash("sha256").update(ANCHOR_DETAIL_PROMPT, "utf8").digest("hex").slice(0, 12),
      promptChars: ANCHOR_DETAIL_PROMPT.length,
    });
  }

  let long: string | null = null;
  try {
    // Same model and settings as the user's own "Show details" tap
    // (handleAnchorDetail in /api/reksnap) — the same prompt, byte for
    // byte, so a completed snapshot reads like the one they'd have seen.
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANCHOR_DETAIL_PROMPT },
        {
          role: "user",
          content:
            `Item: ${row.item_name}\n` +
            (row.item_category ? `Category: ${row.item_category}\n` : "") +
            `Its displayed profile: ${row.short_description}`,
        },
      ],
    });
    const parsed = JSON.parse(completion.choices?.[0]?.message?.content ?? "");
    if (typeof parsed?.long === "string" && parsed.long.trim()) {
      long = parsed.long.trim().slice(0, LIMITS.long);
    }
  } catch (err) {
    console.warn("[snapshot-completion] generation failed — row stays short-only", {
      id: row.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return "generation_failed";
  }
  if (!long) {
    console.warn("[snapshot-completion] empty generation — row stays short-only", {
      id: row.id,
    });
    return "generation_failed";
  }

  const { error } = await store
    .from("anchor_snapshots")
    .update({ long_description: long })
    .eq("id", row.id)
    .is("long_description", null);
  if (error) {
    console.warn("[snapshot-completion] write failed", {
      id: row.id,
      reason: reasonForDbError(error),
      code: error.code,
    });
    return "db_error";
  }
  console.info("[snapshot-completion] ok", { id: row.id });
  return "completed";
}
