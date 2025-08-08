import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import ResultsPage from './components/ResultsPage';
import AuthPage from './components/AuthPage';
import { supabase } from './supabaseClient';

/**
 * Top‑level component controlling application state and routing.
 *
 * This component holds the authenticated user object, the current free
 * token balance and paid token balance.  These values are passed
 * downward to child pages via props.  Token counts are persisted in
 * localStorage so that anonymous users can leave and return without
 * losing their remaining free searches.  When a user signs in they
 * receive additional free tokens.
 */
export default function App() {
  // User object returned from Supabase.  Null means no active session.
  const [user, setUser] = useState(null);
  // Number of free searches remaining for the current session/user.  We
  // initialise from localStorage to preserve state across page reloads.  If
  // there is no entry, start with 3 for anonymous visitors.
  const [freeTokens, setFreeTokens] = useState(() => {
    const stored = localStorage.getItem('rekomendr_freeTokens');
    return stored !== null ? parseInt(stored, 10) : 3;
  });
  // Number of paid tokens available.  This persists across sessions and is
  // tied to the local browser.  In a real implementation you may wish to
  // store this value on the user record in Supabase.
  const [tokenBalance, setTokenBalance] = useState(() => {
    const stored = localStorage.getItem('rekomendr_tokenBalance');
    return stored !== null ? parseInt(stored, 10) : 0;
  });

  // Persist token counts whenever they change.
  useEffect(() => {
    localStorage.setItem('rekomendr_freeTokens', String(freeTokens));
  }, [freeTokens]);
  useEffect(() => {
    localStorage.setItem('rekomendr_tokenBalance', String(tokenBalance));
  }, [tokenBalance]);

  // On mount, fetch the current session and subscribe to auth state
  // changes.  This ensures the user state is updated when they log in or
  // out.  When a user logs in we grant them an extra 3 free tokens if
  // they still had only the anonymous allocation (3).  We also reset the
  // token count if the user logs out.
  useEffect(() => {
    const init = async () => {
      if (!supabase) return;
      const {
        data: { session }
      } = await supabase.auth.getSession();
      setUser(session?.user || null);
    };
    init();
    const { data: listener } = supabase?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        setUser(session?.user || null);
        // Give the signed‑in user three extra free tokens if they
        // previously only had three or fewer.  This replicates the
        // Free‑sign‑in tier described in the project.
        setFreeTokens((prev) => (prev <= 3 ? prev + 3 : prev));
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        // Reset free tokens for anonymous users when they sign out.
        setFreeTokens(3);
      }
    });
    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, []);


  return (
    <Routes>
      <Route
        path="/"
        element={<HomePage />}
      />
      <Route
        path="/results"
        element={
          <ResultsPage
            freeTokens={freeTokens}
            setFreeTokens={setFreeTokens}
            tokenBalance={tokenBalance}
            setTokenBalance={setTokenBalance}
            user={user}
          />
        }
      />
      <Route path="/signin" element={<AuthPage />} />
      <Route path="/signup" element={<AuthPage />} />
      {/* Fallback: any unknown route redirects to home */}
      <Route path="*" element={<HomePage />} />
    </Routes>
  );
}