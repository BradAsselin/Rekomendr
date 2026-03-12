// data/profiles/asselin_household_movie_profile.ts

export type ReactionWeight = "love" | "like" | "mixed" | "avoid";

export type TasteAnchor = {
  title: string;
  year?: number;
  reaction: ReactionWeight;
  tags: string[];
  notes?: string;
};

export type HouseholdMovieProfile = {
  id: string;
  name: string;
  summary: string;
  compactPromptProfile: string;

  priorityLanes: string[];
  preferredTags: string[];
  avoidedTags: string[];
  actorBoosts: string[];

  descriptionStyle: {
    line1: string;
    line2: string;
  };

  hiddenGemBias: {
    enabled: boolean;
    minimumObscurityPreference: number; // 0-1
    famousTitlePenalty: number; // 0-1
  };

  anchors: TasteAnchor[];
};

export const asselinHouseholdMovieProfile: HouseholdMovieProfile = {
  id: "asselin-household-movies",
  name: "Asselin Household Movie Profile",
  summary:
    "Brad and Katrina prefer intelligent, engaging, well-paced movies with strong characters, real stakes, and satisfying payoff. They strongly favor true stories, competence-driven narratives, smart systems stories, investigative thrillers, charming hidden gems, and British storytelling. They dislike flat Oscar-bait, bleak prestige movies, slow pacing for its own sake, and cynical/joyless tone.",

  compactPromptProfile:
    "Brad and Katrina prefer intelligent, engaging, well-paced movies with strong characters and real stakes. Strongly favor true stories, competence-driven narratives, smart systems stories, investigative journalism, political/business/technical problem-solving, charming hidden gems, and well-written British productions. Hidden gems are preferred over obvious blockbusters unless the famous title is unusually perfect. Avoid flat Oscar-bait, bleak prestige movies, slow pacing for its own sake, random obscure filler, and cynical joyless tone. Older movies are fine if they still play cleanly and have real momentum. Recommendation copy should use two short lines: line 1 = story hook in plain English, line 2 = why it is worth watching / why it fits.",

  priorityLanes: [
    "competence-true-story",
    "systems-business-political",
    "smart-thriller",
    "hidden-gem-charmer",
    "absurd-comedy",
    "katrina-british-romantic",
  ],

  preferredTags: [
    "true-story",
    "based-on-real-events",
    "competence",
    "problem-solving",
    "investigative",
    "journalism",
    "political",
    "business",
    "finance",
    "espionage",
    "military",
    "leadership",
    "high-stakes",
    "well-paced",
    "smart-dialogue",
    "british",
    "heartwarming",
    "charming",
    "hidden-gem",
    "crowd-pleaser",
  ],

  avoidedTags: [
    "oscar-bait",
    "prestige-flat",
    "bleak",
    "nihilistic",
    "slow-burn-without-payoff",
    "art-house-homework",
    "cynical",
    "joyless",
    "random-obscure",
  ],

  actorBoosts: ["Tom Hanks", "Matt Damon", "Ben Affleck"],

  descriptionStyle: {
    line1: "Story hook first, plain English, 1 sentence.",
    line2: "Why it works / why it fits, 1 sentence, no critic jargon.",
  },

  hiddenGemBias: {
    enabled: true,
    minimumObscurityPreference: 0.55,
    famousTitlePenalty: 0.18,
  },

  anchors: [
    {
      title: "Apollo 13",
      year: 1995,
      reaction: "love",
      tags: ["true-story", "competence", "problem-solving", "leadership", "high-stakes", "well-paced"],
    },
    {
      title: "Moneyball",
      year: 2011,
      reaction: "love",
      tags: ["true-story", "systems", "business", "strategy", "smart-dialogue", "well-paced"],
    },
    {
      title: "The Big Short",
      year: 2015,
      reaction: "love",
      tags: ["true-story", "finance", "systems", "smart-dialogue", "high-stakes", "well-paced"],
    },
    {
      title: "Ford v Ferrari",
      year: 2019,
      reaction: "love",
      tags: ["true-story", "competence", "engineering", "leadership", "high-stakes"],
    },
    {
      title: "Argo",
      year: 2012,
      reaction: "love",
      tags: ["true-story", "espionage", "competence", "political", "high-stakes"],
    },
    {
      title: "Charlie Wilson's War",
      year: 2007,
      reaction: "love",
      tags: ["true-story", "political", "systems", "smart-dialogue", "Tom Hanks"],
    },
    {
      title: "The Founder",
      year: 2016,
      reaction: "love",
      tags: ["true-story", "business", "systems", "ambition", "well-paced"],
    },
    {
      title: "The Social Network",
      year: 2010,
      reaction: "love",
      tags: ["business", "systems", "smart-dialogue", "well-paced"],
    },
    {
      title: "Hidden Figures",
      year: 2016,
      reaction: "love",
      tags: ["true-story", "competence", "NASA", "problem-solving", "well-paced"],
    },
    {
      title: "Greyhound",
      year: 2020,
      reaction: "love",
      tags: ["military", "leadership", "competence", "Tom Hanks", "high-stakes"],
    },
    {
      title: "The Hunt for Red October",
      year: 1990,
      reaction: "love",
      tags: ["military", "espionage", "competence", "high-stakes"],
    },
    {
      title: "The Martian",
      year: 2015,
      reaction: "love",
      tags: ["competence", "problem-solving", "science", "well-paced", "Matt Damon"],
    },
    {
      title: "The Grand Seduction",
      year: 2013,
      reaction: "love",
      tags: ["heartwarming", "charming", "small-town", "hidden-gem"],
    },
    {
      title: "The Peanut Butter Falcon",
      year: 2019,
      reaction: "love",
      tags: ["heartwarming", "charming", "adventure", "hidden-gem"],
    },
    {
      title: "Hunt for the Wilderpeople",
      year: 2016,
      reaction: "love",
      tags: ["heartwarming", "quirky", "hidden-gem", "well-paced"],
    },
    {
      title: "Airplane!",
      year: 1980,
      reaction: "love",
      tags: ["comedy", "absurd", "quotable"],
    },
    {
      title: "National Lampoon's Christmas Vacation",
      year: 1989,
      reaction: "love",
      tags: ["comedy", "holiday", "quotable"],
    },
    {
      title: "Eurovision Song Contest: The Story of Fire Saga",
      year: 2020,
      reaction: "love",
      tags: ["comedy", "musical", "heartwarming", "absurd"],
    },
    {
      title: "Pride & Prejudice",
      year: 2005,
      reaction: "love",
      tags: ["romance", "british", "comfort-watch", "katrina-lane"],
    },
    {
      title: "The Holiday",
      year: 2006,
      reaction: "love",
      tags: ["romance", "comfort-watch", "katrina-lane"],
    },
    {
      title: "Notting Hill",
      year: 1999,
      reaction: "love",
      tags: ["romance", "british", "comfort-watch", "katrina-lane"],
    },
    {
      title: "Julie & Julia",
      year: 2009,
      reaction: "like",
      tags: ["comfort-watch", "food", "katrina-lane"],
    },
    {
      title: "Local Hero",
      year: 1983,
      reaction: "mixed",
      tags: ["charming", "small-town", "older", "dated-pacing"],
      notes: "Right feel, but pacing and humor felt aged.",
    },
    {
      title: "Moonlight",
      year: 2016,
      reaction: "avoid",
      tags: ["prestige-flat", "oscar-bait"],
    },
    {
      title: "Everything Everywhere All at Once",
      year: 2022,
      reaction: "avoid",
      tags: ["overhyped-for-profile", "too-chaotic-for-profile"],
    },
  ],
};
