// src/pages/api/nudge.ts
import type { NextApiRequest, NextApiResponse } from "next";

type Body = {
  vertical?: "movies" | "tv" | "wine" | "books";
  history?: string[]; // last few queries/titles
};

// Canned fallbacks (rule-based pick for now; later swap for real AI)
const FALLBACKS: Record<string, string[]> = {
  movies: [
    "Okay, enough rom-coms… how about an adventure?",
    "Too many explosions? Let’s try something quieter.",
    "You’ve seen enough Oscar bait — want a guilty pleasure pick?",
  ],
  tv: [
    "Enough crime drama — let’s laugh instead.",
    "Binge alert! Maybe something lighter this time?",
    "Reality check: how about some unscripted fun?",
  ],
  wine: [
    "Cabernet overload? Let’s swirl into something new.",
    "You’ve been in France all night… how about Italy?",
    "Dry spell? Maybe something a little sweeter.",
  ],
  books: [
    "Plot twist: switch genres?",
    "Enough heavy reading — let’s grab something breezy.",
    "Trade mystery for inspiration?",
  ],
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { vertical = "movies", history = [] } = (req.body || {}) as Body;
  const lowerHist = history.join(" ").toLowerCase();

  let pool = FALLBACKS[vertical] || FALLBACKS.movies;

  // Light rule tweaks (feels a bit “aware” even before real AI)
  if (vertical === "movies" && /rom.?com|romantic/.test(lowerHist)) {
    pool = ["Okay, enough rom-coms… how about an adventure?"];
  } else if (vertical === "tv" && /(crime|detective|cop)/.test(lowerHist)) {
    pool = ["Enough crime drama — let’s laugh instead."];
  } else if (vertical === "wine" && /(cabernet|cab)/.test(lowerHist)) {
    pool = ["Cabernet overload? Let’s swirl into something new."];
  }

  // Later: call your model with a 400–600ms timeout; on timeout, return canned.
  // The API surface remains the same.
  return res.status(200).json({ nudge: pick(pool) });
}
