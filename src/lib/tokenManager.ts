// src/lib/tokenManager.ts
import { supabase } from './supabaseClient';

export async function getTokensForUser(userId: string) {
  const { data, error } = await supabase
    .from('tokens')
    .select('count')
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching tokens:', error);
    return null;
  }
  return data?.count ?? 0;
}

export async function updateTokensForUser(userId: string, count: number) {
  const { error } = await supabase
    .from('tokens')
    .upsert({ user_id: userId, count });

  if (error) {
    console.error('Error updating tokens:', error);
  }
}
