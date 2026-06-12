// src/lib/reksnapSignals.ts
// RekSnap taste signals — stored in their own table (reksnap_signals),
// deliberately separate from user_likes so photo-derived items
// (wine, vodka, beer, food, ...) can never surface in the movie/TV/book
// taste profile loaded by loadPrefsForCategory.

import { supabase } from './supabaseClient';
import { getAnonymousClientId } from './userPrefs';

export type SnapSignalAction = 'like' | 'dislike' | 'save';

export async function recordSnapSignal(params: {
  itemName: string;
  itemCategory: string;
  action: SnapSignalAction;
}): Promise<void> {
  const clientId = getAnonymousClientId();
  if (!clientId) return;

  const { error } = await supabase.from('reksnap_signals').insert({
    client_id: clientId,
    item_name: params.itemName,
    item_category: params.itemCategory,
    source: 'reksnap',
    action: params.action,
  });
  // TODO: remove this log once Supabase writes are confirmed working
  if (error) {
    console.warn('[reksnapSignals] write failed:', error.message, error.details, { clientId, ...params });
  } else {
    console.log('[reksnapSignals] OK:', params.action, params.itemName, `(${params.itemCategory})`);
  }
}
