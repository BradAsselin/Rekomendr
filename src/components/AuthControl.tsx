"use client";

// S2b sign-in entry + signed-in indicator. Deliberately quiet: anonymous
// stays primary and nothing gates on a session — this control's only jobs
// are sending the magic link, showing signed-in state, and firing the
// fail-soft identity merge on auth events.
//
// S24b — it lives in the top bar's ⋯ menu now (MoreMenu). The auth
// listener is a hook the menu's always-mounted button runs, so the merge
// still fires on every load whether or not the menu is ever opened.

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { requestMerge, signInWithEmail, signOut } from "../lib/auth";

type SendStatus = "idle" | "sending" | "sent" | "error";

export function useAuthEmail(): string | null {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUserEmail(session?.user?.email ?? null);
      // Merge on both entry paths: a fresh sign-in (magic link consumed)
      // and a restored session on page load. requestMerge dedupes per
      // load; the server-side ON CONFLICT is the real idempotency.
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        requestMerge(session);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return userEmail;
}

// The menu's account row: "Sign in" opens the email form in place;
// signed in, the address and "Sign out".
export default function AuthControl({ userEmail, onDone }: { userEmail: string | null; onDone: () => void }) {
  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || status === "sending") return;
    setStatus("sending");
    const { error } = await signInWithEmail(addr);
    setStatus(error ? "error" : "sent");
  };

  const handleSignOut = async () => {
    onDone();
    await signOut();
  };

  if (userEmail) {
    return (
      <div className="px-4 py-2.5">
        <div className="truncate text-xs text-gray-500">{userEmail}</div>
        <button type="button" role="menuitem" onClick={handleSignOut} className="mt-1 py-1 text-[15px] text-[#2D5AB5]">
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 py-1">
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setFormOpen((o) => !o);
          setStatus("idle");
        }}
        data-testid="menu-sign-in"
        className="w-full py-2 text-left text-[15px] text-gray-900"
      >
        Sign in
      </button>
      {formOpen &&
        (status === "sent" ? (
          <div className="pb-2 text-sm text-gray-700">{"Check your email — the sign-in link is on its way."}</div>
        ) : (
          <form onSubmit={sendLink} className="pb-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#2D5AB5]"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="mt-2 w-full rounded-xl bg-[#2D5AB5] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Send sign-in link"}
            </button>
            {status === "error" && (
              <div className="mt-2 text-xs text-amber-700">{"Couldn’t send the link — give it another go."}</div>
            )}
          </form>
        ))}
    </div>
  );
}
