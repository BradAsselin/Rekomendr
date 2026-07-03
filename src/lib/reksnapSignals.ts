// src/lib/reksnapSignals.ts
// RekSnap taste signals — stored in their own table (reksnap_signals),
// deliberately separate from user_likes so photo-derived items
// (wine, vodka, beer, food, ...) can never surface in the movie/TV/book
// taste profile loaded by loadPrefsForCategory.

import { supabase } from './supabaseClient';
import { getAnonymousClientId } from './userPrefs';

// 'detail_expand' = first "Show details" tap on the anchor card per snap.
// DB note: reksnap_signals.action has a CHECK constraint — adding a value
// here requires the matching Supabase migration first (done 2026-07-03).
export type SnapSignalAction =
  | 'like'
  | 'dislike'
  | 'save'
  | 'context_flip'
  | 'detail_expand';

// The three intent modes a snap can be viewed through.
export type SnapMode = 'similar' | 'uses' | 'alternatives';

export async function recordSnapSignal(params: {
  itemName: string;
  itemCategory: string;
  action: SnapSignalAction;
  // Set only for 'context_flip': which mode the user switched TO.
  flipToMode?: SnapMode;
}): Promise<void> {
  const clientId = getAnonymousClientId();
  if (!clientId) return;

  const { error } = await supabase.from('reksnap_signals').insert({
    client_id: clientId,
    item_name: params.itemName,
    item_category: params.itemCategory,
    source: 'reksnap',
    action: params.action,
    // Nullable column — NULL for like/dislike/save, the target mode for flips.
    flip_to_mode: params.flipToMode ?? null,
  });
  // TODO: remove this log once Supabase writes are confirmed working
  if (error) {
    console.warn('[reksnapSignals] write failed:', error.message, error.details, { clientId, ...params });
  } else {
    console.log(
      '[reksnapSignals] OK:',
      params.action,
      params.itemName,
      `(${params.itemCategory})`,
      params.flipToMode ? `→ ${params.flipToMode}` : ''
    );
  }
}
