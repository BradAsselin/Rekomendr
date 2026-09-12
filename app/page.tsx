"use client";

import React, { useEffect, useRef, useState } from "react";
import SearchBar from "../src/components/SearchBar";
import ResultsV4 from "../src/components/ResultsV4";
import RekSnapButton from "../src/components/RekSnapButton";
import RekSnapResults, { type SnapResult } from "../src/components/RekSnapResults";
import RecipeModal from "../src/components/RecipeModal";
import AuthControl from "../src/components/AuthControl";
import { getTop5FromEngine, type Rek } from "../src/engine/rekomendrEngine";
import {
  getAnonymousClientId,
  loadPrefsForCategory,
  recordWatched,
  type ShortlistEntry,
} from "../src/lib/userPrefs";
import { AIServiceError, isAIServiceError } from "../src/lib/aiServiceError";

export type Category = "Movies" | "TV Shows" | "Books" | "Wine";

// Stale-session guard (S3.1a): an installed-PWA resume re-presents frozen
// state as a fresh load (docs/typed-lane-trace.md A.2). Anything older than
// this window comes home instead of resurrecting a months-old screen.
const STALE_SESSION_MS = 6 * 60 * 60 * 1000;

function normalizeCategoryFromString(raw: string): Category {
  const c = (raw || "Movies").toLowerCase().trim();
  if (c === "wine" || c === "wines") return "Wine";
  if (c === "books" || c === "book") return "Books";
  if (c === "tv" || c === "tv shows" || c === "tv show") return "TV Shows";
  return "Movies";
}

function categoryFromQuery(query: string): Category {
  const q = (query || "").trim();
  if (!q) return "Movies";

  const parts = q.includes("||") ? q.split("||") : q.split("|");
  const rawCategory = (parts[0] || "Movies").trim();
  return normalizeCategoryFromString(rawCategory);
}

function loadingLabelFromQuery(query: string, cat: Category): string {
  const q = (query || "").trim();

  if (!q) return "Reks Ray™ is finding fresh reks for you…";

  const parts = q.includes("||") ? q.split("||") : q.split("|");
  const clarifier = (parts[1] || "").trim();
  const text = (parts[2] || "").trim();
  // The vibe travels in its own fifth segment now (tone on genre) — the
  // old "vibe:" clarifier prefix was a read with no writer.
  const rawVibe = (parts[4] || "").trim();
  const vibe = rawVibe.toLowerCase().startsWith("vibe:")
    ? rawVibe.slice(5).trim()
    : "";

  if (text) return `Reks Ray™ is finding ${cat} reks for "${text}"…`;
  if (clarifier && vibe)
    return `Reks Ray™ is finding ${cat} reks for ${clarifier} • ${vibe}…`;
  if (clarifier) return `Reks Ray™ is finding ${cat} reks for ${clarifier}…`;

  return "Reks Ray™ is finding fresh reks for you…";
}

// Soft session limit on RekSnaps; count lives in sessionStorage so it
// resets when the browser session ends.
const SNAP_COUNT_KEY = "rekomendr.snap_count";
const SNAP_LIMIT = 5;

// One failure voice for every fresh-AI-search miss (empty result or throw).
const AI_SEARCH_FAILED_MSG =
  "Reks Ray couldn’t fetch fresh picks — give it another go.";

// The 5-Rek cap is enforced in production only. Local dev bypasses enforcement
// so we can snap freely while testing — the limit number itself is unchanged,
// and production behavior is identical to before.
const ENFORCE_SNAP_LIMIT = process.env.NODE_ENV === "production";

function getSnapCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(sessionStorage.getItem(SNAP_COUNT_KEY) || "0", 10) || 0;
}

function incrementSnapCount(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SNAP_COUNT_KEY, String(getSnapCount() + 1));
}

