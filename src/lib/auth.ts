// src/lib/auth.ts
// Magic-link auth glue (S2b). Anonymous stays primary: nothing in the app
// gates on a session — sign-in exists solely to make identity durable via
// the account_devices merge. Merge calls are fire-and-forget; a failure
// never blocks sign-in and retries on the next auth event or page load.

import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { getAnonymousClientId } from './userPrefs';

export async function signInWithEmail(
  email: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error ? error.message : null };
}

export async function signOut(): Promise<void> {
  // The localStorage client_id is deliberately untouched: the device
  // reverts to the same anonymous identity it had before sign-in, so
  // shading and search prefs keep working exactly as pre-auth.
  await supabase.auth.signOut();
}

// One merge request per (user, client_id) per page load — the server-side
// ON CONFLICT is the real idempotency; this only spares redundant requests
// from re-renders and multi-tab auth events. Cleared on failure so the
// next auth event retries.
const mergedThisLoad = new Set<string>();

export function requestMerge(session: Session): void {
  const clientId = getAnonymousClientId();
  if (!clientId || !session?.user?.id || !session.access_token) return;
  const key = `${session.user.id}:${clientId}`;
  if (mergedThisLoad.has(key)) return;
  mergedThisLoad.add(key);

  fetch('/api/auth/merge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ clientId }),
  })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        mergedThisLoad.delete(key);
        console.warn('[auth] merge did not complete:', res.status);
      }
    })
    .catch((err) => {
      mergedThisLoad.delete(key);
      console.warn('[auth] merge request failed:', err);
    });
}
