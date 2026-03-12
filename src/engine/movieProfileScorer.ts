import { asselinHouseholdMovieProfile } from "../data/profiles/asselin_household_movie_profile";

export type MovieCandidate = {
  title: string;
  year?: number;
  description?: string;
  reason?: string;
  tags?: string[];
  actors?: string[];
  lane?: string;
  isHiddenGem?: boolean;
  popularity?: number; // 0-1, where 1 = very famous
};

export type UserSessionSignals = {
  activeLane?: string | null;
  likedTitles?: string[];
  dislikedTitles?: string[];
  moreLikeThisTitle?: string | null;
};

function reactionWeightToScore(
  reaction: "love" | "like" | "mixed" | "avoid"
): number {
  switch (reaction) {
    case "love":
      return 3;
    case "like":
      return 1.5;
    case "mixed":
      return -0.75;
    case "avoid":
      return -3;
    default:
      return 0;
  }
}

export function scoreMovieCandidate(
  candidate: MovieCandidate,
  session: UserSessionSignals = {}
): number {
  const profile = asselinHouseholdMovieProfile;
  let score = 0;

  const candidateTags = new Set(
    (candidate.tags ?? []).map((t) => t.toLowerCase())
  );
  const candidateActors = new Set(
    (candidate.actors ?? []).map((a) => a.toLowerCase())
  );

  for (const tag of profile.preferredTags) {
    if (candidateTags.has(tag.toLowerCase())) score += 1.2;
  }

  for (const tag of profile.avoidedTags) {
    if (candidateTags.has(tag.toLowerCase())) score -= 2.2;
  }

  for (const actor of profile.actorBoosts) {
    if (candidateActors.has(actor.toLowerCase())) score += 1.1;
  }

  if (candidate.lane && profile.priorityLanes.includes(candidate.lane)) {
    const laneIndex = profile.priorityLanes.indexOf(candidate.lane);
    score += Math.max(0.5, 2.5 - laneIndex * 0.3);
  }

  for (const anchor of profile.anchors) {
    const overlap = anchor.tags.filter((tag) =>
      candidateTags.has(tag.toLowerCase())
    ).length;

    if (overlap > 0) {
      score += overlap * reactionWeightToScore(anchor.reaction) * 0.28;
    }
  }

  if (profile.hiddenGemBias.enabled && candidate.isHiddenGem) {
    score += 1.6;
  }

  if (
    profile.hiddenGemBias.enabled &&
    typeof candidate.popularity === "number"
  ) {
    score -= candidate.popularity * profile.hiddenGemBias.famousTitlePenalty * 4;
  }

  if (session.activeLane && candidate.lane === session.activeLane) {
    score += 2.2;
  }

  if (session.moreLikeThisTitle) {
    score += 0.8;
  }

  if ((session.dislikedTitles ?? []).includes(candidate.title)) {
    score -= 10;
  }

  return score;
}

export function rankMovieCandidates(
  candidates: MovieCandidate[],
  session: UserSessionSignals = {}
): MovieCandidate[] {
  return [...candidates].sort(
    (a, b) => scoreMovieCandidate(b, session) - scoreMovieCandidate(a, session)
  );
}