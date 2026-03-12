// lib/rekomendr/detectMovieLane.ts

export function detectMovieLane(input: string): string {
  const q = input.toLowerCase();

  if (
    q.includes("true story") ||
    q.includes("based on real") ||
    q.includes("apollo") ||
    q.includes("moneyball") ||
    q.includes("big short") ||
    q.includes("ford v ferrari") ||
    q.includes("founder") ||
    q.includes("investigation")
  ) {
    return "competence-true-story";
  }

  if (
    q.includes("business") ||
    q.includes("finance") ||
    q.includes("political") ||
    q.includes("espionage") ||
    q.includes("journalism")
  ) {
    return "systems-business-political";
  }

  if (
    q.includes("thriller") ||
    q.includes("smart thriller") ||
    q.includes("tense") ||
    q.includes("red october") ||
    q.includes("fugitive")
  ) {
    return "smart-thriller";
  }

  if (
    q.includes("heartwarming") ||
    q.includes("cozy") ||
    q.includes("small town") ||
    q.includes("feel good") ||
    q.includes("peanut butter falcon")
  ) {
    return "hidden-gem-charmer";
  }

  if (
    q.includes("comedy") ||
    q.includes("funny") ||
    q.includes("airplane") ||
    q.includes("christmas vacation")
  ) {
    return "absurd-comedy";
  }

  if (
    q.includes("british") ||
    q.includes("romance") ||
    q.includes("period") ||
    q.includes("downton") ||
    q.includes("sherlock") ||
    q.includes("pride and prejudice")
  ) {
    return "katrina-british-romantic";
  }

  return "competence-true-story";
}
