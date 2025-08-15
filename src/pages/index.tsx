// src/pages/index.tsx
import { useEffect, useMemo, useState } from "react";

type Rec = {
  id: string;
  title: string;
  summary: string;
};

const FREE_LIMIT = 5;

const EDITORS_PICK = {
  title: "This Week’s Surprise: Safety Not Guaranteed (2012)",
  blurb:
    "Deadpan indie mystery with a true-crime-adjacent vibe—quirky, quick, and surprisingly sweet.",
  link: "https://www.justwatch.com/us/movie/safety-not-guaranteed",
};

const PAGE_SIZE = 5;

export default function Home() {
  const [prompt, setPrompt] = useState("Give me 5 cozy, feel-good movies");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [justVoted, setJustVoted] = useState<"up" | "down" | null>(null);
  const [page, setPage] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Read ?q= from the URL on first load; auto-run a search if present.
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q");
    if (q && q.trim().length > 0) {
      setPrompt(q);
      // tiny delay so input reflects before search
      setTimeout(() => getRecs(q), 0);
    }
  }, []);

  // Keep the address bar in sync when we search/refine
  function updateUrlWithPrompt(p: string) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", p);
      window.history.replaceState({}, "", url.toString());
    } catch {
      // non-fatal
    }
  }

  // Accept an optional prompt so refine actions can pass a modified one.
  async function getRecs(p?: string) {
    const effectivePrompt = p ?? prompt;
    if (p) setPrompt(p);
    updateUrlWithPrompt(effectivePrompt);

    setLoading(true);
    setJustVoted(null);
    setErrorMsg(null);
    setPage(1);

    // Mocked results for now — expanded to demonstrate pagination
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
      { id: "the-princess-bride", title: "The Princess Bride", summary: "As you wish—classic adventure, wit, and true love." },
      { id: "midnight-in-paris", title: "Midnight in Paris", summary: "A nostalgic stroll through literary Paris after dark." },
      { id: "hunt-for-the-wilderpeople", title: "Hunt for the Wilderpeople", summary: "A misfit boy and grumpy guardian go bush—heart and laughs." },
      { id: "bend-it-like-beckham", title: "Bend It Like Beckham", summary: "Chasing dreams, cultural clashes, and joyous football." },
      { id: "la-la-land", title: "La La Land", summary: "Love, jazz, and big dreams in modern LA." },
    ];

    // 🔎 Track the search (non-blocking)
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "search", prompt: effectivePrompt }),
      }).catch(() => {});
    } catch {}

    try {
      // tiny delay for UX realism
      await new Promise((r) => setTimeout(r, 250));
      setRecs(mockPool.slice(0, 10)); // show 10 to make pagination obvious
    } catch (e) {
      console.error(e);
      setErrorMsg("We’re out fishing for better picks. Try again in a sec.");
    } finally {
      setLoading(false);
    }

    // Local-only free token counter
    try {
      const used = Number(localStorage.getItem("free_used") || "0") + 1;
      localStorage.setItem("free_used", String(used));
    } catch {}
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

      // Also log to usage_events (non-blocking)
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

  const usedCount =
    typeof window !== "undefined"
      ? Number(localStorage.getItem("free_used") || "0")
      : 0;

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return recs.slice(start, start + PAGE_SIZE);
  }, [recs, page]);

  const totalPages = Math.max(1, Math.ceil(recs.length / PAGE_SIZE));

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "2rem auto",
        padding: "0 1rem",
        lineHeight: 1.5,
      }}
    >
      <h1 style={{ fontSize: 36, marginBottom: 8 }}>Rekomendr</h1>
      <p>Type a request and I’ll generate tailored recommendations.</p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ flex: 1, padding: "6px 8px" }}
          placeholder="Try: 'Red BMW convertible under $40k'"
        />
        <button
          onClick={() => getRecs()}
          disabled={loading}
          style={{ padding: "6px 10px" }}
          title="Run search"
        >
          {loading ? "Working..." : "Get Recs"}
        </button>
      </div>

      <div style={{ marginTop: 6, opacity: 0.8 }}>
        {Math.min(usedCount, FREE_LIMIT)} of {FREE_LIMIT} free recs used
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 12,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <div style={{ fontWeight: 600 }}>{EDITORS_PICK.title}</div>
        <div>{EDITORS_PICK.blurb}</div>
        <a href={EDITORS_PICK.link} target="_blank" rel="noreferrer">
          Where to watch
        </a>
      </div>

      {/* Error state */}
      {errorMsg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #f3c5c5",
            background: "#fff6f6",
            borderRadius: 10,
          }}
        >
          {errorMsg}{" "}
          <button onClick={() => getRecs()} style={{ marginLeft: 8 }}>
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      <div style={{ marginTop: 16 }}>
        {paged.map((r) => (
          <div key={r.id} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #eee" }}>
            <strong>{r.title}</strong>
            <div>{r.summary}</div>
            <div style={{ marginTop: 6 }}>
              <button
                onClick={() => getRecs(`${prompt} — more like ${r.title}`)}
                style={{ padding: "4px 8px", border: "1px solid #ccc", borderRadius: 6 }}
                title="Refine with this title"
              >
                More like this
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {recs.length > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Prev
          </button>
          <div style={{ opacity: 0.8 }}>
            Page {page} of {totalPages}
          </div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* Helpful? (thumbs) */}
      {recs.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 6 }}>Helpful?</div>
          <div style={{ display: "flex", gap: 8 }}>
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
            <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>Not quite right?</span>
              {["newer", "funnier", "more popular", "shorter"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => getRecs(`${prompt} — make it ${tag}`)}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #ccc",
                    borderRadius: "6px",
                  }}
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
    </main>
  );
}
