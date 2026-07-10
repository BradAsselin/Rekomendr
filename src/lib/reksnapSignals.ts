// src/lib/reksnapSignals.ts
// RekSnap taste signals — stored in their own table (reksnap_signals),
// deliberately separate from user_likes so photo-derived items
// (wine, vodka, beer, food, ...) can never surface in the movie/TV/book
// taste profile loaded by loadPrefsForCategory.

import { supabase } from './supabaseClient';
import { getAnonymousClientId } from './userPrefs';

// 'detail_expand' = first "Show details" tap on the anchor card per snap.
// 'chain' = "+ More like this" on a rek card — pursuit of an item. A chain
//   is a super-charged like: the chain row subsumes it, no 'like' row is
//   written alongside.
// 'anchor_reroll' = "+ More like this" on the anchor — a different signal:
//   dissatisfaction with the set, not pursuit of an item.
// DB note: reksnap_signals.action has a CHECK constraint — adding a value
// here requires the matching Supabase migration first (done 2026-07-03;
// chain/anchor_reroll + the chain_depth/chain_origin columns, 2026-07-10).
export type SnapSignalAction =
  | 'like'
  | 'dislike'
  | 'save'
  | 'context_flip'
  | 'detail_expand'
  | 'chain'
  | 'anchor_reroll';

// Where the chained card sat when tapped: a trail chain is double-weighted
// (verdict + pursuit), a frontier chain single-weighted.
export type ChainOrigin = 'frontier' | 'trail';

// The three intent modes a snap can be viewed through.
export type SnapMode = 'similar' | 'uses' | 'alternatives';

export async function recordSnapSignal(params: {
  itemName: string;
  itemCategory: string;
  action: SnapSignalAction;
  // Set only for 'context_flip': which mode the user switched TO.
  flipToMode?: SnapMode;
  // Set only for 'chain': 1-based count of chain-taps this snap, and the
  // chained card's origin. Both NULL for every other action.
  chainDepth?: number;
  chainOrigin?: ChainOrigin;
}): Promise<void> {
  const clientId = getAnonymousClientId();
  if (!clientId) return;

  const { error } = await supabase.from('reksnap_signals').insert({
    client_id: clientId,
    item_name: params.itemName,
    item_category: params.itemCategory,
    source: 'reksnap',
    action: params.action,
    // Nullable columns — NULL except for the action that owns each.
    flip_to_mode: params.flipToMode ?? null,
    chain_depth: params.chainDepth ?? null,
    chain_origin: params.chainOrigin ?? null,
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
