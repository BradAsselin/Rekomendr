"use client";

import React from "react";

// The media completion verbs — ▶ Trailer + Where to watch — shared by both
// lanes (snap anchor, snap media rek cards, search expanded media cards) so
// the markup can never drift. Two components rather than one because the
// standardized bottom row places them in different zones: Trailer is the
// LEFT ▶ video verb, Where-to-watch the MIDDLE completion verb. Pure link
// handoffs, same pattern as recipes/show-me: a YouTube search for the
// trailer and a neutral Google search for where-to-watch. No availability
// lookup, no affiliate logic.

export const TrailerVerb: React.FC<{
  name: string;
  // Curated trailer link when the caller has one (search's rek.trailerUrl);
  // falls back to the YouTube "${name} trailer" search.
  href?: string;
}> = ({ name, href }) => {
  const url =
    href ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(
      `${name} trailer`
    )}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline flex items-center gap-1"
    >
      <span>▶</span> Trailer
    </a>
  );
};

export const WhereToWatchVerb: React.FC<{ name: string }> = ({ name }) => {
  const url = `https://www.google.com/search?q=${encodeURIComponent(
    `where to watch ${name}`
  )}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:underline"
    >
      Watch
    </a>
  );
};
