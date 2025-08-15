// src/pages/index.tsx
import { useEffect, useRef, useState, useMemo } from "react";

type Rec = { id: string; title: string; summary: string };

const BRAND_COLOR = "#1f5fa6";
const PAGE_SIZE = 5;

export default function Home() {
  // Input + results
  const [prompt, setPrompt] = useState("");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Global helpfulness
  const [justVoted, setJustVoted] = useState<"up" | "down" | null>(null);

  // Breadcrumb (clean input, refinements live here)
  const [lastBase, setLastBase] = useState<string | null>(null);
  const [titleRefine, setTitleRefine] = useState<string | null>(null);
  const [tagRefine, setTagRefine] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus + ?q=
  useEffect(() => {
    inputRef.current?.focus();
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q");
    if (q && q.trim()) {
      getRecs(q);
    }
  }, []);

  function updateUrl(q: string) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", q);
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  async function getRecs(p?: string, opts?: { isRefine?: boolean }) {
    const effectivePrompt = (p ?? prompt).trim();
    if (!effectivePrompt) return;

    // Fresh search resets refiners; refinements don’t chain
    if (!opts?.isRefine) {
      setLastBase(effectivePrompt);
      setTitleRefine(null);
      setTagRefine(null);
    }

    updateUrl(effectivePrompt);
    setPrompt(""); // keep input visually clean
    setLoading(true);
    setErrorMsg(null);
    setRecs([]);
    setJustVoted(null);
    setPage(1);

    // track (fire-and-forget)
    try {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "search", prompt: effectivePrompt }),
      }).catch(() => {});
    } catch {}

    try {
      const resp = await fetch("/api/recs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: effectivePrompt }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { items: Rec[] };
      setRecs(data.items ?? []);
    } catch (e) {
      console.error(e);
      setErrorMsg("We couldn’t load picks. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  // Per-title refine (non-chaining)
  function refineWithTitle(title: string) {
    setTitleRefine(title);
    const base = (lastBase || "").trim();
    const refined =
      base +
      ` — more like ${title}` +
      (tagRefine ? ` — make it ${tagRefine}` : "");
    setPrompt("");
    getRecs(refined, { isRefine: true });
  }

  // Tag refiners (newer / funnier / more popular / shorter)
  function refineWithTag(tag: string) {
    setTagRefine(tag);
    const base = (lastBase || "").trim();
    const refined =
      base +
      (titleRefine ? ` — more like ${titleRefine}` : "") +
      ` — make it ${tag}`;
    setPrompt("");
    getRecs(refined, { isRefine: true });
  }

  async function handleVote(vote: "up" | "down") {
    try {
      const first = recs[0];
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vote,
          prompt: lastBase ?? "",
          itemId: first?.id,
          itemTitle: first?.title,
          itemSummary: first?.summary,
          userId: null,
        }),
      });
      if (!res.ok) throw new Error("Vote failed");
      setJustVoted(vote);

      // track vote
      try {
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "vote", prompt: lastBase ?? "" }),
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

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !loading) getRecs();
  }

  return (
    <main
      style={{
        maxWidth: 900,
        margin: "3rem auto",
        padding: "0 1rem 4rem",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial',
        color: "#1c2530",
      }}
    >
      {/* Brand */}
      <div style={{ textAlign: "center", marginTop: "2vh", marginBottom: 18 }}>
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
        <div style={{ marginTop: 8, opacity: 0.8 }}>
          Type anything — we’ll find it.
        </div>
      </div>

      {/* Hero input */}
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
          onKeyDown={onEnter}
          placeholder="What can I find for you?"
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
      </div>

      {/* Breadcrumb chips */}
      {(lastBase || titleRefine || tagRefine) && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            gap: 8,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {lastBase && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #d6dce3",
                background: "#fff",
                fontWeight: 600,
              }}
              title={lastBase}
            >
              {lastBase}
            </span>
          )}
          {titleRefine && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e2e6ec",
                background: "#f8fafc",
                opacity: 0.9,
              }}
            >
              more like <strong style={{ marginLeft: 4 }}>{titleRefine}</strong>
            </span>
          )}
          {tagRefine && (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #e2e6ec",
                background: "#f8fafc",
                opacity: 0.9,
              }}
            >
              make it <strong style={{ marginLeft: 4 }}>{tagRefine}</strong>
            </span>
          )}
        </div>
      )}

      {/* Helper chips (hide once results appear) */}
      {recs.length === 0 && (
        <div
          style={{
            marginTop: 14,
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {[
            'Show me some rom-coms',
            'I just finished "The Bear"',
            "I’d like a bottle of wine like Bonanza",
          ].map((s) => (
            <button
              key={s}
              onClick={() => getRecs(s)}
              style={{
                padding: "10px 12px",
                border: "1px solid #d6dce3",
                borderRadius: 999,
                background: "#fff",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                whiteSpace: "nowrap",
              }}
              title={s}
            >
              {s}
            </button>
          ))}
        </div>
      )}

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

      {/* Skeleton */}
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
              <div style={{ height: 18, width: "40%", marginBottom: 8, background: "#e9eef6", borderRadius: 6 }} />
              <div style={{ height: 12, width: "95%", marginBottom: 6, background: "#f0f4fb", borderRadius: 6 }} />
              <div style={{ height: 12, width: "88%", background: "#f0f4fb", borderRadius: 6 }} />
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
              <strong style={{ fontSize: 20 }}>{r.title}</strong>
              <div style={{ marginTop: 6, color: "#2e3a47", lineHeight: 1.5 }}>{r.summary}</div>

              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  onClick={() => refineWithTitle(r.title)}
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

                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(r.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "underline", opacity: 0.9 }}
                  title="Search the web for this title"
                >
                  Learn more
                </a>
                <span style={{ opacity: 0.4 }}>·</span>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(r.title + " trailer")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "underline", opacity: 0.9 }}
                  title="Find a trailer on YouTube"
                >
                  Trailer
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && recs.length > PAGE_SIZE && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14, justifyContent: "center" }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
            ← Prev
          </button>
          <div style={{ opacity: 0.8 }}>Page {page} of {totalPages}</div>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next →
          </button>
        </div>
      )}

      {/* Helpful? + Refiners */}
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
            <div
              style={{
                marginTop: 14,
                display: "flex",
                gap: 8,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              {["newer", "funnier", "more popular", "shorter"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => refineWithTag(tag)}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    cursor: "pointer",
                    background: "#fff",
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
