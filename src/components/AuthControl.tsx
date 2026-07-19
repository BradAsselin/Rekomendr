"use client";

// S2b sign-in entry + signed-in indicator. Deliberately quiet: anonymous
// stays primary and nothing gates on a session — this control's only jobs
// are sending the magic link, showing signed-in state, and firing the
// fail-soft identity merge on auth events.

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { requestMerge, signInWithEmail, signOut } from "../lib/auth";

type SendStatus = "idle" | "sending" | "sent" | "error";

export default function AuthControl() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SendStatus>("idle");
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Click/tap outside closes the popover/menu. touchstart alongside
  // mousedown so a stray tap on mobile closes it without waiting for the
  // synthesized mouse event.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setStatus("idle");
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen((o) => !o);
    setStatus("idle");
  };

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = email.trim();
    if (!addr || status === "sending") return;
    setStatus("sending");
    const { error } = await signInWithEmail(addr);
    setStatus(error ? "error" : "sent");
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  return (
    // z-40 on the root is the load-bearing fix: -translate-y-1/2 creates a
    // stacking context, and with z-auto the whole control painted in DOM
    // order — underneath the later-sibling search card. The popover's own
    // z-index only competes within this context.
    <div
      ref={rootRef}
      className="absolute right-0 top-1/2 z-40 -translate-y-1/2 text-left"
    >
      {userEmail ? (
        <>
          <button
            type="button"
            onClick={toggleOpen}
            aria-label="Account"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2D5AB5]/10 text-sm font-semibold text-[#2D5AB5]"
          >
            {userEmail[0]?.toUpperCase() ?? "?"}
          </button>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="truncate text-xs text-gray-500">{userEmail}</div>
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2 text-sm text-[#2D5AB5]"
              >
                Sign out
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={toggleOpen}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Sign in
          </button>
          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
              {status === "sent" ? (
                <div className="text-sm text-gray-700">
                  {"Check your email — the sign-in link is on its way."}
                </div>
              ) : (
                <form onSubmit={sendLink}>
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
                    <div className="mt-2 text-xs text-amber-700">
                      {"Couldn’t send the link — give it another go."}
                    </div>
                  )}
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
