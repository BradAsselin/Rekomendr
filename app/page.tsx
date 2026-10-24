"use client";

import React, { useEffect, useRef, useState } from "react";
import SearchBar, { type VoiceAnswer } from "../src/components/SearchBar";
import ResultsV4 from "../src/components/ResultsV4";
import RekSnapButton from "../src/components/RekSnapButton";
import RekSnapResults, {
  type SnapRek,
  type SnapResult,
} from "../src/components/RekSnapResults";
import RecipeModal from "../src/components/RecipeModal";
import AuthControl from "../src/components/AuthControl";
import InstallCoach from "../src/components/InstallCoach";
import {
  installOfferSnoozed,
  isStandalone,
  pointManifestAt,
} from "../src/lib/installPrompt";
import { getMoreLikeThisSet, getTop5FromEngine, type Rek } from "../src/engine/rekomendrEngine";
import { fetchSlots, type SlotRequest } from "../src/lib/slotsClient";
import { typedMoodGate } from "../src/lib/typedMoodGate";
import { fetchScreen, type ScreenAnswer, type ScreenTitles } from "../src/lib/screenClient";
import { noteSetShown, seedEngineFromVisit } from "../src/lib/screenVisit";
import { chipQuery, refinersFor, SURPRISE_ME, type Chip, type Refiner } from "../src/lib/moodChips";
import { clearVoiceSet, setVoiceSet } from "../src/lib/voiceSignals";
import {
  getAnonymousClientId,
  loadPrefsForCategory,
  recordWatched,
  type ShortlistEntry,
} from "../src/lib/userPrefs";
import { AIServiceError, isAIServiceError, readServiceFailure } from "../src/lib/aiServiceError";
import { asToken } from "../src/lib/shareSnapshot";
import { bandFor, bandText, isWineCategory } from "../src/lib/wineShelf";
import {
  getWineFavorite,
  syncWineState,
  wineVisit,
  type BoughtItem,
} from "../src/lib/wineVisit";
import WineBought from "../src/components/WineBought";
import WineFollowup from "../src/components/WineFollowup";
import GoTosList, { type GoToTarget } from "../src/components/GoTosList";
import { onOpenSavedItem } from "../src/components/SavedPage";
import { goTosFor, logGoToEvent, syncGoTos } from "../src/lib/goTos";
import { BAR_CATEGORY } from "../src/lib/goToCategory";

// S13c — a title named in a spoken mood, steering one recipe as a go-to.
type TransientGoTo = { name: string; tmdbKind: "movie" | "tv"; tmdbId: number; at: string };

// S12b — a chip's refiner, as the slot route reads it.
const slotRefiner = (r: Refiner | null): SlotRequest["refiner"] =>
  !r ? null : r.kind === "tone" ? { kind: "tone", vibe: r.vibe } : { kind: "era", era: r.era };

// S13c/S16 — a parsed mood (/api/mood) as a slot-recipe run: the lane
// chip, the refiner, and a named title as the steer (a starred go-to by
// name, or a TMDb title steering this one request). Movies/TV only; null
// for anything else (the caller keeps its own path).
type SlotPlan = {
  cat: "Movies" | "TV Shows";
  chip: Chip;
  refiner: Refiner | null;
  req: SlotRequest;
  steerOpts?: { req: SlotRequest; steer: string; extraGoTo?: TransientGoTo };
};
function slotPlanFromMood(data: any): SlotPlan | null {
  const cat = data?.category;
  if (!data?.mapped || (cat !== "Movies" && cat !== "TV Shows")) return null;
  const lane = data.lane as { label: string; lane: string } | null;
  const chip: Chip = lane ? { label: lane.label, lane: lane.lane } : { label: SURPRISE_ME, lane: "" };
  const refiner = refinersFor(cat).find((r) => r.label === data.refiner) ?? null;
  const req: SlotRequest = { category: cat, lane: chip.lane || null, refiner: slotRefiner(refiner) };
  const goTo = data.goTo as { name: string; starred: boolean; tmdbKind: "movie" | "tv" | null; tmdbId: number | null } | null;
  const steerOpts = goTo
    ? {
        req,
        steer: goTo.name,
        ...(!goTo.starred && goTo.tmdbKind && goTo.tmdbId
          ? { extraGoTo: { name: goTo.name, tmdbKind: goTo.tmdbKind, tmdbId: goTo.tmdbId, at: new Date().toISOString() } }
          : {}),
      }
    : undefined;
  return { cat, chip, refiner, req, steerOpts };
}

// S16 — a TYPED mood takes the voice parser (docs/s16-watched-search-
// plan.md, Part B). Null on any failure: the old AI search runs, and the
// caller says so in the log.
async function parseTypedMood(text: string, bar: string): Promise<any | null> {
  try {
    const res = await fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: getAnonymousClientId(),
        source: "typed",
        transcript: text,
        barCategory: bar,
        goTos: {
          movies: goTosFor("Movies").map((g) => g.name),
          tv: goTosFor("TV Shows").map((g) => g.name),
          wine: null,
        },
      }),
    });
    if (!res.ok) {
      console.warn("[typed-mood] parse refused", { status: res.status });
      return null;
    }
    const data = await res.json().catch(() => null);
    return data?.ok ? data : null;
  } catch {
    console.warn("[typed-mood] parse unreachable");
    return null;
  }
}
import { onWineFavoriteChange } from "../src/lib/wineVisit";

// S8b — what every wine call carries: the visit's shown/rejected names and
// the starred go-to (the server holds the no-repeat guarantee with it).
const wineVisitPayload = () => ({ ...wineVisit(), favorite: getWineFavorite() });

export type Category = "Movies" | "TV Shows" | "Books" | "Wine";

