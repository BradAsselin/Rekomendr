// src/pages/api/seed.ts
import type { NextApiRequest, NextApiResponse } from "next";

// Same type we use in ResultsV4
export type Rec = {
  id: string;
  title: string;
  year?: string;
  blurb: string;
};

// Hardcoded seed lists (guest tier)
const SEEDS: Record<string, Rec[]> = {
  movies: [
    {
      id: "casablanca",
      title: "Casablanca",
      year: "1942",
      blurb:
        "Classic romance and intrigue in WWII Morocco, with unforgettable lines and timeless chemistry.",
    },
    {
      id: "parasite",
      title: "Parasite",
      year: "2019",
      blurb:
        "Bong Joon-ho’s genre-bending masterpiece about class tension, sharp wit, and shocking twists.",
    },
    {
      id: "madmax-furyroad",
      title: "Mad Max: Fury Road",
      year: "2015",
      blurb:
        "A relentless, visually stunning action spectacle that redefined blockbuster filmmaking.",
    },
    {
      id: "spirited-away",
      title: "Spirited Away",
      year: "2001",
      blurb:
        "Hayao Miyazaki’s magical coming-of-age story, brimming with heart and imagination.",
    },
    {
      id: "zodiac",
      title: "Zodiac",
      year: "2007",
      blurb:
        "David Fincher’s chilling, obsessive chronicle of the Zodiac killer investigation.",
    },
  ],
  tv: [
    {
      id: "succession",
      title: "Succession",
      year: "2018–2023",
      blurb:
        "Darkly funny and brutally sharp drama about a dysfunctional media dynasty.",
    },
    {
      id: "better-call-saul",
      title: "Better Call Saul",
      year: "2015–2022",
      blurb:
        "A brilliant slow-burn prequel to Breaking Bad, mixing legal drama and moral collapse.",
    },
    {
      id: "the-wire",
      title: "The Wire",
      year: "2002–2008",
      blurb:
        "Gritty, layered exploration of Baltimore through cops, dealers, and institutions.",
    },
    {
      id: "dark",
      title: "Dark",
      year: "2017–2020",
      blurb:
        "German sci-fi mystery weaving time travel and family secrets into an intricate puzzle.",
    },
    {
      id: "the-office",
      title: "The Office",
      year: "2005–2013",
      blurb:
        "Lovably awkward mockumentary sitcom about everyday chaos in a paper company.",
    },
  ],
  wine: [
    {
      id: "cali-cab",
      title: "California Cabernet Sauvignon",
      blurb:
        "Bold and fruit-forward with ripe blackberry and cassis; smooth oak finish.",
    },
    {
      id: "sancerre",
      title: "Sancerre Sauvignon Blanc",
      blurb:
        "Crisp, mineral-driven white from the Loire Valley, with citrus and flinty notes.",
    },
    {
      id: "rioja-crianza",
      title: "Rioja Crianza",
      blurb:
        "Balanced Spanish red with bright cherry fruit and subtle vanilla from oak aging.",
    },
    {
      id: "pinot-noir",
      title: "Oregon Pinot Noir",
      blurb:
        "Elegant and silky with red berry flavors and earthy undertones; versatile pairing wine.",
    },
    {
      id: "aussie-shiraz",
      title: "Barossa Valley Shiraz",
      blurb:
        "Big, spicy Australian red bursting with blackberry, pepper, and mocha notes.",
    },
  ],
  books: [
    {
      id: "midnight-library",
      title: "The Midnight Library",
      year: "2020",
      blurb:
        "Matt Haig’s moving tale of regrets, possibilities, and choosing to live fully.",
    },
    {
      id: "educated",
      title: "Educated",
      year: "2018",
      blurb:
        "Tara Westover’s memoir of resilience and self-invention, from survivalist roots to academia.",
    },
    {
      id: "dune",
      title: "Dune",
      year: "1965",
      blurb:
        "Frank Herbert’s epic sci-fi saga of politics, prophecy, and ecology on desert planet Arrakis.",
    },
    {
      id: "circe",
      title: "Circe",
      year: "2018",
      blurb:
        "Madeline Miller’s lyrical retelling of Greek myth from the witch Circe’s perspective.",
    },
    {
      id: "atomic-habits",
      title: "Atomic Habits",
      year: "2018",
      blurb:
        "James Clear’s practical framework for building better habits and breaking bad ones.",
    },
  ],
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const v = typeof req.query.v === "string" ? req.query.v.toLowerCase() : "";
  const items = SEEDS[v] ?? [];

  res.status(200).json({ items });
}
