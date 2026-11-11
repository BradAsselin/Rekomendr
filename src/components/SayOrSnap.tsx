'use client';
import React, { useEffect, useState } from 'react';
import { Camera, Mic } from 'lucide-react';
import { askCandidate, askedIds, entryById, noneWatched, rememberAsked, type WatchAsk } from '../lib/watchAsk';
import { getSearchEntries } from '../lib/recentSearches';
import { fetchSavedLists } from '../lib/userPrefs';
import { postersHidden } from '../lib/posterPref';
import { useWatchedMarks } from '../lib/useWatchedMarks';
import { WatchedToast } from './WatchedControl';
import { sendMeasure } from '../lib/measureClient';

// S24b — the home screen's big button, split in two: Say it starts voice
// (the search box's own mic), Snap it opens the camera, and the Reks Ray
// line beneath. S26a — the rotating snap tips are gone from home;
// SnapTips.tsx stays for its harnesses but renders nowhere.
// S29 — one centered rounded square split by a fine inset line (left Say
// it, right Snap it; each half its own button, same actions), 260px (200px
// on a short screen), 48px under the chips. The per-button hints are gone;
// under the square one nudge line rotates every 5s with a dot per line.
// The 48px counts from the chips: the bar's 11px progress strip sits
// between, so the margin here is 48 − 11 − the wrapper's mt-8 (mt-5 short).

type Props = { onSay?: () => void; onSnap?: () => void; category?: string };

// Brad-approved wording (2026-10-31).
export const NUDGES = [
  'Try saying ‘a cozy mystery for tonight’',
  'Snap a wine shelf and we’ll pick the best bottle on it',
  'Snap the TV screen to find what’s like it',
  'Say a movie you loved, and we’ll find its cousins',
];
const NUDGE_MS = 5000;

const HALF =
  'flex h-full flex-col items-center justify-center gap-2 transition-colors active:bg-white/10 focus-visible:bg-white/10 outline-none';

// S40 — this visit's "Did you watch one of these?" (docs/2026-11-10_
// measure_launch.md B). Module-level so coming back home in the same visit
// shows the same unanswered line, never a second ask.
let visitAsk: WatchAsk | null = null;

// Brad-approved wording (2026-11-10): the question and "Not yet".
export const ASK_LINE = 'Did you watch one of these?';
export const ASK_NOT_YET = 'Not yet';

function useWatchAsk() {
  const [ask, setAsk] = useState<WatchAsk | null>(visitAsk);
  useEffect(() => {
    if (visitAsk || postersHidden()) return;
    const cand = askCandidate(getSearchEntries(), Date.now(), askedIds());
    if (!cand) return;
    let alive = true;
    void (async () => {
      // Only a search none of whose picks is marked Watched is asked about;
      // a failed read means we can't tell, so we don't ask.
      const lists = await fetchSavedLists();
      if (!alive || !lists || visitAsk) return;
      if (!noneWatched(entryById(cand.entryId), lists.watched.map((w) => w.title))) return;
      rememberAsked(cand.entryId); // never twice for this search
      visitAsk = cand;
      setAsk(cand);
      sendMeasure({ event: 'nudge_asked' });
    })();
    return () => {
      alive = false;
    };
  }, []);
  const end = () => {
    visitAsk = null;
    setAsk(null);
  };
  return { ask, end };
}

export default function SayOrSnap({ onSay, onSnap }: Props) {
  const [nudge, setNudge] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setNudge((n) => (n + 1) % NUDGES.length), NUDGE_MS);
    return () => window.clearInterval(t);
  }, []);
  const { ask, end } = useWatchAsk();
  const marks = useWatchedMarks();

  return (
    <div className="flex flex-1 flex-col items-center w-full mt-[5px] [@media(max-height:700px)]:mt-[17px]">
      <div
        className="relative grid size-[260px] grid-cols-2 overflow-hidden rounded-[34px] bg-[#2D5AB5] shadow-[0_10px_30px_rgba(0,0,0,0.35)] [@media(max-height:700px)]:size-[200px]"
        data-testid="say-snap-square"
      >
        <button type="button" onClick={onSay} className={HALF} data-testid="say-it">
          <Mic size={44} strokeWidth={1.5} color="white" aria-hidden="true" />
          <span className="text-white font-medium text-lg tracking-wide">Say it</span>
        </button>
        <button type="button" onClick={onSnap} className={HALF} data-testid="snap-it">
          <Camera size={44} strokeWidth={1.5} color="white" aria-hidden="true" />
          <span className="text-white font-medium text-lg tracking-wide">Snap it</span>
        </button>
        <span
          aria-hidden="true"
          data-testid="say-snap-divider"
          className="pointer-events-none absolute left-1/2 top-[18%] bottom-[18%] w-px -translate-x-1/2 bg-white/35"
        />
      </div>
      {ask ? (
        // In place of the rotating tips, in the same space: the question,
        // the search's posters (a tap marks it Watched, with Undo) and
        // "Not yet". Either answer ends it for this search for good.
        <div className="mt-4 flex flex-col items-center" data-testid="watch-ask">
          <p className="text-center text-[14px] leading-5 text-gray-300">{ASK_LINE}</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            {ask.picks.map((p) => (
              <button
                key={p.title}
                type="button"
                aria-label={p.title}
                data-testid="watch-ask-poster"
                onClick={() => {
                  marks.toggle({ title: p.title, year: p.year, category: p.category ?? 'Movies' });
                  sendMeasure({ event: 'nudge_poster' });
                  end();
                }}
                className="h-[45px] w-[30px] overflow-hidden rounded bg-gray-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- TMDb's CDN serves the small size */}
                <img src={`https://image.tmdb.org/t/p/w92${p.posterPath}`} alt="" width={30} height={45} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
              </button>
            ))}
            <button
              type="button"
              data-testid="watch-ask-not-yet"
              onClick={() => {
                sendMeasure({ event: 'nudge_not_yet' });
                end();
              }}
              className="ml-1 px-1 py-3 text-[13px] text-gray-400 underline underline-offset-2"
            >
              {ASK_NOT_YET}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 min-h-[40px] max-w-[300px] text-center text-[14px] leading-5 text-gray-400" data-testid="home-nudge">
            {NUDGES[nudge]}
          </p>
          <div className="mt-2 flex gap-1.5" aria-hidden="true" data-testid="home-nudge-dots">
            {NUDGES.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === nudge ? 'bg-gray-300' : 'bg-gray-600'}`} />
            ))}
          </div>
        </>
      )}
      <WatchedToast item={marks.toast} onUndo={marks.undo} />
      <p className="mt-auto pt-3 text-[11px] text-gray-400">powered by Reks Ray™</p>
    </div>
  );
}