// S4b — did this browser already have an anonymous id BEFORE this page
// load? Read at module evaluation, before anything can create one. A
// home-screen app launching for the first time has none, and only then may
// it adopt the id that saved the card in Safari (the claim hand-off).
const CLIENT_ID_KEY = "rekomendr.client_id";
const BOOT_HAD_CLIENT_ID = (() => {
  try {
    return typeof window !== "undefined" && !!localStorage.getItem(CLIENT_ID_KEY);
  } catch {
    return true; // storage blocked: never adopt
  }
})();

// S4b — a shared card opened in the app: its reks. Media cards use the
// TMDb chooser (same as a typed title); anything else re-rolls the anchor
// through the existing text-only chain, under the token the card carries.
async function fetchCardReks(anchor: SnapResult): Promise<{ reks: SnapRek[]; notice?: string }> {
  if (anchor.media) return fetchTypedReks(anchor.media, null);
  try {
    const res = await fetch("/api/reksnap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chain: {
          kind: "reroll",
          detectedItem: anchor.detected_item,
          mode: "similar",
          trail: [],
          rejectedNames: [],
          excludeNames: [],
          clientId: getAnonymousClientId(),
          anchorToken: anchor.detected_item_token,
        },
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        reks: [],
        notice:
          typeof data?.reason === "string" && typeof data?.error === "string"
            ? data.error
            : AI_SEARCH_FAILED_MSG,
      };
    }
    const raw: unknown[] = Array.isArray(data?.reks) ? data.reks : [];
    const reks = raw
      .filter((r): r is { name: string; description?: unknown; category?: unknown; token?: unknown } =>
        !!r && typeof (r as { name?: unknown }).name === "string" && !!(r as { name: string }).name.trim()
      )
      .map((r, i) => ({
        name: r.name,
        description: typeof r.description === "string" ? r.description : "",
        category: typeof r.category === "string" && r.category ? r.category : undefined,
        token: asToken(r.token),
        rank: i + 1,
      }));
    return { reks };
  } catch {
    return { reks: [], notice: AI_SEARCH_FAILED_MSG };
  }
}

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

// S3.0 — the typed text of a query ("Movies||lane||Lioness||mode:ai"), or
// "" for lane/vibe/Play searches, which never name a title.
function typedTextFromQuery(query: string): string {
  const parts = (query || "").includes("||") ? query.split("||") : query.split("|");
  if ((parts[3] || "").trim().toLowerCase() === "mode:pool") return "";
  return (parts[2] || "").trim();
}

function laneFromQuery(query: string): string | null {
  const parts = (query || "").includes("||") ? query.split("||") : query.split("|");
  return (parts[1] || "").trim() || null;
}

// S3.0 — does the typed text name one specific title (movies/TV, against
// TMDb) or one specific wine? Null = not a title; the search runs as
// before. A media lookup that fails is treated as "not a title" (the
// server logs it); a wine whose generation fails speaks its failure.
async function resolveTypedAnchor(text: string, category: Category): Promise<SnapResult | null> {
  const clientId = getAnonymousClientId();
  if (category === "Movies" || category === "TV Shows") {
    try {
      const res = await fetch("/api/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resolve", text, category, clientId }),
      });
      const data = await res.json().catch(() => null);
      // S3.1: the server logs every failed lookup at error level; the
      // client says so too, so a fallback is visible from either side.
      if (!res.ok || data?.fallback) {
        console.warn("[typed-anchor] fallback to search", {
          status: res.status,
          reason: data?.fallback ?? null,
        });
      }
      if (!res.ok) return null;
      return data?.anchor?.detected_item ? (data.anchor as SnapResult) : null;
    } catch (err) {
      console.warn("[typed-anchor] fallback to search — resolve request failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  if (category === "Wine") {
    const res = await fetch("/api/reksnap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typed: { text, clientId }, wineVisit: wineVisitPayload() }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok && typeof data?.reason === "string" && typeof data?.error === "string") {
      throw new AIServiceError(data.error, data.reason);
    }
    if (!res.ok) throw new Error(data?.error || "Typed wine failed");
    // The Wine bar's category wins: an anchor that isn't a wine never lands
    // here (the server refuses one too); the wine search runs instead.
    if (data?.detected_item && Array.isArray(data?.results?.similar)) {
      if (data.media || !isWineCategory(data.detected_item.category)) {
        console.warn("[typed-anchor] wine bar got a non-wine anchor — wine search instead", {
          category: data.detected_item.category ?? null,
        });
        return null;
      }
      return data as SnapResult;
    }
    return null;
  }
  return null;
}

