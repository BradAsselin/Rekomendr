// src/engine/compass/moviesCompass.ts
// Compass config for MOVIES only, keyed by starterDeckId / deckId.
//
// Why deckId?
// - Your locked vibes map to a deckId via VIBE_TO_DECK.
// - deckId is stable + canonical; vibe display strings can change.

export type MovieDeckId =
  | "comfort-core"
  | "goofy-fun"
  | "feelgood-crowd"
  | "smart-witty"
  | "romantic-heartfelt"
  | "dark-twisty"
  | "edge-seat"
  | "epic-immersive"
  | "action-adrenaline"
  | "thoughtful-meaningful"
  | "weird-offbeat"
  | "doc-real";

export type CompassConfig = {
  anchors: string[];   // target: 2
  neighbors: string[]; // target: 2
  wildcards: string[]; // target: 1
};

export const MOVIE_COMPASS_BY_DECK: Partial<Record<MovieDeckId, CompassConfig>> = {
  "goofy-fun": {
    anchors: ["Finding Nemo", "School of Rock"],
    neighbors: ["Toy Story", "The Princess Bride", "Paddington", "Elf"],
    wildcards: ["Hunt for the Wilderpeople", "Moonrise Kingdom"],
  },

  "dark-twisty": {
    anchors: ["Gone Girl", "Prisoners"],
    neighbors: ["Zodiac", "Nightcrawler", "Shutter Island", "No Country for Old Men"],
    wildcards: ["The Game", "A Simple Plan"],
  },

  "feelgood-crowd": {
    anchors: ["Chef", "The Secret Life of Walter Mitty"],
    neighbors: ["Big Fish", "The Intern", "Little Miss Sunshine", "Julie & Julia"],
    wildcards: ["Safety Not Guaranteed", "The Hundred-Foot Journey"],
  },

  "romantic-heartfelt": {
    anchors: ["When Harry Met Sally...", "Notting Hill"],
    neighbors: ["About Time", "10 Things I Hate About You", "You've Got Mail", "Crazy, Stupid, Love."],
    wildcards: ["Palm Springs", "Ruby Sparks"],
  },

  "action-adrenaline": {
    anchors: ["John Wick", "Mission: Impossible - Fallout"],
    neighbors: ["Mad Max: Fury Road", "Skyfall", "The Bourne Identity", "Sicario"],
    wildcards: ["Edge of Tomorrow", "Baby Driver"],
  },

  // You can add more decks over time. Start small.
};
