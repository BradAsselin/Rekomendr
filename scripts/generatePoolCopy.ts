console.log(" generatePoolCopy starting");

import fs from "fs";
import path from "path";

import { RAW_MOVIES } from "../src/data/pools/movies";
import { RAW_TV } from "../src/data/pools/tv";
import { RAW_BOOKS } from "../src/data/pools/books";
import { RAW_WINE } from "../src/data/pools/wine";

type Tier = "T1" | "T2" | "T3";

type RawRekEntry = {
  title: string;
  year: number;
  genre: string;
  vibeTags: string[];
  tier: Tier;
  short?: string;
  long?: string;
  trailerUrl?: string;
};

type Gen = { short: string; long: string };

const API_URL =
  process.env.REKOMENDR_COPY_API || "http://localhost:3000/api/openai";

function promptFor(entry: RawRekEntry, vertical: string) {
  return `
You are writing concise, specific recommendation copy for a taste app.

VERTICAL: ${vertical}
TITLE: ${entry.title}
YEAR: ${entry.year}
GENRE: ${entry.genre}
VIBE TAGS: ${entry.vibeTags.join(", ")}
TIER: ${entry.tier}

Write:
1) short: ONE sentence, 1830 words, spoiler-free, concrete premise/angle, no generic filler.
2) long: 23 sentences, 4585 words total, spoiler-free, say what its about + what it feels like.

Rules:
- Do NOT repeat the title or year in short/long (UI already shows them).
- Do NOT use bullet characters like "".
- Do NOT say press play, easy to recommend, confidence pick, in-lane, credible session.
- Output ONLY valid JSON:
{"short":"...","long":"..."}
`.trim();
}

async function generate(entry: RawRekEntry, vertical: string): Promise<Gen> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: promptFor(entry, vertical) }),
  });

  const raw = await res.text();

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object returned from /api/openai");

  const parsed = JSON.parse(match[0]);
  if (!parsed?.short || !parsed?.long) throw new Error("JSON missing short/long");

  return {
    short: String(parsed.short).trim(),
    long: String(parsed.long).trim(),
  };
}

function tsString(s: string) {
  return JSON.stringify(s);
}

async function enrichBlock(name: string, raw: RawRekEntry[]) {
  console.log(`\n=== ${name} ===`);
  const out: RawRekEntry[] = [];

  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];

    if (r.short && r.long) {
      out.push(r);
      continue;
    }

    console.log(`Generating ${name}: ${r.title} (${r.year})`);
    const gen = await generate(r, name);
    out.push({ ...r, short: gen.short, long: gen.long });
  }

  return out;
}

function writeOut(fileName: string, exportName: string, enriched: RawRekEntry[]) {
  const lines: string[] = [];
  lines.push(`// AUTO-GENERATED. Do not hand edit. Re-run scripts/generatePoolCopy.ts\n`);
  lines.push(`export const ${exportName} = [\n`);

  for (const r of enriched) {
    lines.push(`  {`);
    lines.push(`    title: ${tsString(r.title)},`);
    lines.push(`    year: ${r.year},`);
    lines.push(`    genre: ${tsString(r.genre)},`);
    lines.push(`    vibeTags: ${JSON.stringify(r.vibeTags)},`);
    lines.push(`    tier: ${tsString(r.tier)} as const,`);
    if (r.trailerUrl) lines.push(`    trailerUrl: ${tsString(r.trailerUrl)},`);
    if (r.short) lines.push(`    short: ${tsString(r.short)},`);
    if (r.long) lines.push(`    long: ${tsString(r.long)},`);
    lines.push(`  },\n`);
  }

  lines.push(`] as const;\n`);

  const outPath = path.join(process.cwd(), "src", "data", "pools", fileName);
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
}

async function main() {
  const movies = await enrichBlock("Movies", RAW_MOVIES as any);
  const tv = await enrichBlock("TV Shows", RAW_TV as any);
  const books = await enrichBlock("Books", RAW_BOOKS as any);
  const wine = await enrichBlock("Wine", RAW_WINE as any);

  writeOut("movies.enriched.ts", "RAW_MOVIES_ENRICHED", movies);
  writeOut("tv.enriched.ts", "RAW_TV_ENRICHED", tv);
  writeOut("books.enriched.ts", "RAW_BOOKS_ENRICHED", books);
  writeOut("wine.enriched.ts", "RAW_WINE_ENRICHED", wine);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
