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

// Title-tap handoff (media only, Brad's revert of Ledger #8 for media):
// tapping a movie/TV title anywhere it renders opens the Google info page
// for it in a new tab. Same neutral-Google-search pattern as Watch. The
// name is used as stored — no cleanup here (known banked item: snap names
// like "Home Alone DVD" ride into the query as-is).
export const titleInfoUrl = (name: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(name)}`;

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

// S3.0 — WHERE TO WATCH, from TMDb's watch/providers (US). Two pieces:
//   WatchLine — the anchor's one new tap target (charter §2.6): a quiet
//     line that already answers "where can I watch it?" with the first
//     services, and opens the full list on tap.
//   WatchList — the opened list: Stream first, then Rent or buy, each a
//     direct link, and the JustWatch attribution TMDb's terms require.
// Firewall (§2.1): services appear where the title actually is, in TMDb /
// JustWatch's own order. Nothing here knows what any of them pays.
export type WatchProviderLink = { name: string; url: string };
export type WatchInfoView = {
  link: string;
  stream: WatchProviderLink[];
  rentBuy: WatchProviderLink[];
};

const watchSummary = (w: WatchInfoView): string => {
  const names = (w.stream.length > 0 ? w.stream : w.rentBuy).slice(0, 2).map((p) => p.name);
  const lead = w.stream.length > 0 ? "Stream on" : "Rent or buy on";
  const more =
    (w.stream.length > 0 ? w.stream.length : w.rentBuy.length) > 2 ? " and more" : "";
  return `${lead} ${names.join(", ")}${more}`;
};

export const WatchLine: React.FC<{
  watch: WatchInfoView;
  open: boolean;
  onToggle: () => void;
}> = ({ watch, open, onToggle }) => (
  <div className="mb-1" onClick={(e) => e.stopPropagation()}>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="text-left text-[15px] text-gray-900 hover:underline"
    >
      {watchSummary(watch)} <span aria-hidden="true">{open ? "▴" : "▾"}</span>
    </button>
    {open && <WatchList watch={watch} />}
  </div>
);

const ProviderRow: React.FC<{ label: string; providers: WatchProviderLink[] }> = ({
  label,
  providers,
}) =>
  providers.length === 0 ? null : (
    <div className="mt-1.5 text-[15px] leading-relaxed text-gray-900">
      <span className="text-gray-600">{label}: </span>
      {providers.map((p, i) => (
        <React.Fragment key={p.name}>
          {i > 0 && <span className="text-gray-600"> · </span>}
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-gray-400 underline-offset-2 hover:decoration-gray-900"
          >
            {p.name}
          </a>
        </React.Fragment>
      ))}
    </div>
  );

export const WatchList: React.FC<{ watch: WatchInfoView }> = ({ watch }) => (
  <div className="mt-1 mb-1">
    <ProviderRow label="Stream" providers={watch.stream} />
    <ProviderRow label="Rent or buy" providers={watch.rentBuy} />
    <div className="mt-1.5 text-[12px] text-gray-600">
      via{" "}
      <a
        href={watch.link}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        JustWatch
      </a>
    </div>
  </div>
);
