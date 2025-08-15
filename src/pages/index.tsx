// src/pages/index.tsx
import { useState } from "react";

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

export default function Home() {
  const [prompt, setPrompt] = useState("Give me 5 cozy, feel-good movies");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [justVoted, setJustVoted] = useState<"up" | "down" | null>(null);

  // Accept an optional prompt so refine chips can pass a modified one.
  async function getRecs(p?: string) {
    const effectivePrompt = p ?? prompt;
    if (p) setPrompt(p);

    setLoading(true);
    setJustVoted(null);

    // Mocked results for now
    const mock: Rec[] = [
      {
        id: "the-intouchables",
        title: "The Intouchables",
        summary:
          "A heartwarming friendship between a quadriplegic man and his caregiver.",
      },
      {
        id: "about-time",
        title: "About Time",
        summary:
          "A romantic comedy that explores love and time travel.",
      },
      {
        id: "little-miss-sunshine",
        title: "Little Miss Sunshine",
        summary:
          "A quirky family road trip that highlights imperfection and togetherness.",
      },
      {
        id: "chef",
        title: "Chef",
        summary:
          "A feel-good film about a chef rediscovering his passion with his son.",
      },
      {
        id: "amelie",
        title: "Amélie",
        summary:
          "A whimsical Parisian waitress changes lives with small acts of kindness.",
      },
    ];

    // 🔎 Debug log
    console.log("Sending track event:", effectivePrompt);

    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "search", prompt: effectivePrompt }),
      });
      const data = await res.json();
      console.log("Track response:", data);
    } catch (err) {
      console.error("Track failed:", err);
    }

    await new Promise((r) => setTimeout(r, 300));
    setRecs(mock);
    setLoading(false);

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

      // Also log to usage_events
      try {
        await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "vote", prompt }),
        });
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

      <div style={{ marginTop: 16 }}>
        {recs.map((r) => (
          <div key={r.id} style={{ marginBottom: 12 }}>
            <strong>{r.title}</strong>
            <div>{r.summary}</div>
          </div>
        ))}
      </div>

      {recs.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 6 }}>Helpful?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => handleVote("up")} disabled={!!justVoted} title="Yes">
              👍 Yes
            </button>
            <button
              onClick={() => handleVote("down")}
              disabled={!!justVoted}
              title="No"
            >
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
                  onClick={() => {
                    const refined = `${prompt} — make it ${tag}`;
                    getRecs(refined);
                  }}
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
