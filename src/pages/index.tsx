// src/pages/index.tsx
import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import SoftWallNudge from "../components/SoftWallNudge";
import { beginChain, getTier, type Tier } from "../lib/softWall";

const SUGGESTIONS_BY_VERTICAL: Record<string, string[]> = {
  movies: ["Movies like The Grand Seduction", "Smart, feel-good comedies", "Dark thrillers with a twist"],
  tv: ["Detective series with clever writing", "Prestige dramas under 10 eps", "Sci-fi workplace mind-benders"],
  wine: ["Bold, fruit-forward California Cabernet", "Crisp, mineral-driven Sauvignon Blanc", "Value reds under $20"],
  books: ["Quiet, character-driven novels", "Page-turner mysteries", "Short, inspiring nonfiction"],
};
const BUBBLES = [
  { label: "Movies", value: "movies" },
  { label: "TV Shows", value: "tv" },
  { label: "Wine", value: "wine" },
  { label: "Books", value: "books" },
] as const;

function PlaySquare({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Surprise me"
      title="Surprise me"
      className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
        <path d="M8 5.5v13l10-6.5-10-6.5z" />
      </svg>
    </button>
  );
}
function GoSquare() {
  return <span className="flex h-12 w-16 flex-none items-center justify-center rounded-xl bg-blue-600 font-semibold text-white select-none">GO</span>;
}

export default function FrontDoorPage() {
  const router = useRouter();
  const [vertical, setVertical] = useState<(typeof BUBBLES)[number]["value"]>("movies");
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState<string>("");
  const [nudge, setNudge] = useState<{ open: boolean; count: number; limit: number; tier: Tier } | null>(null);

  // Support `/?prefill=...` to gently steer users (insert-only, no auto-submit)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      const pre = url.searchParams.get("prefill");
      if (pre) setQuery(pre);
    } catch {}
  }, []);

  function surprise() {
    const list = SUGGESTIONS_BY_VERTICAL[vertical] ?? [];
    const pick = list[Math.floor(Math.random() * list.length)] || "Surprise me";
    setSeed(pick);
    setQuery(pick); // insert only; no submit
  }

  function routeToResults(finalQ: string) {
    router.push(`/results?q=${encodeURIComponent(finalQ)}&v=${encodeURIComponent(vertical)}`);
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = (query || seed || "").trim();
    const finalQ = text.length ? text : (SUGGESTIONS_BY_VERTICAL[vertical]?.[0] || "");

    // Start a new CHAIN and count quota once
    const { gate, chain } = beginChain({ vertical, baseQuery: finalQ });
    if (!gate.allowed) {
      setNudge({ open: true, count: gate.count, limit: gate.limit, tier: gate.tier });
      return;
    }
    routeToResults(finalQ);
  }

  function handleBubbleClick(v: (typeof BUBBLES)[number]["value"]) {
    setVertical(v);
    // Bubbles show seeds (do not consume quota, do not start a chain yet)
    router.push(`/results?v=${encodeURIComponent(v)}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Rekomendr.AI</h1>
        <p className="mt-1 text-gray-600">It’s like we read your mind. But better.</p>

        <form onSubmit={submit} className="mt-8">
          <div className="flex items-center gap-2">
            <PlaySquare onClick={surprise} />
            <input
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-3 text-gray-900 outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="What can I find for you?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-xl">
              <GoSquare />
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {BUBBLES.map((b) => {
            const active = vertical === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => handleBubbleClick(b.value)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600" : "bg-white text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-gray-500">5 free guest chains · 10 when signed in · Unlimited on paid</p>
      </div>

      {nudge?.open && (
        <SoftWallNudge
          count={nudge.count}
          limit={nudge.limit}
          tier={nudge.tier}
          onClose={() => setNudge(null)}
          onSignIn={() => {
            setNudge(null);
            router.push("/signin");
          }}
          onUpgrade={() => {
            setNudge(null);
            router.push("/upgrade");
          }}
        />
      )}
    </div>
  );
}
