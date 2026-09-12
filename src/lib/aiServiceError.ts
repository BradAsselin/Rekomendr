// src/lib/aiServiceError.ts — client-safe (no imports).
//
// A generation route that hit a NAMED OpenAI failure (out of credit, key
// refused, rate-limited, unreachable) answers `{ error, reason }` with the
// honest plain-voice copy already written. This carries that copy from the
// fetch site to the screen so the user reads what actually happened
// instead of "give it another go". Anything without a `reason` is not a
// service failure and keeps each surface's existing behavior.

export class AIServiceError extends Error {
  reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.name = "AIServiceError";
    this.reason = reason;
    // Keep instanceof/duck-typing honest under any downlevel target.
    Object.setPrototypeOf(this, AIServiceError.prototype);
  }
}

// Duck-typed on purpose: survives class downleveling and cross-bundle
// instances alike.
export function isAIServiceError(err: unknown): err is AIServiceError {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { name?: unknown }).name === "AIServiceError" &&
    typeof (err as { reason?: unknown }).reason === "string"
  );
}

export function serviceFailureFrom(data: unknown): AIServiceError | null {
  const d = data as { error?: unknown; reason?: unknown } | null;
  if (
    d &&
    typeof d.error === "string" &&
    d.error.trim() &&
    typeof d.reason === "string"
  ) {
    return new AIServiceError(d.error, d.reason);
  }
  return null;
}

// Reads a non-OK response body once; null when it is not a named failure.
export async function readServiceFailure(
  res: Response
): Promise<AIServiceError | null> {
  try {
    return serviceFailureFrom(await res.json());
  } catch {
    return null;
  }
}
