// src/lib/standaloneLine.ts — S31 (Brad, 2026-10-31). More like this
// sets stay seeded on the tapped title, but every card's line stands
// alone, as if no seed existed: no "Same…, but…", no "Trades X for Y",
// no "instead of…". The prompts carry the instruction (pressure); this is
// the check both lanes run on what comes back (the guarantee). Shared by
// the server chooser (src/lib/mediaReks.ts) and the client engine
// (src/engine/rekomendrEngine.ts), so it imports nothing.

const COMPARATIVE: [string, RegExp][] = [
  ["same/like opener", /^\s*(same|similar(ly)?|like|unlike|also|just like)\b/i],
  // "Trades X for Y" / "Swaps X for Y" — not "a trade school".
  ["trades", /\btrad(e|es|ing)\b[^.!?]*\bfor\b/i],
  ["swaps", /\bswap(s|ping)?\b[^.!?]*\bfor\b/i],
  ["instead of", /\binstead of\b/i],
  ["rather than", /\brather than\b/i],
  // A comparative ("quieter than", "more dangerous than") — not a story's
  // own numbers ("less than 72 hours").
  ["comparative than", /\b\w+er than\b|\b(more|less)\s+\w+(\s+\w+)?\s+than\b/i],
];

// Why a line compares (null when it stands alone). Naming the seed title
// counts: the line must read as if there were no seed.
export function comparativeReason(line: string, seedTitle: string): string | null {
  for (const [why, re] of COMPARATIVE) if (re.test(line)) return why;
  const seed = seedTitle.trim().toLowerCase();
  if (seed.length >= 3 && line.toLowerCase().includes(seed)) return "names the seed";
  return null;
}

// A multi-sentence card text without its comparing sentences. Empty when
// nothing stands alone.
export function dropComparingSentences(text: string, seedTitle: string): { text: string; dropped: string[] } {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["'’”)]*(\s|$)|[^.!?]+$/g) ?? [];
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const why = comparativeReason(s, seedTitle);
    if (why) dropped.push(why);
    else kept.push(s);
  }
  return { text: kept.join(" "), dropped };
}