// Downscale large camera photos client-side so the vision request stays small.
async function imageFileToDataUrl(file: File, maxDim = 1280): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  if (scale === 1) return dataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function Page() {
  const [reks, setReks] = useState<Rek[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState(
    "Reks Ray™ is finding fresh reks for you…"
  );
  const [category, setCategory] = useState<Category>("Movies");
  const [persistedLikedTitles, setPersistedLikedTitles] = useState<string[]>([]);
  const [persistedDislikedTitles, setPersistedDislikedTitles] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // S1 — the Shortlist lives HERE, not in ResultsV4, because the charter
  // asks for it to persist across searches within the visit and ResultsV4
  // wipes its own view state on every incoming set. Reloaded from
  // /api/prefs on each search; cleared only by the home reset.
  const [shortlist, setShortlist] = useState<ShortlistEntry[]>([]);
  // Titles marked watched during THIS visit. The server's own watched list
  // arrives with each prefs load; the union of the two is what the engine
  // excludes, so a successful tap takes effect on the very next search
  // even if the read window has since rolled past the row.
  const [sessionWatchedTitles, setSessionWatchedTitles] = useState<string[]>([]);
  // One in-flight "Watched it" at a time, keyed by title, and the last one
  // that failed. Honest over quiet: a failed write puts the chip back.
  const [watchPendingTitle, setWatchPendingTitle] = useState<string | null>(null);
  const [watchFailedTitle, setWatchFailedTitle] = useState<string | null>(null);

  // Honest AI-failure notice for a fresh search — the engine reports empty
  // on AI failure now (no silent pool fallback exists anymore).
  const [searchError, setSearchError] = useState<string | null>(null);

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [snapLimitReached, setSnapLimitReached] = useState(false);
  // True once this session has at least one successful snap; hides the hero
  // button. Set in an effect so server and first client render stay in sync.
  const [hasSnapped, setHasSnapped] = useState(false);

  // Bumped by the wordmark home reset; keys SearchBar so a reset remounts
  // it — every bar internal (input, lane, vibe, category) returns to its
  // initial state by construction.
  const [searchBarKey, setSearchBarKey] = useState(0);

  // Recipe push-through modal. Non-null = open, with the dish to generate and
  // the detected item it came from. Set when a food "uses" snap card is tapped.
  const [activeRecipe, setActiveRecipe] = useState<
    { dish: string; detectedItem?: string } | null
  >(null);

  useEffect(() => {
    setHasSnapped(getSnapCount() >= 1);
  }, []);

  const vibePlayRef = useRef<null | (() => void)>(null);
  const searchIdRef = useRef(0);
  // Staleness guard for in-flight snap responses — bumped by anything that
  // dismisses snap results (new search, home reset) so a late vision
  // response can't repopulate a cleared screen.
  const snapIdRef = useRef(0);
  const snapInputRef = useRef<HTMLInputElement | null>(null);

  // Stale-session guard: stamped by every search, snap, and reset; read on
  // resume. resetToHome is reached through a ref so the mount-once effect
  // never closes over a stale render's instance.
  const lastActivityRef = useRef(Date.now());
  const resetToHomeRef = useRef<() => void>(() => {});
  useEffect(() => {
    const maybeReset = () => {
      const ageMs = Date.now() - lastActivityRef.current;
      if (ageMs > STALE_SESSION_MS) {
        console.info("[stale-session] resumed after", Math.round(ageMs / 60000), "min — coming home");
        resetToHomeRef.current();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") maybeReset();
    };
    window.addEventListener("pageshow", maybeReset);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", maybeReset);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const openSnapPicker = () => {
    if (ENFORCE_SNAP_LIMIT && getSnapCount() >= SNAP_LIMIT) {
      setSnapLimitReached(true);
      return;
    }
    snapInputRef.current?.click();
  };

  const handleSnapFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-snapping the same photo
    if (!file) return;

    const snapId = ++snapIdRef.current;
    lastActivityRef.current = Date.now();
    setSnapError(null);
    setSnapResult(null);
    setSnapLoading(true);

    try {
      const image = await imageFileToDataUrl(file);
      const res = await fetch("/api/reksnap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // clientId keys the server's cross-session dislike shading (raced,
        // fail-soft — an empty id just means no history).
        body: JSON.stringify({ image, clientId: getAnonymousClientId() }),
      });
      const data = await res.json().catch(() => null);
      // A NAMED service failure (out of credit, key refused, rate-limited,
      // unreachable) carries honest plain-voice copy from the route.
      if (!res.ok && typeof data?.reason === "string" && typeof data?.error === "string") {
        throw new AIServiceError(data.error, data.reason);
      }
      if (
        !res.ok ||
        !data?.detected_item ||
        !data?.results ||
        !Array.isArray(data?.results?.similar)
      ) {
        throw new Error(data?.error || "RekSnap failed");
      }
      if (snapId !== snapIdRef.current) return; // dismissed while in flight
      setSnapResult(data as SnapResult);
      incrementSnapCount();
      setHasSnapped(true);
    } catch (err) {
      console.error("RekSnap failed:", err);
      if (snapId !== snapIdRef.current) return;
      // Voice rule: ™ rides labels/branding; prose uses the bare name.
      // A service failure speaks plainly (machinery, not Reks Ray); only a
      // genuine read miss is the persona's to own.
      setSnapError(
        isAIServiceError(err)
          ? err.message
          : "Reks Ray couldn’t read that photo. Give it another snap."
      );
    } finally {
      if (snapId === snapIdRef.current) setSnapLoading(false);
    }
  };

  const handleSearch = async (query: string, _cat: string) => {
    const searchId = ++searchIdRef.current;
    lastActivityRef.current = Date.now();

    // A new search dismisses any RekSnap results and clears a stale notice.
    snapIdRef.current++;
    setSnapResult(null);
    setSnapError(null);
    setSnapLoading(false);
    setSnapLimitReached(false);
    setSearchError(null);

    const nextCategory = categoryFromQuery(query);

    setHasSearched(true);
    setCategory(nextCategory);
    setLoading(true);
    setLoadingLabel(loadingLabelFromQuery(query, nextCategory));

    try {
      const prefs = await loadPrefsForCategory(nextCategory);
      if (searchId !== searchIdRef.current) return;

      setPersistedLikedTitles(prefs.likedTitles);
      setPersistedDislikedTitles(prefs.dislikedTitles);
      // The server is authoritative for the strip, but a title marked
      // watched earlier in this visit must not reappear in it — that is
      // the one thing "Watched it" promises. Filter locally too, in case
      // the write landed after this read was already in flight.
      const watchedNow = new Set(
        [...prefs.watchedTitles, ...sessionWatchedTitles].map((t) =>
          t.trim().toLowerCase()
        )
      );
      setShortlist(
        prefs.shortlist.filter((e) => !watchedNow.has(e.title.trim().toLowerCase()))
      );

      const next = await getTop5FromEngine({
        rawQuery: query,
        likedTitles: prefs.likedTitles,
        dislikedTitles: prefs.dislikedTitles,
        watchedTitles: Array.from(watchedNow),
        shortlist: prefs.shortlist,
      });
      if (searchId !== searchIdRef.current) return;

      setReks(next);
      if (next.length === 0) setSearchError(AI_SEARCH_FAILED_MSG);
    } catch (err) {
      if (searchId !== searchIdRef.current) return;
      console.error("Search failed:", err);
      setReks([]);
      // A named service failure shows its honest plain-voice copy; every
      // other miss keeps the one Reks Ray failure voice.
      setSearchError(isAIServiceError(err) ? err.message : AI_SEARCH_FAILED_MSG);
    } finally {
      if (searchId === searchIdRef.current) {
        setLoading(false);
      }
    }
  };

  // S1 — "Watched it". Optimistic: the chip leaves the strip immediately,
  // because the tap is a verdict and a verdict that lags feels broken. If
  // the write does not land (most likely: the CHECK constraint has not
  // been widened yet — the route names that case `migration_pending` in
  // the server log), the chip comes BACK and the strip says so. Never a
  // silent success.
  const handleWatched = async (item: { title: string; year: number | null }) => {
    if (watchPendingTitle) return; // one verdict in flight at a time
    const key = item.title.trim().toLowerCase();

    // Remember the entry as it stood, so a failed write can restore it
    // with its real like-date and keep the strip's newest-first order.
    const previousEntry =
      shortlist.find((e) => e.title.trim().toLowerCase() === key) ?? null;

    setWatchPendingTitle(item.title);
    setWatchFailedTitle(null);
    setShortlist((prev) =>
      prev.filter((e) => e.title.trim().toLowerCase() !== key)
    );

    const res = await recordWatched({
      category,
      title: item.title,
      year: item.year ?? undefined,
    });

    setWatchPendingTitle(null);

    if (res.ok) {
      setSessionWatchedTitles((p) =>
        p.includes(item.title) ? p : [...p, item.title]
      );
      return;
    }

    // Put it back exactly where it was: the strip is newest-first and this
    // entry's like time has not changed, so re-inserting by likedAt keeps
    // the order stable rather than jumping it to the front.
    console.warn("[watched-signal] not persisted", { reason: res.reason });
    setWatchFailedTitle(item.title);
    setShortlist((prev) => {
      if (prev.some((e) => e.title.trim().toLowerCase() === key)) return prev;
      const restored = [
        ...prev,
        previousEntry ?? { title: item.title, year: item.year, likedAt: null },
      ];
      // Newest first, and entries with no date sink to the bottom rather
      // than jumping to the front.
      restored.sort((a, b) => (b.likedAt ?? "").localeCompare(a.likedAt ?? ""));
      return restored;
    });
  };

  // Wordmark tap → the snap-first cold-load state. No confirmation: the
  // app is forward-only until history ships, and reset is the same
  // dismissal grammar as starting a new search. The session snap count
  // (and its cap) is untouched — only the UI comes home.
  const resetToHome = () => {
    lastActivityRef.current = Date.now();
    searchIdRef.current++; // discard in-flight search responses
    snapIdRef.current++; // discard in-flight snap responses
    setReks([]);
    setLoading(false);
    setLoadingLabel("Reks Ray™ is finding fresh reks for you…");
    setHasSearched(false);
    setSearchError(null);
    setSnapLoading(false);
    setSnapResult(null);
    setSnapError(null);
    setSnapLimitReached(false);
    setHasSnapped(false); // re-show the hero snap button
    setActiveRecipe(null);
    setCategory("Movies");
    setPersistedLikedTitles([]);
    setPersistedDislikedTitles([]);
    // Coming home clears the visit's memory surface along with everything
    // else on screen; the next search reloads it from the server.
    setShortlist([]);
    setSessionWatchedTitles([]);
    setWatchPendingTitle(null);
    setWatchFailedTitle(null);
    setSearchBarKey((k) => k + 1); // remount SearchBar → pristine bar + lane
  };
  resetToHomeRef.current = resetToHome;

  return (
    <main className="min-h-screen w-full flex justify-center px-4 py-6">
      <div className="w-full max-w-xl">
        {/* The wordmark is the app's only home affordance — no separate
            button. AuthControl sits quietly at the right edge; it gates
            nothing (anonymous stays primary). */}
        <div className="relative mb-6 text-center">
          <button
            type="button"
            onClick={resetToHome}
            aria-label="Back to home"
            className="text-3xl font-bold tracking-tight text-[#2D5AB5]"
          >
            Rekomendr<span className="text-[#2D5AB5]/70">.AI</span>
          </button>
          <AuthControl />
        </div>
        <SearchBar
          key={searchBarKey}
          onSearch={handleSearch}
          setLoading={setLoading}
          hasHistory={reks.length > 0}
          onSnap={openSnapPicker}
          registerVibePlay={(fn) => {
            vibePlayRef.current = fn;
          }}
        />

        <input
          ref={snapInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleSnapFile}
        />

        <div className="mt-8">
          {snapLoading || snapResult || snapError || snapLimitReached ? (
            <RekSnapResults
              loading={snapLoading}
              result={snapResult}
              error={snapError}
              limitReached={snapLimitReached}
              onSnapAgain={openSnapPicker}
              onOpenRecipe={(r) => setActiveRecipe(r)}
            />
          ) : !hasSearched && !loading ? (
            !hasSnapped && (
              <div className="sm:hidden">
                <RekSnapButton onClick={openSnapPicker} />
              </div>
            )
          ) : (
            <>
              {searchError && !loading && (
                <div className="px-4 pt-2">
                  <div className="bg-white border border-amber-300 rounded-2xl p-4 shadow-sm">
                    <div className="text-sm text-gray-800">{searchError}</div>
                  </div>
                </div>
              )}
              <ResultsV4
                reks={reks}
                loading={loading}
                loadingLabel={loadingLabel}
                category={category}
                onPlayVibe={() => vibePlayRef.current?.()}
                persistedLikedTitles={persistedLikedTitles}
                persistedDislikedTitles={persistedDislikedTitles}
                shortlist={shortlist}
                onWatched={handleWatched}
                watchPendingTitle={watchPendingTitle}
                watchFailedTitle={watchFailedTitle}
              />
            </>
          )}
        </div>
      </div>

      {activeRecipe && (
        <RecipeModal
          dish={activeRecipe.dish}
          detectedItem={activeRecipe.detectedItem}
          onClose={() => setActiveRecipe(null)}
        />
      )}
    </main>
  );
}
