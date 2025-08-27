// src/components/ResultsV4.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/** -------------------------------
 *  Types
 *  ------------------------------- */
type Item = {
  id: string;
  title: string;
  year?: string;
  description: string;
  infoUrl?: string;
  trailerUrl?: string;
};

type FetchBody = { prompt: string; vertical: string };

type ResultsV4Props = {
  initialQuery?: string;
  initialVertical?: "movies" | "tv" | "books" | "wine" | string;
  autoRunQuery?: boolean;
};

type FeedbackSignal = "up" | "down";
type Feedback = { itemId: string; title: string; year?: string; signal: FeedbackSignal };

/** -------------------------------
 *  Session / Storage helpers
 *  ------------------------------- */
const SESSION_KEY = "rekomendr.sessionId.v1";
const FEEDBACK_KEY = "rekomendr.sessionFeedback.v1";

function ensureSessionId(): string {
  if (typeof window === "undefined") return "server";
  let sid = window.localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

function loadFeedback(): Feedback[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FEEDBACK_KEY);
    return raw ? (JSON.parse(raw) as Feedback[]) : [];
  } catch {
    return [];
  }
}

function saveFeedback(list: Feedback[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list));
}

function clearFeedback() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(FEEDBACK_KEY);
}

/** -------------------------------
 *  Icons — outline, consistent geometry
 *  ------------------------------- */
