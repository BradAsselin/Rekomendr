
// FILE: src/hooks/useLegacySearch.ts
// Purpose: Extracted logic from old pages/index.tsx (search, refine, vote, paging)
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";

export type Rec = { id: string; title: string; summary: string };

const PAGE_SIZE = 5;

export function useLegacySearch() {
  const [prompt, setPrompt] = useState("");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [justVoted, setJustVoted] = useState<"up" | "down" | null>(null);

  const [lastBase, setLastBase] = useState<string | null>(null);
  const [titleRefine, setTitleRefine] = useState<string | null>(null);
  const [tagRefine, setTagRefine] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus + ?q=
  useEffect(() => {
    inputRef.current?.focus?.();
    try {
      const url = new URL(window.location.href);
      const q = url.searchParams.get("q");
      if (q && q.trim()) {
        getRecs(q);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    if (!opts?.isRefine) {
      setLastBase(effectivePrompt);
      setTitleRefine(null);
      setTagRefine(null);
    }

    updateUrl(effectivePrompt);
    setPrompt("");
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

  function refineWithTitle(title: string) {
    setTitleRefine(title);
    const base = (lastBase || "").trim();
    const refined = base + ` — more like ${title}` + (tagRefine ? ` — make it ${tagRefine}` : "");
    setPrompt("");
    getRecs(refined, { isRefine: true });
  }

  function refineWithTag(tag: string) {
    setTagRefine(tag);
    const base = (lastBase || "").trim();
    const refined = base + (titleRefine ? ` — more like ${titleRefine}` : "") + ` — make it ${tag}`;
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

  return {
    // state
    prompt,
    setPrompt,
    recs,
    loading,
    errorMsg,
    page,
    setPage,
    justVoted,
    lastBase,
    titleRefine,
    tagRefine,
    inputRef,

    // derived
    paged,
    totalPages,

    // actions
    getRecs,
    refineWithTitle,
    refineWithTag,
    handleVote,
    onEnter,
  } as const;
}