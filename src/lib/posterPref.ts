"use client";

// S17 — posters on Movies/TV cards: on by default, hidden per device with
// the × on any poster ("Posters hidden · Undo"), back on from the Saved
// page footer ("Show posters"). One switch, every card follows it.
//
// localStorage can be missing or throw (private mode, blocked storage,
// previews): every read and write is wrapped, and a failure means posters
// stay ON — the default — never a broken card.

import { useEffect, useState } from "react";

const KEY = "rekomendr.posters_hidden";
const listeners = new Set<() => void>();
let memo: boolean | null = null; // this tab's answer when storage is unreadable

export function postersHidden(): boolean {
  if (memo !== null) return memo;
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPostersHidden(hidden: boolean): void {
  memo = hidden;
  try {
    if (hidden) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the choice holds for this tab only
  }
  listeners.forEach((fn) => fn());
}

// Read on the FIRST render: cards only ever render after a search (never
// server-side), so with posters hidden no <img> is ever created and no
// poster is requested, not even for one frame.
export function usePostersOn(): boolean {
  const [on, setOn] = useState(() => !postersHidden());
  useEffect(() => {
    const sync = () => setOn(!postersHidden());
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return on;
}
