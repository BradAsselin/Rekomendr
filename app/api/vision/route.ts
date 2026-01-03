import { NextRequest, NextResponse } from "next/server";

interface Rek {
  id: string;
  title: string;
  year?: number;
  short: string;
  long?: string;
  trailerUrl?: string;
  genre?: string;
  vertical?: string;
}

const baseMovieReks: Rek[] = [
  {
    id: "movie-1",
    title: "The Grand Seduction",
    year: 2013,
    short:
      "A tiny harbor town pulls off an elaborate charm offensive to land a much-needed doctor. Gentle, funny, and perfect feel-good comfort.",
    trailerUrl: "https://www.youtube.com/results?search_query=the+grand+seduction+trailer",
    genre: "Comedy • Heartwarming",
    vertical: "movies",
  },
  {
    id: "movie-2",
    title: "Eurovision Song Contest: The Story of Fire Saga",
    year: 2020,
    short:
      "Icelandic underdogs chase their ridiculous pop-music dreams on the world’s cheesiest stage. Big heart, big songs, very dumb in all the right ways.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=eurovision+song+contest+fire+saga+trailer",
    genre: "Comedy • Music",
    vertical: "movies",
  },
  {
    id: "movie-3",
    title: "Hunt for the Wilderpeople",
    year: 2016,
    short:
      "A grumpy uncle, a rebellious kid, and the New Zealand bush. Deadpan humor with a surprising emotional punch.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=hunt+for+the+wilderpeople+trailer",
    genre: "Adventure • Comedy",
    vertical: "movies",
  },
  {
    id: "movie-4",
    title: "The 100-Year-Old Man Who Climbed Out the Window and Disappeared",
    year: 2013,
    short:
      "On his 100th birthday, a man climbs out the window and walks straight into an absurd crime caper. Quirky, European, and quietly insane.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=100+year+old+man+who+climbed+out+the+window+trailer",
    genre: "Comedy • Adventure",
    vertical: "movies",
  },
  {
    id: "movie-5",
    title: "The Intouchables",
    year: 2011,
    short:
      "An aristocrat and his live-in caretaker form an unlikely, life-changing friendship. Crowd-pleasing, funny, and very human.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+intouchables+trailer",
    genre: "Comedy • Drama",
    vertical: "movies",
  },
  {
    id: "movie-6",
    title: "Chef",
    year: 2014,
    short:
      "A burned-out chef starts a food-truck road trip with his son. Food porn, father-son bonding, and zero cynicism.",
    trailerUrl: "https://www.youtube.com/results?search_query=chef+2014+trailer",
    genre: "Comedy • Food",
    vertical: "movies",
  },
  {
    id: "movie-7",
    title: "About Time",
    year: 2013,
    short:
      "Time travel, family, and appreciating the ordinary day. A sneaky emotional gut-punch disguised as a rom-com.",
    trailerUrl: "https://www.youtube.com/results?search_query=about+time+trailer",
    genre: "Romance • Fantasy",
    vertical: "movies",
  },
  {
    id: "movie-8",
    title: "The Nice Guys",
    year: 2016,
    short:
      "Two idiot detectives bumble through a 1970s LA conspiracy. Fast, clever, and fun if you like sharp dialogue and chaos.",
    trailerUrl: "https://www.youtube.com/results?search_query=the+nice+guys+trailer",
    genre: "Comedy • Crime",
    vertical: "movies",
  },
  {
    id: "movie-9",
    title: "The Peanut Butter Falcon",
    year: 2019,
    short:
      "A runaway with Down syndrome and a small-time outlaw go on a raft adventure in the American South. Gentle, hopeful, and big-hearted.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+peanut+butter+falcon+trailer",
    genre: "Adventure • Drama",
    vertical: "movies",
  },
  {
    id: "movie-10",
    title: "Safety Not Guaranteed",
    year: 2012,
    short:
      "A classified ad seeks a partner for time travel. Low-budget, high-charm sci-fi romance about belief and second chances.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=safety+not+guaranteed+trailer",
    genre: "Comedy • Sci-Fi",
    vertical: "movies",
  },
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    vertical = "movies",
    clarifier,
    query,
    photoData,
  } = body as {
    vertical?: string;
    clarifier?: string;
    query?: string;
    photoData?: string | null;
  };

  // For this checkpoint: simple canned engine with light filtering.
  let source: Rek[] = baseMovieReks;

  // Very light “clarifier” and query nudge (not real AI, just flavor).
  let filtered = [...source];

  if (clarifier && clarifier.toLowerCase().includes("dark")) {
    filtered = filtered.filter((r) =>
      (r.genre || "").toLowerCase().includes("drama")
    );
    if (filtered.length < 5) filtered = source;
  } else if (clarifier && clarifier.toLowerCase().includes("fun")) {
    filtered = filtered.filter((r) =>
      (r.genre || "").toLowerCase().includes("comedy")
    );
    if (filtered.length < 5) filtered = source;
  }

  if (query && query.trim().length > 0) {
    const q = query.toLowerCase();
    filtered = filtered.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.short.toLowerCase().includes(q) ||
          (r.genre || "").toLowerCase().includes(q))
    );
    if (filtered.length < 5) filtered = source;
  }

  // “photoData” isn't used yet for logic, but it flows end-to-end.
  if (photoData) {
    // In a later build we’ll run vision here; for now this just proves the pipe.
  }

  return NextResponse.json(
    {
      reks: filtered,
    },
    { status: 200 }
  );
}