async function fetchTypedReks(
  media: NonNullable<SnapResult["media"]>,
  lane: string | null
): Promise<{ reks: SnapRek[]; notice?: string }> {
  try {
    const res = await fetch("/api/anchor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reks",
        kind: media.kind,
        id: media.id,
        lane,
        clientId: getAnonymousClientId(),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // A named service failure speaks plainly; anything else keeps the
      // one Reks Ray failure voice.
      return {
        reks: [],
        notice:
          typeof data?.reason === "string" && typeof data?.error === "string"
            ? data.error
            : AI_SEARCH_FAILED_MSG,
      };
    }
    return {
      reks: Array.isArray(data?.reks) ? (data.reks as SnapRek[]) : [],
      notice: typeof data?.notice === "string" ? data.notice : undefined,
    };
  } catch {
    return { reks: [], notice: AI_SEARCH_FAILED_MSG };
  }
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

async function loadImageFile(file: File): Promise<{ dataUrl: string; img: HTMLImageElement }> {
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
  return { dataUrl, img };
}

// Downscale large camera photos client-side so the vision request stays
// small. S8a: the cap was 1280px; it is 2048 now — the most OpenAI's high
// detail pipeline ever uses — so a shelf's labels survive the trip.
const SNAP_MAX_DIM = 2048;

async function imageFileToDataUrl(file: File, maxDim = SNAP_MAX_DIM): Promise<string> {
  const { dataUrl, img } = await loadImageFile(file);

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

// S8a — the dense-shelf retry. The ORIGINAL photo cut into horizontal
// strips (roughly one per shelf), each overlapping its neighbour by 8% so
// no bottle is cut in half, each encoded at up to 2048px wide. OpenAI's
// high detail scales a photo's short side to 768px; a strip's short side
// is its height, so the labels in it arrive at about twice the resolution.
async function imageFileToStrips(file: File, count = 3): Promise<string[]> {
  const { img } = await loadImageFile(file);
  const overlap = Math.round(img.height * 0.08);
  const band = Math.ceil(img.height / count);
  const strips: string[] = [];
  for (let i = 0; i < count; i++) {
    const top = Math.max(0, i * band - overlap);
    const bottom = Math.min(img.height, (i + 1) * band + overlap);
    const h = bottom - top;
    const scale = Math.min(1, SNAP_MAX_DIM / Math.max(img.width, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(img, 0, top, img.width, h, 0, 0, canvas.width, canvas.height);
    strips.push(canvas.toDataURL("image/jpeg", 0.85));
  }
  return strips;
}

// S8a — the bar follows a successful snap: a wine snap leaves the bar on
// Wine (field case: the error screen after a wine snap still said Movies,
// because a snap never touched the bar). A failed snap leaves it alone.
function barCategoryForSnap(raw: string | undefined): Category | null {
  const c = (raw ?? "").trim().toLowerCase();
  if (!c) return null;
  if (isWineCategory(c)) return "Wine";
  if (c === "movies" || c === "movie" || c === "film") return "Movies";
  if (c === "tv" || c === "tv shows" || c === "tv show") return "TV Shows";
  if (c === "books" || c === "book") return "Books";
  return null;
}

// The dense-shelf message travels from the server; it is the one non-
// service failure the snap shows verbatim (plain voice, machinery).
type SnapReadFailure = Error & { dense?: string; retryStrips?: boolean };

// S13b — a snap answer as NDJSON: { type: "shelf" } lines (the bottles,
// painted early) then one { type: "final", status, body }. Anything that
// isn't NDJSON (an old server, a platform error page) reads as before.
async function readSnapResponse(
  res: Response,
  onShelf: (bottles: { name: string; price: number | null }[]) => void
): Promise<{ ok: boolean; data: any }> {
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("ndjson") || !res.body) {
    return { ok: res.ok, data: await res.json().catch(() => null) };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let final: { status: number; body: any } | null = null;
  const take = (line: string) => {
    if (!line.trim()) return;
    let msg: any = null;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg?.type === "shelf" && Array.isArray(msg.bottles)) {
      onShelf(
        msg.bottles
          .filter((b: any) => typeof b?.name === "string" && b.name.trim())
          .map((b: any) => ({ name: b.name, price: typeof b.price === "number" ? b.price : null }))
      );
    } else if (msg?.type === "final") {
      final = { status: Number(msg.status) || 500, body: msg.body ?? null };
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      take(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  }
  take(buf);
  const f = final as { status: number; body: any } | null;
  return f ? { ok: f.status >= 200 && f.status < 300, data: f.body } : { ok: false, data: null };
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
  // S16 — early paint: the five are on screen, their "vs." lines are
  // still being written.
  const [linesPending, setLinesPending] = useState(false);
  // S17 — the results header: what this set answers (the chips, or the
  // typed/spoken words in quotes). Data, never copy.
  const [resultsHeader, setResultsHeader] = useState<string | null>(null);

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [snapLimitReached, setSnapLimitReached] = useState(false);
  // S3.0 — a typed media anchor's reks, fetched after the anchor shows.
  const [reksPending, setReksPending] = useState(false);
  const [lateReks, setLateReks] = useState<{ reks: SnapRek[]; notice?: string } | null>(null);
  // S13b — early paint: the bottles a shelf snap read, shown while the
  // picks are still being written. Cleared when the snap lands or fails.
  const [shelfPreview, setShelfPreview] = useState<{ name: string; price: number | null }[] | null>(null);
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

  // S4b — the add-to-home-screen offer, raised only by a Save.
  const [installOffer, setInstallOffer] = useState(false);

  // S8a — the bar's category, mirrored here (it rides each snap as a hint),
  // and the one way a snap moves the bar: bump `n` with the new value.
  const barCategoryRef = useRef<string>("Movies");
  // S10 — the same bar category, as state: the snap tips start on its tip.
  const [barCategory, setBarCategory] = useState<string | undefined>(undefined);
  const [barCategoryHint, setBarCategoryHint] = useState<{ value: Category | null; n: number }>({
    value: null,
    n: 0,
  });

  // S8c — the Bought list and the one "How was it?" due on this open.
  const [bought, setBought] = useState<BoughtItem[]>([]);
  const [followup, setFollowup] = useState<{ id: string; name: string } | null>(null);
  const refreshWineState = async (withFollowup: boolean) => {
    const st = await syncWineState();
    if (!st) return;
    setBought(Array.isArray(st.bought) ? st.bought : []);
    if (withFollowup) setFollowup(st.followup ?? null);
  };

  // S12 — wine's one go-to, for the home list (S17: movie, show and book
  // go-tos left the home screen; they still steer every recipe, read from
  // the goTos mirror). Mirror first, then the server's copy wins.
  const [wineGoTo, setWineGoTo] = useState<{ name: string } | null>(null);
  useEffect(() => {
    setWineGoTo(getWineFavorite());
    const offB = onWineFavoriteChange(() => setWineGoTo(getWineFavorite()));
    void syncGoTos();
    // S12b — the engine's seen set starts from this visit's shown titles.
    seedEngineFromVisit();
    return () => {
      offB();
    };
  }, []);

  // S12b — the set on screen came from the slot recipe (its request and
  // the go-to steering it), and the order/selection for the Steer by row.
  const slotReqRef = useRef<{ req: SlotRequest; steer: string | null; extraGoTo?: TransientGoTo } | null>(null);
  // S15 — the set on screen came from a snapped streaming screen: its
  // titles (Steer by re-ranks these, never others) and the photo's service.
  const screenRef = useRef<{ titles: ScreenTitles; service: string | null } | null>(null);
  const [screenOn, setScreenOn] = useState(false);
  const leaveScreen = () => {
    screenRef.current = null;
    setScreenOn(false);
  };

  useEffect(() => {
    setHasSnapped(getSnapCount() >= 1);
    // S8b — the starred go-to: the server's copy wins on load. S8c — the
    // follow-up question is decided once per open, here.
    void refreshWineState(true);
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
  // S3.1 — true while a search, snap or typed-reks request is in flight;
  // the build-skew reload never interrupts one.
  const busyRef = useRef(false);
  busyRef.current = loading || snapLoading || reksPending;
  const resetToHomeRef = useRef<() => void>(() => {});
  useEffect(() => {
    const maybeReset = () => {
      const ageMs = Date.now() - lastActivityRef.current;
      if (ageMs > STALE_SESSION_MS) {
        console.info("[stale-session] resumed after", Math.round(ageMs / 60000), "min — coming home");
        resetToHomeRef.current();
      }
    };
    // S3.1 — build-skew guard. An installed PWA resumed after a deploy
    // keeps running the bundle it loaded (field case 2026-10-12: typed
    // "Lioness" on the phone ran the pre-S3.0 search). On resume, ask
    // which build is live; if it isn't ours and nothing is in flight,
    // reload once — the same moment the stale-session guard comes home.
    const checkBuild = async () => {
      const mine = process.env.NEXT_PUBLIC_BUILD_ID;
      if (!mine) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const live = (await res.json().catch(() => null))?.build;
        if (typeof live !== "string" || !live || live === mine) return;
        // Never reload twice for the same live build (a CDN serving two
        // builds mid-rollout must not loop).
        const key = "rekomendr.reloaded_for_build";
        if (sessionStorage.getItem(key) === live) return;
        if (busyRef.current) return;
        sessionStorage.setItem(key, live);
        console.info("[build-skew] live build changed — reloading", { mine, live });
        window.location.reload();
      } catch {
        // Offline or blocked: keep running what we have.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        maybeReset();
        void checkBuild();
      }
    };
    const onPageShow = () => {
      maybeReset();
      void checkBuild();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // S4b — a shared card, opened in the app as the anchor. `save` = the
  // person tapped Save on the card: keep it under their anonymous id, show
  // it saved, and offer the home screen. The URL then carries the card and
  // the signed claim, which is what an icon added from here opens with —
  // Safari and the home-screen app don't share storage on iOS.
  const openCardFromLink = async (cardId: string, opts: { save: boolean }) => {
    const snapId = ++snapIdRef.current;
    searchIdRef.current++;
    lastActivityRef.current = Date.now();
    setSnapError(null);
    setSnapResult(null);
    setLateReks(null);
    setReksPending(false);
    setSnapLoading(true);
    try {
      const clientId = getAnonymousClientId();
      const res = await fetch("/api/card/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: cardId, clientId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.anchor?.detected_item) throw new Error(`card ${res.status}`);
      if (snapId !== snapIdRef.current) return;
      const anchor = data.anchor as SnapResult;

      let claim: string | null = null;
      if (opts.save) {
        const s = await fetch("/api/card/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card: cardId, clientId }),
        })
          .then((r) => r.json())
          .catch(() => null);
        if (s?.ok) {
          anchor.saved = true;
          claim = typeof s.claim === "string" ? s.claim : null;
        } else {
          console.warn("[card-save] did not land", { reason: s?.reason ?? null });
        }
      }
      if (snapId !== snapIdRef.current) return;

      const needsReks = anchor.results.similar.length === 0;
      setSnapResult(anchor);
      setHasSnapped(true);
      setSnapLoading(false);
      setReksPending(needsReks);

      // Drop save=1 (a reload must not save again); keep card + claim.
      const next = `/?card=${encodeURIComponent(cardId)}${claim ? `&claim=${encodeURIComponent(claim)}` : ""}`;
      try {
        window.history.replaceState(null, "", next);
      } catch {}
      if (claim) pointManifestAt(cardId, claim);
      if (anchor.saved && opts.save && !isStandalone() && !installOfferSnoozed()) setInstallOffer(true);

      if (needsReks) {
        const late = await fetchCardReks(anchor);
        if (snapId !== snapIdRef.current) return;
        setLateReks(late);
        setReksPending(false);
      }
    } catch (err) {
      console.warn("[card-open] failed", err);
      if (snapId !== snapIdRef.current) return;
      setSnapLoading(false);
      setSnapError("This rek isn’t here anymore.");
    }
  };

  // S4b — arrival: a card link (/?card=…&save=1), a home-screen launch,
  // or both (the first launch of an icon added after a Save carries
  // ?card=…&claim=…). Order matters: adopt the claimed id FIRST, so the
  // launch and the save are counted under the person who saved in Safari.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cardId = q.get("card");
    const claim = q.get("claim");
    const save = q.get("save") === "1";
    const standalone = isStandalone();
    void (async () => {
      let claimedCard: string | null = null;
      if (standalone && claim) {
        try {
          const r = await fetch("/api/card/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ claim }),
          }).then((x) => x.json());
          if (r?.ok && typeof r.clientId === "string") {
            claimedCard = typeof r.card === "string" ? r.card : null;
            // Adopt only on a fresh install (no id of its own yet): the
            // saved card, the name and the history come along with it.
            if (!BOOT_HAD_CLIENT_ID) {
              localStorage.setItem(CLIENT_ID_KEY, r.clientId);
              console.info("[card-claim] adopted the saving browser's id");
            }
          }
        } catch {
          // a failed claim just opens the app normally
        }
      }
      if (standalone) {
        try {
          if (!sessionStorage.getItem("rekomendr.launch_logged")) {
            sessionStorage.setItem("rekomendr.launch_logged", "1");
            void fetch("/api/card/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ kind: "standalone_launch", clientId: getAnonymousClientId() }),
              keepalive: true,
            }).catch(() => {});
          }
        } catch {}
      }
      const openId = cardId ?? claimedCard;
      // A claim means the card was saved: re-saving is idempotent (same row
      // for an adopted id; an import for a device that had its own id).
      if (openId) await openCardFromLink(openId, { save: save || !!claimedCard });
    })();
    // Mount-once: the arrival URL is read exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // S12 — a screen go-to opened as the anchor: TMDb by id (no model call),
  // then the chooser's five from its recommendation web — the typed-title
  // path, entered from the tile. A miss falls back to the typed search of
  // its name, said in the log.
  const openMediaGoTo = async (t: { category: "movies" | "tv"; name: string; tmdbKind: "movie" | "tv" | null; tmdbId: number | null }) => {
    const snapId = ++snapIdRef.current;
    searchIdRef.current++;
    lastActivityRef.current = Date.now();
    setSnapError(null);
    setSnapResult(null);
    setLateReks(null);
    setReksPending(false);
    setSearchError(null);
    setSnapLoading(true);
    setBarCategoryHint((h) => ({ value: BAR_CATEGORY[t.category], n: h.n + 1 }));
    let anchor: SnapResult | null = null;
    try {
      const res = await fetch("/api/anchor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "open",
          kind: t.tmdbKind,
          id: t.tmdbId,
          name: t.name,
          category: BAR_CATEGORY[t.category],
          clientId: getAnonymousClientId(),
        }),
      });
      const data = await res.json().catch(() => null);
      anchor = res.ok && data?.anchor?.detected_item ? (data.anchor as SnapResult) : null;
    } catch {
      anchor = null;
    }
    if (snapId !== snapIdRef.current) return;
    if (!anchor?.media) {
      console.warn("[go-to-open] fallback to the typed search", { category: t.category });
      setSnapLoading(false);
      void handleSearch(`${BAR_CATEGORY[t.category]}||||${t.name}||mode:ai`, BAR_CATEGORY[t.category]);
      return;
    }
    setSnapResult(anchor);
    setSnapLoading(false);
    setReksPending(true);
    const late = await fetchTypedReks(anchor.media, null);
    if (snapId !== snapIdRef.current) return;
    setLateReks(late);
    setReksPending(false);
  };

  // S12 — "+ More like this" on a go-to tile (and on a "Wine you bought"
  // tile, which isn't a go-to and isn't counted as one).
  const moreFromGoTo = (t: GoToTarget, opts: { counted: boolean } = { counted: true }) => {
    if (opts.counted) logGoToEvent("goto_more", t.category);
    if ((t.category === "movies" || t.category === "tv") && "tmdbId" in t) {
      void openMediaGoTo({ ...t, category: t.category });
      return;
    }
    // Books → a search seeded on the book (its name as the typed text);
    // wine → the typed-wine anchor: that bottle's style and price band.
    const bar = t.category === "wine" ? "Wine" : BAR_CATEGORY[t.category];
    setBarCategoryHint((h) => ({ value: bar, n: h.n + 1 }));
    void handleSearch(`${bar}||||${t.name}||mode:ai`, bar);
  };

  // S17c — a title tapped on the Saved page opens its card here, by the
  // same path as a go-to (not counted as a go-to "more").
  const moreFromGoToRef = useRef(moreFromGoTo);
  moreFromGoToRef.current = moreFromGoTo;
  useEffect(() => onOpenSavedItem((t) => moreFromGoToRef.current(t, { counted: false })), []);

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
    setReksPending(false);
    setLateReks(null);
    setShelfPreview(null);
    setSnapLoading(true);
    leaveScreen();

    const postSnap = async (payload: { image?: string; strips?: string[] }, signal?: AbortSignal) => {
      const res = await fetch("/api/reksnap", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        // clientId keys the server's cross-session dislike shading (raced,
        // fail-soft — an empty id just means no history). category is the
        // bar's, a hint only.
        body: JSON.stringify({
          ...payload,
          clientId: getAnonymousClientId(),
          category: barCategoryRef.current,
          wineVisit: wineVisitPayload(),
          // S13b — the shelf's bottles arrive first, then the picks.
          stream: "ndjson",
        }),
      });
      const { ok, data } = await readSnapResponse(res, (bottles) => {
        if (snapId === snapIdRef.current) setShelfPreview(bottles);
      });
      // A NAMED service failure (out of credit, key refused, rate-limited,
      // unreachable) carries honest plain-voice copy from the route.
      if (!ok && typeof data?.reason === "string" && typeof data?.error === "string") {
        throw new AIServiceError(data.error, data.reason);
      }
      if (
        !ok ||
        !data?.detected_item ||
        !data?.results ||
        !Array.isArray(data?.results?.similar)
      ) {
        const failure: SnapReadFailure = new Error(data?.error || "RekSnap failed");
        if (data?.dense === true && typeof data?.error === "string") failure.dense = data.error;
        if (data?.retry === "strips") failure.retryStrips = true;
        throw failure;
      }
      return data as SnapResult;
    };

    try {
      const image = await imageFileToDataUrl(file);
      // S15 — on the Movies/TV bar the photo may be a streaming app's row
      // or Top 10. The screen read runs beside the normal snap; if it finds
      // two or more real titles, its set answers and the snap is dropped.
      // Otherwise (a poster, a banner, a failed read) the snap answers as
      // before, with no added wait beyond the screen read itself.
      const bar = barCategoryRef.current;
      const snapAbort = new AbortController();
      const firstP = postSnap({ image }, snapAbort.signal);
      firstP.catch(() => {});
      if (bar === "Movies" || bar === "TV Shows") {
        const screen = await fetchScreen({ image }).catch(() => null);
        if (snapId !== snapIdRef.current) return; // dismissed while in flight
        if (screen) {
          snapAbort.abort();
          incrementSnapCount();
          setHasSnapped(true);
          showScreen(screen, bar);
          return;
        }
      }
      let data: SnapResult;
      try {
        data = await firstP;
      } catch (err) {
        // S8a — a failed whole-photo read gets one more try, as strips.
        if (!(err as SnapReadFailure)?.retryStrips || snapId !== snapIdRef.current) throw err;
        console.info("[snap-strips] whole photo unread — retrying as strips");
        data = await postSnap({ strips: await imageFileToStrips(file) });
      }
      if (snapId !== snapIdRef.current) return; // dismissed while in flight
      setSnapResult(data);
      incrementSnapCount();
      setHasSnapped(true);
      const barCat = barCategoryForSnap(data.detected_item.category);
      if (barCat) setBarCategoryHint((h) => ({ value: barCat, n: h.n + 1 }));
    } catch (err) {
      console.error("RekSnap failed:", err);
      if (snapId !== snapIdRef.current) return;
      // Voice rule: ™ rides labels/branding; prose uses the bare name.
      // A service failure speaks plainly (machinery, not Reks Ray); only a
      // genuine read miss is the persona's to own. A shelf too dense to
      // read even in strips says so plainly (S8a).
      const dense = (err as SnapReadFailure)?.dense;
      setSnapError(
        isAIServiceError(err)
          ? err.message
          : dense
            ? dense
            : "Reks Ray couldn’t read that photo. Give it another snap."
      );
    } finally {
      if (snapId === snapIdRef.current) {
        setSnapLoading(false);
        setShelfPreview(null);
      }
    }
  };

  // S15 — a snapped streaming screen's set, shown in the search lane: the
  // cards, the Steer by row (movie and TV go-tos both), and the header.
  const showScreen = (screen: ScreenAnswer, bar: string) => {
    searchIdRef.current++; // a search still in flight must not land over it
    slotReqRef.current = null;
    screenRef.current = { titles: screen.titles, service: screen.service };
    setScreenOn(true);
    setResultsHeader(null); // the screen set has its own header
    const cat: Category = screen.category ?? (bar === "TV Shows" ? "TV Shows" : "Movies");
    clearVoiceSet();
    setSnapLoading(false);
    setSnapResult(null);
    setShelfPreview(null);
    setSearchError(null);
    setLoading(false);
    setLinesPending(false);
    setHasSearched(true);
    setCategory(cat);
    noteSetShown(cat, screen.reks.map((r) => r.title));
    setReks(screen.reks);
  };

  const handleSearch = async (
    query: string,
    _cat: string,
    meta?: { chip: Chip; refiner: Refiner | null },
    // S12b — a Steer by tap: the recipe request to re-run, steered.
    // S13c — or a title named in a spoken mood (extraGoTo: steers this
    // recipe without being a go-to).
    steerOpts?: { req: SlotRequest; steer: string; extraGoTo?: TransientGoTo },
    // S13c — this search answers a spoken mood: its five become the voice
    // set whose taps, plays, shares, saves and stars are counted.
    // S17 — `said`: the words, for the results header.
    voice?: { moodId: string | null; said?: string }
  ) => {
    const searchId = ++searchIdRef.current;
    if (!voice) clearVoiceSet();
    leaveScreen();
    lastActivityRef.current = Date.now();

    // A new search dismisses any RekSnap results and clears a stale notice.
    snapIdRef.current++;
    setSnapResult(null);
    setSnapError(null);
    setSnapLoading(false);
    setSnapLimitReached(false);
    setSearchError(null);
    setReksPending(false);
    setLateReks(null);
    setLinesPending(false);

    const nextCategory = categoryFromQuery(query);
    // S17 — the header: spoken words, else the chips, else the typed words.
    // A steer re-run keeps the header it had. Wine keeps its own layout.
    if (!steerOpts || voice) {
      const typed = typedTextFromQuery(query);
      setResultsHeader(
        nextCategory === "Wine"
          ? null
          : voice?.said
            ? `“${voice.said}”`
            : meta
              ? [meta.chip.label, meta.refiner?.label].filter(Boolean).join(" · ")
              : typed
                ? `“${typed}”`
                : null
      );
    }
    // S12b — Movies/TV chip taps (and every steer) run the slot recipe.
    const slotReq: SlotRequest | null =
      steerOpts?.req ??
      (meta && (nextCategory === "Movies" || nextCategory === "TV Shows")
        ? { category: nextCategory, lane: meta.chip.lane || null, refiner: slotRefiner(meta.refiner) }
        : null);

    setHasSearched(true);
    setCategory(nextCategory);
    setLoading(true);
    setLoadingLabel(loadingLabelFromQuery(query, nextCategory));

    try {
      // S3.0 — a typed TITLE lands as the anchor (the "what's that show?"
      // flow). The detection runs beside the prefs read, so a mood query
      // pays nothing extra; anything that isn't a title searches as before.
      const typedText = typedTextFromQuery(query);
      // S16 — a typed MOOD on Movies/TV is parsed beside the title check
      // (both in flight at once); a title still wins.
      const typedMood =
        !slotReq && !!typedText && (nextCategory === "Movies" || nextCategory === "TV Shows");
      const [prefs, typedAnchor, mood] = await Promise.all([
        loadPrefsForCategory(nextCategory),
        typedText ? resolveTypedAnchor(typedText, nextCategory) : Promise.resolve(null),
        typedMood ? parseTypedMood(typedText, nextCategory) : Promise.resolve(null),
      ]);
      if (searchId !== searchIdRef.current) return;

      if (typedAnchor) {
        const snapId = snapIdRef.current;
        setSnapResult(typedAnchor);
        setLateReks(null);
        // Media anchors arrive without reks (TMDb only, no model call) and
        // fetch them next; a typed wine arrives whole.
        const needsReks = !!typedAnchor.media && typedAnchor.results.similar.length === 0;
        setReksPending(needsReks);
        setLoading(false);
        if (needsReks && typedAnchor.media) {
          const lane = laneFromQuery(query);
          const late = await fetchTypedReks(typedAnchor.media, lane);
          if (searchId !== searchIdRef.current || snapId !== snapIdRef.current) return;
          setLateReks(late);
          setReksPending(false);
        }
        return;
      }

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

      // S16 — the typed mood, mapped: the slot recipe, exactly as if the
      // chip (and a Steer by on the named title) had been tapped. Anything
      // the parse can't place in Movies/TV runs the old AI search.
      let runReq = slotReq;
      let runSteer = steerOpts;
      let runCat: Category = nextCategory;
      if (typedMood) {
        const plan = slotPlanFromMood(mood);
        // Only a mood the chip vocabulary holds whole takes the fast path;
        // anything more specific keeps the AI search (typedMoodGate.ts).
        const gate = plan ? typedMoodGate(typedText, mood) : null;
        if (plan && gate && !gate.fast) {
          console.info("[typed-mood] → AI search", { reason: gate.reason, residual: gate.residual });
        } else if (plan) {
          runReq = plan.req;
          runSteer = plan.steerOpts;
          runCat = plan.cat;
          console.info("[typed-mood] → slots", {
            category: plan.cat,
            lane: plan.chip.label,
            refiner: plan.refiner?.label ?? null,
            steer: plan.steerOpts ? (plan.steerOpts.extraGoTo ? "named" : "go-to") : null,
          });
          if (plan.cat !== nextCategory) {
            // Category words win ("a dark crime show" on the Movies bar).
            setCategory(plan.cat);
            setBarCategoryHint((h) => ({ value: plan.cat, n: h.n + 1 }));
          }
        } else {
          console.info("[typed-mood] → AI search", {
            reason: !mood ? "parse_failed" : !mood.mapped ? "not_mapped" : "category",
            category: mood?.category ?? null,
          });
        }
      }

      if (runReq) {
        const req = runReq;
        const extraGoTo = runSteer?.extraGoTo;
        // S16 — early paint: the five land with TMDb's synopses as soon as
        // they exist; the "vs." lines follow onto the same cards.
        const show = (list: Rek[], steer: string | null, order: string[]) => {
          slotReqRef.current = { req, steer, extraGoTo };
          noteSetShown(runCat, list.map((r) => r.title));
          if (voice) setVoiceSet(voice.moodId, list.map((r) => r.title));
          setReks(list);
        };
        let painted = false;
        const ans = await fetchSlots(req, {
          steer: runSteer?.steer ?? null,
          ...(extraGoTo ? { extraGoTos: [extraGoTo] } : {}),
          onCards: (c) => {
            if (searchId !== searchIdRef.current || c.reks.length === 0) return;
            painted = true;
            show(c.reks, c.steer, c.order);
            setLinesPending(c.linesPending);
            setLoading(false);
          },
        });
        if (searchId !== searchIdRef.current) return;
        setLinesPending(false);
        if (ans && ans.reks.length > 0) {
          // Same cards, lines merged in (ResultsV4 merges by id).
          if (painted) setReks(ans.reks);
          else show(ans.reks, ans.steer, ans.order);
          return;
        }
        // Named, never silent: fetchSlots logged the reason (or the pools
        // ran dry); the AI search runs as before, on the bar's category.
        console.warn("[slots] FALLBACK — running the AI chip search", { empty: !!ans, typed: typedMood });
        if (runCat !== nextCategory) {
          setCategory(nextCategory);
          setBarCategoryHint((h) => ({ value: nextCategory, n: h.n + 1 }));
        }
      }
      slotReqRef.current = null;

      const next = await getTop5FromEngine({
        rawQuery: query,
        likedTitles: prefs.likedTitles,
        dislikedTitles: prefs.dislikedTitles,
        watchedTitles: Array.from(watchedNow),
        shortlist: prefs.shortlist,
      });
      if (searchId !== searchIdRef.current) return;

      noteSetShown(nextCategory, next.reks.map((r) => r.title));
      if (voice) setVoiceSet(voice.moodId, next.reks.map((r) => r.title));
      setReks(next.reks);
      // S1.5 — two different empties, two different voices. A set the
      // real-title guard emptied carries its own plain-voice notice (the
      // model invented every title; a retry will invent again). Anything
      // else keeps the one Reks Ray failure voice.
      if (next.reks.length === 0) {
        setSearchError(next.notice ?? AI_SEARCH_FAILED_MSG);
      }
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

  // S12b — a thumbs-down on a recipe card is replaced from the recipe: the
  // same slot, the same steer, never a title already on screen or shown.
  const slotBackfill = async (removed: Rek, current: Rek[]): Promise<Rek | null> => {
    // S15 — a screen set holds only what was on the screen: a thumbs-down
    // removes the card and nothing replaces it (honest-short).
    if (screenRef.current) return null;
    const s = slotReqRef.current;
    if (!s) return null;
    const ans = await fetchSlots(s.req, {
      steer: s.steer,
      ...(s.extraGoTo ? { extraGoTos: [s.extraGoTo] } : {}),
      count: 1,
      slot: removed.slot,
      extraSeen: current.map((r) => r.title),
    }).catch(() => null);
    return ans?.reks[0] ?? null;
  };

  // S13c — VOICE MOOD INPUT v1 (docs/s13-opus-voice-plan.md, Part B). The
  // bar heard a mood; /api/mood maps it onto the existing vocabulary, and
  // the search runs down the path a chip tap (or a Steer by tap) already
  // takes. No new pick logic. Unmapped → the bar keeps the words and puts
  // the closest lanes first; never an error.
  const handleVoice = async (transcript: string, bar: string): Promise<VoiceAnswer | null> => {
    const started = Date.now();
    let data: any = null;
    try {
      const res = await fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: getAnonymousClientId(),
          transcript,
          barCategory: bar,
          goTos: {
            movies: goTosFor("Movies").map((g) => g.name),
            tv: goTosFor("TV Shows").map((g) => g.name),
            wine: getWineFavorite()?.name ?? null,
          },
        }),
      });
      if (!res.ok) {
        // A named service failure speaks plainly; the words stay in the box.
        const failure = await readServiceFailure(res);
        if (failure) setSearchError(failure.message);
        console.warn("[voice] mood parse failed", { status: res.status });
        return null;
      }
      data = await res.json().catch(() => null);
    } catch {
      console.warn("[voice] mood parse unreachable — the words stay");
      return null;
    }
    if (!data?.ok) return null;
    const cat: string = data.category;
    if (!data.mapped || (cat !== "Movies" && cat !== "TV Shows" && cat !== "Wine")) {
      console.info("[voice] mood not mapped — showing the words", { closest: data.closest?.length ?? 0 });
      return { mapped: false, category: cat, laneLabel: null, refinerLabel: null, closest: data.closest ?? [] };
    }

    const lane = data.lane as { label: string; lane: string } | null;
    const chip: Chip = lane ? { label: lane.label, lane: lane.lane } : { label: SURPRISE_ME, lane: "" };
    const refiner = refinersFor(cat).find((r) => r.label === data.refiner) ?? null;
    const voice = { moodId: typeof data.moodId === "string" ? data.moodId : null, said: transcript };
    if (cat === "Wine") {
      // The wine chip search (lane + style vibe). A spoken price rides the
      // lane slot as words ("Crisp White under $20") — pressure, not a
      // guarantee; the pick path's band waits for the VOICE PR.
      const band = data.price ? bandFor(null, data.price) : null;
      const laneText = [chip.lane, band ? bandText(band) : ""].filter(Boolean).join(" ");
      await handleSearch(chipQuery("Wine", { label: chip.label, lane: laneText }, refiner), "Wine", undefined, undefined, voice);
    } else {
      const plan = slotPlanFromMood(data)!;
      await handleSearch(chipQuery(cat, plan.chip, plan.refiner), cat, { chip: plan.chip, refiner: plan.refiner }, plan.steerOpts, voice);
    }
    console.info("[voice] mood → picks", { ms: Date.now() - started, category: cat, lane: chip.label, refiner: refiner?.label ?? null, steer: !!data.goTo });
    return { mapped: true, category: cat, laneLabel: chip.label, refinerLabel: refiner?.label ?? null, closest: [] };
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

  // S16 — a card's "Watched" mark (either lane): the title joins the
  // visit's watched list, which every re-run excludes and the strip
  // filters; Undo takes it back out. The card lanes own the write.
  const handleWatchedChange = (item: { title: string }, isWatched: boolean) => {
    const key = item.title.trim().toLowerCase();
    setSessionWatchedTitles((p) =>
      isWatched
        ? p.some((t) => t.trim().toLowerCase() === key) ? p : [...p, item.title]
        : p.filter((t) => t.trim().toLowerCase() !== key)
    );
    if (isWatched) setShortlist((prev) => prev.filter((e) => e.title.trim().toLowerCase() !== key));
  };

  // Wordmark tap → the snap-first cold-load state. No confirmation: the
  // app is forward-only until history ships, and reset is the same
  // dismissal grammar as starting a new search. The session snap count
  // (and its cap) is untouched — only the UI comes home.
  const resetToHome = () => {
    lastActivityRef.current = Date.now();
    leaveScreen();
    searchIdRef.current++; // discard in-flight search responses
    snapIdRef.current++; // discard in-flight snap responses
    setReks([]);
    setLoading(false);
    setLinesPending(false);
    setLoadingLabel("Reks Ray™ is finding fresh reks for you…");
    setHasSearched(false);
    setSearchError(null);
    setSnapLoading(false);
    setSnapResult(null);
    setSnapError(null);
    setSnapLimitReached(false);
    setReksPending(false);
    setLateReks(null);
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
    slotReqRef.current = null;
    setResultsHeader(null);
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
          onVoice={handleVoice}
          onCategoryChange={(c) => {
            barCategoryRef.current = c;
            setBarCategory(c);
          }}
          categoryHint={barCategoryHint}
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
              reksPending={reksPending}
              lateReks={lateReks}
              shelfPreview={shelfPreview}
              onHaulSaved={() => void refreshWineState(false)}
              onWatchedChange={handleWatchedChange}
            />
          ) : !hasSearched && !loading ? (
            <>
            {/* S8c — the one follow-up question on this open, and the
                Bought list. Home screen only: never over a result. */}
            {/* S17 — movie, show and book go-tos left the home screen (they
                live under Saved → Favorites, and still steer every recipe);
                wine's go-to and its Bought list stay, as wine keeps its
                layout. */}
            {(followup || bought.length > 0 || wineGoTo) && (
              <div className="mb-6 space-y-3">
                {followup && <WineFollowup item={followup} />}
                <GoTosList goTos={[]} wine={wineGoTo} onMore={(t) => moreFromGoTo(t)} />
                <WineBought
                  items={bought}
                  onMore={(name) => moreFromGoTo({ category: "wine", name }, { counted: false })}
                />
              </div>
            )}
            {!hasSnapped && (
              <div className="sm:hidden">
                <RekSnapButton onClick={openSnapPicker} category={barCategory} />
              </div>
            )}
            </>
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
                /* S17 — the Shortlist strip is gone from Movies/TV (and
                   Books); its titles still feed the freshness slot. */
                shortlist={category === "Wine" ? shortlist : []}
                header={resultsHeader}
                onWatched={handleWatched}
                onWatchedChange={handleWatchedChange}
                linesPending={linesPending}
                watchPendingTitle={watchPendingTitle}
                watchFailedTitle={watchFailedTitle}
                /* S17 — the Steer by row is gone (go-tos still steer every
                   recipe, nearest first); a screen set keeps its header. */
                steerRow={
                  screenOn ? (
                    <div className="w-full max-w-xl mb-2 text-[13px] font-medium text-gray-300 sm:text-gray-600">
                      From your screen
                    </div>
                  ) : undefined
                }
                backfillOverride={slotBackfill}
              />
            </>
          )}
        </div>
      </div>

      <InstallCoach open={installOffer} onClose={() => setInstallOffer(false)} />

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
