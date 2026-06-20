// src/lib/userPrefs.ts
// Anonymous persistent preference storage via Supabase.
// No auth required — uses a stable UUID in localStorage as the client identity.

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

  const { data } = await supabase
    .from('user_likes')
    .select('title, action')
    .eq('client_id', clientId)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!data) return { likedTitles: [], dislikedTitles: [] };

  const liked = new Set<string>();
  const disliked = new Set<string>();

  for (const row of data) {
    if (row.action === 'like' || row.action === 'save' || row.action === 'more_like_this') {
      liked.add(row.title);
    } else if (row.action === 'dislike') {
      disliked.add(row.title);
    }
  }

  return {
    likedTitles: Array.from(liked),
    dislikedTitles: Array.from(disliked),
  };
}
