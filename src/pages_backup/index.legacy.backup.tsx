import React, { useMemo, useState } from "react";
import { useRouter } from "next/router";

// Colors
const BLUE = "#1D4ED8"; // Tailwind blue-700-ish

// --- Blue Play in a left box (Surprise button) ---
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
  return (
    <span className="flex h-12 w-16 flex-none items-center justify-center rounded-xl bg-blue-600 font-semibold text-white select-none">GO</span>
  );
}

const SUGGESTIONS_BY_VERTICAL: Record<string, string[]> = {
  movies: [
    "Movies like The Grand Seduction",
    "Smart, feel‑good comedies",
    "Dark thrillers with a twist",
  ],
  tv: [
    "Detective series with clever writing",
    "Prestige dramas under 10 eps",
    "Sci‑fi workplace mind-benders",
  ],
  wine: [
    "Bold, fruit‑forward California Cabernet",
    "Crisp, mineral‑driven Sauvignon Blanc",
    "Value reds under $20",
  ],
  books: [
    "Quiet, character‑driven novels",
    "Page‑turner mysteries",
    "Short, inspiring nonfiction",
  ],
};

const BUBBLES: Array<{ label: string; value: keyof typeof SUGGESTIONS_BY_VERTICAL }> = [
  { label: "Movies", value: "movies" },
  { label: "TV Shows", value: "tv" },
  { label: "Wine", value: "wine" },
  { label: "Books", value: "books" },
];

export default function FrontDoorPage() {
  const router = useRouter();
  const [vertical, setVertical] = useState<(typeof BUBBLES)[number]["value"]>("movies");
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState<string>(""); // latest surprise text

  // Choose a random suggestion for the current vertical (insert-only)
  function surprise() {
    const list = SUGGESTIONS_BY_VERTICAL[vertical] ?? [];
    const pick = list[Math.floor(Math.random() * list.length)] || "Surprise me";
    setSeed(pick);
    setQuery(pick); // insert only; no submit
  }

  function submit(q?: string) {
    const text = (q ?? query ?? seed).trim();
    const finalQ = text.length ? text : (SUGGESTIONS_BY_VERTICAL[vertical]?.[0] || "");
    router.push(`/results?q=${encodeURIComponent(finalQ)}&v=${encodeURIComponent(vertical)}`);
  }

  function handleGo(e?: React.FormEvent) {
    e?.preventDefault();
    submit();
  }

  function handleBubbleClick(v: (typeof BUBBLES)[number]["value"]) {
    setVertical(v);
    // Immediate seed browse for selected vertical (no query)
    router.push(`/results?v=${encodeURIComponent(v)}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header text-only logo */}
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Rekomendr.AI</h1>
        <p className="mt-1 text-gray-600">It’s like we read your mind. But better.</p>

        {/* Search Row: Play | Input | GO */}
        <form onSubmit={handleGo} className="mt-8">
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

        {/* Bubbles */}
        <div className="mt-5 flex flex-wrap gap-2">
          {BUBBLES.map((b) => {
            const active = vertical === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => handleBubbleClick(b.value)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  active
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-600"
                    : "bg-white text-gray-800 ring-1 ring-gray-300 hover:bg-gray-50"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-gray-500">5 free guest recs · 10 when signed in · Unlimited on paid</p>
      </div>
    </div>
  );
}

/*
WIRING (Next.js, pages/):

• This file should live at: src/pages/index.tsx

• Results wrapper (create if missing):

// src/pages/results.tsx
import { useRouter } from "next/router";
import React from "react";
import ResultsV4 from "../components/ResultsV4";

export default function ResultsPage() {
  const router = useRouter();
  const q = typeof router.query.q === "string" ? router.query.q : "";
  const v = typeof router.query.v === "string" ? router.query.v : "";
  // Later: fetch seed via /api/seed?v=...&tier=...; for now ResultsV4 can ignore q/v or show them.
  return <ResultsV4 />;
}

• Behavior confirmations (locked v1):
  – Play inserts suggestion only; does not auto-submit.
  – Any new Play press replaces current text.
  – Typing overwrites whatever is in the input.
  – Clicking a bubble immediately navigates to /results?v=... and shows 5 starter recs for that vertical.
*/