function IconThumbUpOutline({ className = "w-5 h-5" }) {
  return (
    <svg
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.25 9V5.75A2.75 2.75 0 0 0 11.5 3L8.91 8.023a2 2 0 0 1-.186.306l-.007.01c-.312.427-.468.64-.596.844A3 3 0 0 0 8 10.1V18a2 2 0 0 0 2 2h5.764c1.332 0 2.523-.86 2.897-2.137l1.74-5.957A2.25 2.25 0 0 0 18.257 9H14.25Z"
      />
      <path
        d="M7.5 10.5v8.25A1.25 1.25 0 0 1 6.25 20H5A1.25 1.25 0 0 1 3.75 18.75v-7A1.25 1.25 0 0 1 5 10.5h2.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconThumbDownOutline({ className = "w-5 h-5" }) {
  return (
    <svg
      className={className}
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.75 15v3.25A2.75 2.75 0 0 0 12.5 21l2.59-5.023a2 2 0 0 1 .186-.306l.007-.01c.312-.427.468-.64.596-.844.379-.606.493-1.132.493-1.917V5a2 2 0 0 0-2-2H8.608C7.276 3 6.085 3.86 5.711 5.137l-1.74 5.957A2.25 2.25 0 0 0 5.743 15H9.75Z"
      />
      <path
        d="M16.5 13.5V5.25A1.25 1.25 0 0 1 17.75 4H19a1.25 1.25 0 0 1 1.25 1.25v7A1.25 1.25 0 0 1 19 13.5h-2.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** -------------------------------
 *  Component
 *  ------------------------------- */
const ResultsV4: React.FC<ResultsV4Props> = ({
  initialQuery = "",
  initialVertical = "movies",
  autoRunQuery = false,
}) => {
  // ensure session id exists
  useMemo(ensureSessionId, []);

  const [vertical, setVertical] = useState<string>(initialVertical || "movies");
  const [prompt, setPrompt] = useState<string>(initialQuery || "");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [showSignInNudge, setShowSignInNudge] = useState(false);
  const nudgeShownRef = useRef(false);

  // dynamic chips
  const [selectedChips, setSelectedChips] = useState<string[]>([]);

  useEffect(() => {
    setFeedback(loadFeedback());
  }, []);

  useEffect(() => {
    if (autoRunQuery && (initialQuery || initialVertical)) {
      fetchRecs({ mode: "seed" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dislikedTitles = useMemo(
    () =>
      new Set(
        feedback
          .filter((f) => f.signal === "down")
          .map((f) => `${f.title}${f.year ? ` (${f.year})` : ""}`)
      ),
    [feedback]
  );

  const hasAnyThumbs = feedback.length > 0;

  const filteredItems = useMemo(() => {
    if (!items.length || dislikedTitles.size === 0) return items;
    return items.filter((it) => !dislikedTitles.has(`${it.title}${it.year ? ` (${it.year})` : ""}`));
  }, [items, dislikedTitles]);

  /** -------------------------------
   *  Suggestion chips (client-only heuristics)
   *  ------------------------------- */
  const SUGGESTION_DEFS: Array<{ key: string; label: string; test: (s: string) => boolean }> = useMemo(
    () => [
      { key: "feel-good", label: "feel-good", test: s => /heartwarming|uplifting|feel[- ]?good|redemption|friendship/i.test(s) },
      { key: "mind-bending", label: "mind-bending", test: s => /dream|memory|time|twist|puzzle|mind[- ]?bend/i.test(s) },
      { key: "true-crime", label: "true crime vibe", test: s => /crime|trial|murder|case|detective|investigat/i.test(s) },
      { key: "critically-acclaimed", label: "critically acclaimed", test: s => /acclaimed|award|oscar|masterpiece|critically/i.test(s) },
      { key: "hidden-gems", label: "hidden gems", test: s => /overlooked|underrated|cult|gem/i.test(s) },
      { key: "based-on-book", label: "based on a book", test: s => /novel|based on the book|adapted/i.test(s) },
      { key: "funnier", label: "laugh-out-loud", test: s => /comedy|hilarious|funny|satire/i.test(s) },
      { key: "darker", label: "darker", test: s => /dark|gritty|noir|bleak/i.test(s) },
      // runtime toggles available even if heuristic doesn't detect
      { key: "shorter", label: "shorter", test: _ => false },
      { key: "longer", label: "longer", test: _ => false },
    ],
    []
  );

  const suggestedChips = useMemo(() => {
    if (!items.length) return [];
    const text = items.map(i => `${i.title} ${i.year ?? ""}. ${i.description}`).join(" \n");
    const hits = SUGGESTION_DEFS.filter(def => def.test(text));
    const fallback = SUGGESTION_DEFS.filter(def => ["critically-acclaimed","hidden-gems","based-on-book"].includes(def.key));
    const merged = Array.from(new Map([...hits, ...fallback].map(d => [d.key, d])).values());
    return merged.slice(0, 6);
  }, [items, SUGGESTION_DEFS]);

  function toggleChip(key: string) {
    setSelectedChips(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function clearRefinements() {
    setSelectedChips([]);
    setFeedback([]);
    clearFeedback();
  }

  /** -------------------------------
   *  Fetch Helpers
   *  ------------------------------- */
  async function fetchRecs(opts?: { mode?: "seed" | "refine" }) {
    setLoading(true);
    setError(null);

    // Base prompt
    let effectivePrompt = prompt?.trim();
    if (!effectivePrompt) {
      effectivePrompt = `Find 5 popular ${vertical}`;
    }

    // Refine with session thumbs
    if (opts?.mode === "refine" && hasAnyThumbs) {
      const ups = feedback.filter((f) => f.signal === "up").slice(-6);
      const downs = feedback.filter((f) => f.signal === "down").slice(-10);

      if (ups.length) {
        const likeList = ups.map(f => `${f.title}${f.year ? ` (${f.year})` : ""}`).join(", ");
        effectivePrompt += `. Prefer items similar to: ${likeList}. Keep it fresh; avoid near-duplicates.`;
      }
      if (downs.length) {
        const avoidList = downs.map(f => `${f.title}${f.year ? ` (${f.year})` : ""}`).join(", ");
        effectivePrompt += ` Avoid: ${avoidList}.`;
      }
    }

    // Fold in chips (either mode can include chips)
    if (selectedChips.length) {
      const labels = selectedChips
        .map(k => SUGGESTION_DEFS.find(d => d.key === k)?.label ?? k)
        .join(", ");
      effectivePrompt += `. Bias toward: ${labels}.`;
      if (selectedChips.includes("shorter")) effectivePrompt += " Prefer runtime under ~110 minutes.";
      if (selectedChips.includes("longer")) effectivePrompt += " Prefer epic/longer titles over ~140 minutes.";
    }

    // Always add soft exclude for all 👎 this session
    if (dislikedTitles.size > 0) {
      const avoid = Array.from(dislikedTitles).slice(0, 10).join(", ");
      effectivePrompt += ` Avoid: ${avoid}.`;
    }

    try {
      const res = await fetch("/api/recs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effectivePrompt, vertical } as FetchBody),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const nextItems: Item[] = Array.isArray(data) ? data : data.items ?? [];
      setItems(nextItems);
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  /** -------------------------------
   *  Thumb actions (no auto-fetch)
   *  ------------------------------- */
  function recordFeedback(item: Item, signal: FeedbackSignal) {
    const entry: Feedback = { itemId: item.id, title: item.title, year: item.year, signal };
    const next = [...feedback, entry];
    setFeedback(next);
    saveFeedback(next);

    if (!nudgeShownRef.current) {
      nudgeShownRef.current = true;
      setShowSignInNudge(true);
      setTimeout(() => setShowSignInNudge(false), 3500);
    }
  }

  function onLike(item: Item) {
    recordFeedback(item, "up");
  }

  function onDislike(item: Item) {
    recordFeedback(item, "down");
  }

  /** -------------------------------
   *  Render
   *  ------------------------------- */
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Header / Query Row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What can I find for you?"
          className="w-full rounded-2xl border border-gray-300 px-4 py-3 outline-none focus:border-black"
        />
        <select
          value={vertical}
          onChange={(e) => setVertical(e.target.value)}
          className="rounded-2xl border border-gray-300 px-3 py-3 outline-none focus:border-black"
        >
          <option value="movies">Movies</option>
          <option value="tv">TV Shows</option>
          <option value="books">Books</option>
          <option value="wine">Wine</option>
        </select>
        <button
          onClick={() => fetchRecs({ mode: "seed" })}
          className="rounded-2xl px-5 py-3 bg-black text-white shadow hover:shadow-md active:translate-y-px"
        >
          GO
        </button>
      </div>

      {showSignInNudge && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          Like what you see? <span className="font-medium">Sign in</span> to save your picks across sessions.
        </div>
      )}

      {loading && (
        <div className="rounded-2xl border border-gray-200 px-4 py-6 text-sm">
          Finding your next favorite…
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      <div className="space-y-4">
        {filteredItems.map((it) => (
          <div
            key={it.id}
            className="rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow"
          >
            {/* Title row with right-aligned hollow thumbs */}
            <div className="flex items-center gap-3">
              <div className="text-lg font-semibold leading-snug">
                {it.title}
                {it.year ? <span className="text-gray-500"> ({it.year})</span> : null}
              </div>

              <div className="ml-auto flex items-center gap-3">
                <button
                  onClick={() => onLike(it)}
                  aria-label="Like"
                  className="group rounded-full p-1 outline-none ring-0 transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-black"
                  title="Mark as Like (will refine when you press Next)"
                >
                  <IconThumbUpOutline className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onDislike(it)}
                  aria-label="Dislike"
                  className="group rounded-full p-1 outline-none ring-0 transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-black"
                  title="Mark as Dislike (will refine when you press Next)"
                >
                  <IconThumbDownOutline className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Description */}
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{it.description}</p>

            {/* Inline actions */}
            <div className="mt-2 text-sm text-gray-600">
              <button
                onClick={() => onLike(it)}
                className="underline underline-offset-4 hover:no-underline"
                title="Shortcut to Like (use Next to refine)"
              >
                + More like this
              </button>
              {it.trailerUrl ? (
                <>
                  <span className="mx-2">•</span>
                  <a
                    href={it.trailerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4 hover:no-underline"
                  >
                    ▶ Trailer
                  </a>
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom controls: chips (left) + Clear + Next/More (right) */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Chips + Clear */}
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
          {suggestedChips.map(def => {
            const active = selectedChips.includes(def.key);
            return (
              <button
                key={def.key}
                onClick={() => toggleChip(def.key)}
                className={`rounded-full border px-3 py-1 transition ${
                  active ? "bg-black text-white border-black" : "border-gray-300 hover:border-black"
                }`}
                title={active ? "Selected" : "Add to refine"}
              >
                {def.label}
              </button>
            );
          })}
          {(hasAnyThumbs || selectedChips.length) ? (
            <button
              onClick={clearRefinements}
              className="ml-1 rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:border-black transition"
              title="Clear chips & session thumbs"
            >
              Clear
            </button>
          ) : null}
        </div>

        {/* Next/More */}
        <div className="flex justify-end">
          <button
            onClick={() => fetchRecs({ mode: (hasAnyThumbs || selectedChips.length) ? "refine" : "seed" })}
            className="rounded-2xl px-5 py-3 bg-black text-white shadow hover:shadow-md active:translate-y-px"
            title={(hasAnyThumbs || selectedChips.length) ? "Use your picks & chips to refine" : "Get more results"}
          >
            {(hasAnyThumbs || selectedChips.length) ? "Next" : "More"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsV4;
