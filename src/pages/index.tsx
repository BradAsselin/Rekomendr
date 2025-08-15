// src/pages/index.tsx
import { useEffect, useMemo, useRef, useState } from "react";

type Rec = {
  id: string;
  title: string;
  summary: string;
};

const PAGE_SIZE = 5;

// Brand + UI knobs
const BRAND_COLOR = "#1f5fa6";
const ROTATING_SUGGESTIONS = [
  "Show me true crime movies",
  "I just finished Breaking Bad",
  "I’m in the mood for a silly comedy movie",
  "I just finished The Bear",
  "Find rom-coms with a happy ending",
  "I’d like a bottle of wine like Bonanza",
  "A red convertible under $40k",
];
const HINTS = [
  "Try “more like Amélie”",
  "Try “newer family movies”",
  "Try “cozy sci-fi for a date night”",
];

export default function Home() {
  const [prompt, setPrompt] = useState("Give me 5 cozy, feel-good movies");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [justVoted, setJustVoted] = useState<"up" | "down" | null>(null);
  const [page, setPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rotIndex, setRotIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const rotTimer = useRef<number | null>(null);

  // Autofocus and support shareable ?q=
  useEffect(() => {
    inputRef.current?.focus();
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q");
    if (q && q.trim()) {
      setPrompt(q);
      setTimeout(() => getRecs(q), 0);
    }
  }, []);

  // Rotate placeholder text
  useEffect(() => {
    if (rotTimer.current) window.clearInterval(rotTimer.current);
    rotTimer.current = window.setInterval(
      () => setRotIndex((i) => (i + 1) % ROTATING_SUGGESTIONS.length),
      3500
    );
    return () => {
      if (rotTimer.current) window.clearInterval(rotTimer.current);
    };
  }, []);

  function updateUrlWithPrompt(p: string) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", p);
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  // Main search (mocked data for now)
  async function getRecs(p?: string) {
    const effectivePrompt = p ?? prompt;
    if (p) setPrompt(p);
    updateUrlWithPrompt(effectivePrompt);

    setLoading(true);
    setJustVoted(null);
    setErrorMsg(null);
    setPage(1);

    const mockPool: Rec[] = [
      { id: "the-intouchables", title: "The Intouchables", summary: "A heartwarming friendship between a quadriplegic man and his caregiver." },
      { id: "about-time", title: "About Time", summary: "A romantic comedy that explores love and time travel." },
      { id: "little-miss-sunshine", title: "Little Miss Sunshine", summary: "A quirky family road trip that highlights imperfection and togetherness." },
      { id: "chef", title: "Chef", summary: "A feel-good film about a chef rediscovering his passion with his son." },
      { id: "amelie", title: "Amélie", summary: "A whimsical Parisian waitress changes lives with small acts of kindness." },
      { id: "paddington", title: "Paddington", summary: "A polite bear brings joy (and marmalade) to a London family." },
      { id: "sing-street", title: "Sing Street", summary: "1980s Dublin teen starts a band to impress a girl—pure charm." },
      { id: "julie-and-julia", title: "Julie & Julia", summary: "Cooking, blogging, and finding purpose—two timelines, one warm hug." },
      { id: "stardust", title: "Stardust", summary: "A fairy-tale adventure with humor, romance, and sky pirates." },
      { id: "the-grand-budapest-hotel", title: "The Grand Budapest Hotel", summary: "A candy-colored caper with impeccable symmetry and heart." },
    ];

    // fire-and-forget usage tracking
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "search", prompt: effectivePrompt }),
      }).catch(() => {});
    } catch {}

    try {
      await new Promise((r) => setTimeout(r, 320)); // tiny delay for shimmer
      setRecs(mockPool);
    } catch (e) {
      console.error(e);
      setErrorMsg("We’re out fishing for better picks. Try again in a sec.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVote(vote: "up" | "down") {
    try {
      const first = recs[0];
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote,
          prompt,
          itemId: first?.id,
          itemTitle: first?.title,
          itemSummary: first?.summary,
          userId: null,
        }),
      });
      if (!res.ok) throw new Error("Vote failed");
      setJustVoted(vote);

      // also track
      try {
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "vote", prompt }),
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.error(e);
      alert("Couldn’t save your vote. Try again in a sec.");
    }
  }

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return recs.slice(start, start + PAGE_SIZE);
  }, [recs, page]);

  const totalPages = Math.max(1, Math.ceil(recs.length / PAGE_SIZE));
  const currentPlaceholder = ROTATING_SUGGESTIONS[rotIndex];

  function onEnterSubmit(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !loading) getRecs();
  }

  async function copyShareLink() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", prompt);
      await navigator.clipboard.writeText(url.toString());
      alert("Link copied!");
    } catch {
      alert("Couldn’t copy. You can copy the URL from the address bar.");
    }
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "3rem auto",
        padding: "0 1rem",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        color: "#1c2530",
      }}
    >
      {/* Logo + brand */}
      <div style={{ textAlign: "center", marginTop: "3vh", marginBottom: 18 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <div
            aria-hidden
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: BRAND_COLOR,
              display: "grid",
              placeItems: "center",
              color: "#fff",
              fontWeight: 800,
              fontSize: 22,
              boxShadow: "0 8px 24px rgba(31,95,166,0.25)",
            }}
          >
            ▶
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: 0.2,
              color: BRAND_COLOR,
            }}
          >
            Rekomendr.AI
          </h1>
        </div>
      </div>

      {/* Input group (hero) */}
      <div
        style={{
          margin: "0 auto",
          maxWidth: 720,
          display: "flex",
          gap: 0,
          border: "1px solid #e1e5ea",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 10px 28px rgba(0,0,0,0.06)",
          background: "#fff",
        }}
      >
        <input
          ref={inputRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onEnterSubmit}
          placeholder={currentPlaceholder}
          aria-label="What can I find for you?"
          style={{
            flex: 1,
            padding: "16px 18px",
            fontSize: 18,
            border: "none",
            outline: "none",
          }}
        />
        <button
          onClick={() => getRecs()}
          disabled={loading}
          title="Run search"
          style={{
            padding: "0 22px",
            background: loading ? "#8aaad4" : BRAND_COLOR,
            color: "#fff",
            border: "none",
            fontWeight: 800,
            fontSize: 16,
            letterSpacing: 0.6,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "…" : "GO"}
        </button>
        <button
          onClick={copyShareLink}
          title="Copy link to this search"
          style={{
            padding: "0 16px",
            background: "#eef3fa",
            color: BRAND_COLOR,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Share
        </button>
      </div>

      {/* Try: rotating suggestion */}
      <div style={{ textAlign: "center", marginTop: 12, color: "#3b4754" }}>
        <span style={{ opacity: 0.9 }}>Try: </span>
        <button
          onClick={() => getRecs(currentPlaceholder)}
          style={{
            border: "none",
            background: "transparent",
            textDecoration: "underline",
            cursor: "pointer",
            color: BRAND_COLOR,
            fontWeight: 600,
          }}
          title="Use this suggestion"
        >
          “{currentPlaceholder}”
        </button>
      </div>

      {/* Hint chips */}
      <div
        style={{
          marginTop: 10,
          display: "flex",
          gap: 10,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {HINTS.map((h) => (
          <button
            key={h}
            onClick={() => getRecs(h)}
            style={{
              padding: "8px 12px",
              border: "1px solid #d6dce3",
              borderRadius: 999,
              background: "#fff",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
            }}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Error */}
      {errorMsg && (
        <div
          style={{
            marginTop: 18,
            padding: 14,
            border: "1px solid #f3c5c5",
            background: "#fff6f6",
            borderRadius: 12,
            maxWidth: 720,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {errorMsg}{" "}
          <button onClick={() => getRecs()} style={{ marginLeft: 8 }}>
            Try again
          </button>
        </div>
      )}

      {/* Skeleton loader */}
      {loading && (
        <div style={{ maxWidth: 760, margin: "22px auto 0" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                marginBottom: 14,
                padding: 16,
                border: "1px solid #e8edf3",
                borderRadius: 12,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <div className="shimmer" style={{ height: 18, width: "40%", marginBottom: 8, background: "#e9eef6" }} />
              <div className="shimmer" style={{ height: 12, width: "95%", marginBottom: 6, background: "#f0f4fb" }} />
              <div className="shimmer" style={{ height: 12, width: "88%", background: "#f0f4fb" }} />
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!loading && (
        <div style={{ marginTop: 22, maxWidth: 760, marginLeft: "auto", marginRight: "auto" }}>
          {paged.map((r) => (
            <div
              key={r.id}
              style={{
                marginBottom: 16,
                padding: 16,
                border: "1px solid #e8edf3",
                borderRadius: 14,
                background: "#fff",
                boxShadow: "0 6px 20px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <strong style={{ fontSize: 20 }}>{r.title}</strong>
              </div>
              <div style={{ marginTop: 6, color: "#2e3a47", lineHeight: 1.5 }}>
                {r.summary}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                <button
                  onClick={() => getRecs(`${prompt} — more like ${r.title}`)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #ccd6e2",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: "#fff",
                  }}
                  title="Refine with this title"
                >
                  More like this
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && recs.length > PAGE_SIZE && (
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 14,
            justifyContent: "center",
          }}
        >
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Prev
          </button>
          <div style={{ opacity: 0.8 }}>Page {page} of {totalPages}</div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* Helpful? (thumbs) */}
      {!loading && recs.length > 0 && (
        <div style={{ marginTop: 18, textAlign: "center" }}>
          <div style={{ marginBottom: 6 }}>Helpful?</div>
          <div style={{ display: "inline-flex", gap: 10 }}>
            <button onClick={() => handleVote("up")} disabled={!!justVoted} title="Yes">
              👍 Yes
            </button>
            <button onClick={() => handleVote("down")} disabled={!!justVoted} title="No">
              👎 No
            </button>
          </div>

          {justVoted && (
            <div style={{ marginTop: 8, opacity: 0.8 }}>
              Thanks! Logged your feedback ({justVoted === "up" ? "👍" : "👎"}).
            </div>
          )}

          {justVoted === "down" && (
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <span>Not quite right?</span>
              {["newer", "funnier", "more popular", "shorter"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => getRecs(`${prompt} — make it ${tag}`)}
                  style={{ padding: "6px 10px", border: "1px solid #ccc", borderRadius: 6 }}
                >
                  {tag === "newer"
                    ? "Something newer"
                    : tag === "funnier"
                    ? "Something funnier"
                    : tag === "more popular"
                    ? "More popular"
                    : "Shorter runtime"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* tiny shimmer CSS + mobile tweaks */}
      <style>{`
        .shimmer { position: relative; overflow: hidden; }
        .shimmer::after {
          content: ""; position: absolute; inset: 0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
          animation: shimmer 1.2s infinite;
        }
        @keyframes shimmer { 100% { transform: translateX(100%); } }

        @media (max-width: 480px) {
          h1 { font-size: 34px !important; }
          input { font-size: 16px !important; padding: 14px 14px !important; }
          button { font-size: 16px; }
        }
      `}</style>
    </main>
  );
}
