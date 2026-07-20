// src/lib/userPrefs.ts
// Anonymous persistent preference storage.
// No auth required — uses a stable UUID in localStorage as the client identity.
// Writes go straight to Supabase; reads go through /api/prefs (service-role)
// so anon SELECT on user_likes can be dropped (S2b Block B).

import { supabase } from './supabaseClient';

const CLIENT_ID_KEY = 'rekomendr.client_id';

export function getAnonymousClientId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? `anon_${crypto.randomUUID()}`
      : `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

export type LikeAction = 'like' | 'dislike' | 'save' | 'more_like_this';

export async function recordLike(params: {
  category: string;
  title: string;
  year?: number;
  action: LikeAction;
}): Promise<void> {
  const clientId = getAnonymousClientId();
  if (!clientId) return;

  await supabase.from('user_likes').insert({
    client_id: clientId,
    category: params.category,
    title: params.title,
    year: params.year ?? null,
    action: params.action,
  });
}

export async function loadPrefsForCategory(category: string): Promise<{
  likedTitles: string[];
  dislikedTitles: string[];
}> {
  const clientId = getAnonymousClientId();
  if (!clientId) return { likedTitles: [], dislikedTitles: [] };

  // Fail-soft on any failure (network, non-200, bad JSON): empty prefs,
  // never a throw into the search flow.
  try {
    const res = await fetch('/api/prefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, category }),
    });
    if (!res.ok) return { likedTitles: [], dislikedTitles: [] };
    const data = await res.json();
    return {
      likedTitles: Array.isArray(data?.likedTitles) ? data.likedTitles : [],
      dislikedTitles: Array.isArray(data?.dislikedTitles) ? data.dislikedTitles : [],
    };
  } catch {
    return { likedTitles: [], dislikedTitles: [] };
  }
}
