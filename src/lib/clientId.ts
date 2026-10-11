// src/lib/clientId.ts
// The anonymous client identity: a stable UUID in localStorage. Kept free
// of imports so code that must not pull in the Supabase client (the engine,
// and the node harnesses that compile it) can still send it. userPrefs.ts
// re-exports it, so existing imports are unchanged.

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
