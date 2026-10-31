// src/lib/parseRetry.ts — S33/S34 (Brad, 2026-10-31). A model reply that
// doesn't parse is retried once, silently; only a second miss is a failure.
// Both attempts are logged the same way on every path:
//   warn  "[<tag>] parse failed — retrying"   (attempt 1)
//   info  "[<tag>] parse retry succeeded"     (attempt 2 parsed)
//   error "[<tag>] parse failed — giving up"  (attempt 2 missed)
// each with the caller's context plus attempt, of, chars, finishReason and
// the parse error. Only a PARSE miss retries: a transport error from the
// call itself propagates as before.

export type ParseAttempt = { text: string; finishReason?: string | null };

export const PARSE_ATTEMPTS = 2;

// Flat (not a union) so it narrows the same under every tsc setting the
// validators compile with: `value` is set exactly when `ok`.
export type ParseOutcome<T> = {
  ok: boolean;
  value: T | null;
  attempt: number;
  last: ParseAttempt;
  error: string | null;
};

export async function parseWithRetry<T>(
  tag: string,
  context: Record<string, unknown>,
  first: () => Promise<ParseAttempt>,
  again: () => Promise<ParseAttempt>,
  parse: (text: string) => T
): Promise<ParseOutcome<T>> {
  let last: ParseAttempt = { text: "" };
  for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
    last = attempt === 1 ? await first() : await again();
    try {
      const value = parse(last.text);
      if (attempt > 1) console.info(`[${tag}] parse retry succeeded`, { ...context, attempt });
      return { ok: true, value, attempt, last, error: null };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const detail = {
        ...context,
        attempt,
        of: PARSE_ATTEMPTS,
        chars: last.text.length,
        finishReason: last.finishReason ?? null,
        error,
      };
      if (attempt < PARSE_ATTEMPTS) {
        console.warn(`[${tag}] parse failed — retrying`, detail);
      } else {
        console.error(`[${tag}] parse failed — giving up`, detail);
        return { ok: false, value: null, attempt, last, error };
      }
    }
  }
  /* istanbul ignore next — the loop always returns */
  return { ok: false, value: null, attempt: PARSE_ATTEMPTS, last, error: "unreachable" };
}
