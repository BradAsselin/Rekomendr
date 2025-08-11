"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import ResultCard from "../components/ResultCard";

function useTokenCounter() {
  const [used, setUsed] = useState<number>(0);
  const [monthKey, setMonthKey] = useState<string>("");

  useEffect(() => {
    const now = new Date();
    const key = `rk_tokens_used_month_${now.getFullYear()}${String(
      now.getMonth() + 1
    ).padStart(2, "0")}`;
    setMonthKey(key);
    const current = Number(localStorage.getItem(key) || "0");
    setUsed(current);
  }, []);

  const increment = () => {
    if (!monthKey) return;
    const next = used + 1;
    setUsed(next);
    localStorage.setItem(monthKey, String(next));
  };

  return { used, increment };
}

type Action = { label: string; href: string };
type Rec = { id: string; title: string; description: string; actions: Action[] };

export default function HomePage() {
  const searchParams = useSearchParams();
  const [prompt, setPrompt] = useState("");
  const [category, setCategory] = useState("universal");
  const [refine, setRefine] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const booted = useRef(false); // prevent double-run

  const { used, increment } = useTokenCounter();
  const tokenText = useMemo(() => `${used} of 5 free recs used`, [used]);

  async function run(promptText: string, refineText?: string) {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText, category, refine: refineText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Server error: ${res.status}`);
      }
      const data = await res.json();
      setResults(data.results || []);
      increment();
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-run from URL params: ?q=...&cat=...
  useEffect(() => {
    if (booted.current) return;
    const q = searchParams?.get("q") ?? "";
    const catParam = searchParams?.get("cat") ?? "";
    if (catParam) setCategory(catParam);
    if (q.trim()) {
      booted.current = true;
      setPrompt(q);
      Promise.resolve().then(() => run(q));
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = ["universal", "movies", "books", "restaurants", "music", "wine", "cars", "travel"];

  return (
    <main className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rekomendr.AI</h1>
        <div className="text-xs text-gray-600 border rounded-full px-3 py-1" aria-live="polite">
          {tokenText}
        </div>
      </header>

      <div className="rounded-2xl border p-4">
        <label htmlFor="prompt" className="block text-sm font-medium mb-2">
          Tell me what you want:
        </label>
        <input
          type="text"
          id="prompt"
          name="prompt"
          className="w-full rounded-xl border px-3 py-2 mb-3"
          placeholder="e.g., A twisty funny mystery like A Simple Favor"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && prompt.trim() && !loading) run(prompt.trim(), refine);
          }}
          autoComplete="off"
          aria-label="Search prompt"
        />

        {/* Optional category hint — purely cosmetic for now */}
        <div className="flex gap-2 mb-3 flex-wrap" role="group" aria-label="Category">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              name="category"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`text-xs rounded-full px-3 py-1 border ${category === c ? "bg-gray-100" : ""}`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={!prompt.trim() || loading}
            onClick={() => run(prompt.trim(), refine)}
            className="rounded-xl px-4 py-2 border text-sm font-medium hover:bg-gray-50 active:scale-[.99] disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Get 5 recommendations"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPrompt("");
              setRefine(undefined);
              setResults([]);
              setError("");
            }}
            className="rounded-xl px-3 py-2 border text-sm hover:bg-gray-50"
          >
            Reset
          </button>
        </div>

        {/* Quick refine chips */}
        {results.length > 0 && (
          <div className="mt-3 flex gap-2 flex-wrap" role="group" aria-label="Refine results">
            {["Funnier", "Shorter", "More mainstream", "Darker", "Surprise me"].map((r) => (
              <button
                key={r}
                type="button"
                className="text-xs rounded-full px-3 py-1 border hover:bg-gray-50"
                onClick={() => {
                  setRefine(r);
                  if (prompt.trim() && !loading) run(prompt.trim(), r);
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 p-3 text-sm" role="alert">
          {error} — try a simpler prompt or hit Reset.
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div className="text-sm text-gray-600">
          Tip: Be specific but short. After results, use the refine chips to iterate.
        </div>
      )}

      <section className="grid gap-3">
        {results.map((rec) => (
          <ResultCard key={rec.id} rec={rec} />
        ))}
      </section>

      <footer className="text-[11px] text-gray-500 pt-4">
        © {new Date().getFullYear()} Rekomendr.AI • Placeholder Privacy & Terms
      </footer>
    </main>
  );
}
