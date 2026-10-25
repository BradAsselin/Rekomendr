// src/lib/userPrefs.ts
// Anonymous persistent preference storage.
// No auth required — uses a stable UUID in localStorage as the client identity.
// Writes go through /api/signals and reads through /api/prefs (both
// service-role), so anon and authenticated hold no privileges on
// user_likes (S2b Block B, S23).

import { getAnonymousClientId } from './clientId';
import type { SavedItem } from './savedLists';
export { getAnonymousClientId };

export type LikeAction = 'like' | 'dislike' | 'save' | 'more_like_this';

// S17c — the Saved page's count follows every write that can change it
// (save, Not for me, watched, and their undos). One window event; the
// top bar's Saved button re-reads /api/saved when it fires.
const SAVED_EVENT = 'rekomendr:saved-changed';
export function notifySavedChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(SAVED_EVENT));
  } catch {}
}
export function onSavedChange(fn: () => void): () => void {
  window.addEventListener(SAVED_EVENT, fn);
  return () => window.removeEventListener(SAVED_EVENT, fn);
}

// S17c — this client's Saved and Watched lists (every category), for the
// Saved page. null = the read failed (the page says nothing new; it shows
// what it has).
export async function fetchSavedLists(): Promise<{
  saved: SavedItem[];
  watched: SavedItem[];
  // S18b — saves since watched (still a save row): cards show them filled.
  savedWatched: SavedItem[];
} | null> {
  const clientId = getAnonymousClientId();
  if (!clientId) return null;
  try {
    const res = await fetch('/api/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok || !Array.isArray(data.saved) || !Array.isArray(data.watched)) return null;
    return { saved: data.saved, watched: data.watched, savedWatched: Array.isArray(data.savedWatched) ? data.savedWatched : [] };
  } catch {
    return null;
  }
}

export async function recordLike(params: {
  category: string;
  title: string;
  year?: number;
  action: LikeAction;
}): Promise<void> {
  const clientId = getAnonymousClientId();
  if (!clientId) return;

  // S23 — through /api/signals (service role): anon and authenticated hold
  // no privileges on user_likes. keepalive: a swipe can be the last act
  // before the tab closes.
  const res = await fetch('/api/signals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      clientId,
      kind: 'like',
      category: params.category,
      title: params.title,
      year: params.year ?? null,
      action: params.action,
    }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  if (!res?.ok || !data?.ok) {
    console.error('[user-likes] write failed', { action: params.action, status: res?.status ?? null, reason: data?.reason ?? data?.error ?? null });
    return;
  }
  if (params.action === 'save' || params.action === 'dislike') notifySavedChange();
}

// One Shortlist entry: a liked-but-not-watched title, plus the timestamp
// of the like the resurfacing marker quotes.
export type ShortlistEntry = {
  title: string;
  year: number | null;
  likedAt: string | null;
};

export type CategoryPrefs = {
  likedTitles: string[];
  dislikedTitles: string[];
  // The 'watched' signal (S1). Permanent frontier exclusion — and, unlike
  // likedTitles, NOT exempted by the freshness slot. Empty until the
  // migration in docs/sql/s1-watched-signal.sql runs.
  watchedTitles: string[];
  // Newest first — a render order for the strip, not an avoid list.
  shortlist: ShortlistEntry[];
};

const EMPTY_PREFS: CategoryPrefs = {
  likedTitles: [],
  dislikedTitles: [],
  watchedTitles: [],
  shortlist: [],
};

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string') : [];

const asShortlist = (v: unknown): ShortlistEntry[] =>
  Array.isArray(v)
    ? v
        .filter(
          (e): e is ShortlistEntry =>
            !!e && typeof (e as ShortlistEntry).title === 'string'
        )
        .map((e) => ({
          title: e.title,
          year: typeof e.year === 'number' ? e.year : null,
          likedAt: typeof e.likedAt === 'string' ? e.likedAt : null,
        }))
    : [];

export async function loadPrefsForCategory(
  category: string
): Promise<CategoryPrefs> {
  const clientId = getAnonymousClientId();
  if (!clientId) return EMPTY_PREFS;

  // Fail-soft on any failure (network, non-200, bad JSON): empty prefs,
  // never a throw into the search flow. A route that predates S1 (or a
  // cached bundle talking to one) simply omits the two new fields, and
  // the readers below default them to empty — the strip stays hidden and
  // search behaves exactly as it does today.
  try {
    const res = await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, category }),
    });
    if (!res.ok) return EMPTY_PREFS;
    const data = await res.json();
    if (data?.ok === false) console.warn('[prefs] read failed', { reason: data.reason ?? null });
    return {
      likedTitles: asStringArray(data?.likedTitles),
      dislikedTitles: asStringArray(data?.dislikedTitles),
      watchedTitles: asStringArray(data?.watchedTitles),
      shortlist: asShortlist(data?.shortlist),
    };
  } catch {
    return EMPTY_PREFS;
  }
}

// THE 'WATCHED' WRITE (S1).
//
// Deliberately NOT recordLike: this one write goes through a server route
// instead of the browser's anon insert, because it is this session's one
// new fail-soft path and charter §2.4 requires a SERVER-SIDE tripwire that
// names the failure. Until the migration runs, user_likes.action's CHECK
// constraint rejects 'watched' — the route recognises exactly that case
// and logs it as `migration_pending`, so the reason for an unpersisted tap
// is a named line in the log, not a shrug.
//
// Returns whether the row actually landed, so the caller can put the chip
// back rather than pretend it saved.
export async function recordWatched(params: {
  category: string;
  title: string;
  year?: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const clientId = getAnonymousClientId();
  if (!clientId) return { ok: false, reason: 'no_client_id' };

  try {
    const res = await fetch('/api/signals/watched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId,
        category: params.category,
        title: params.title,
        year: params.year ?? null,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return {
        ok: false,
        reason: typeof data?.reason === 'string' ? data.reason : 'request_failed',
      };
    }
    notifySavedChange();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// S16 — the toast's Undo: deletes this client's 'watched' row(s) for the
// title, through the same single-purpose route.
export async function undoWatched(params: {
  category: string;
  title: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const clientId = getAnonymousClientId();
  if (!clientId) return { ok: false, reason: 'no_client_id' };
  try {
    const res = await fetch('/api/signals/watched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, category: params.category, title: params.title, undo: true }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, reason: typeof data?.reason === 'string' ? data.reason : 'request_failed' };
    }
    notifySavedChange();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// S17 — the Undo for "Not for me" and "Saved", and the Saved page's
// remove: through /api/signals/undo (action-fixed to dislike | save,
// this client's rows only). The browser can insert a like but never
// delete one.
export async function undoSignal(params: {
  category: string;
  title: string;
  action: 'dislike' | 'save';
  remove?: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  const clientId = getAnonymousClientId();
  if (!clientId) return { ok: false, reason: 'no_client_id' };
  try {
    const res = await fetch('/api/signals/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, ...params }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) {
      return { ok: false, reason: typeof data?.reason === 'string' ? data.reason : 'request_failed' };
    }
    notifySavedChange();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
