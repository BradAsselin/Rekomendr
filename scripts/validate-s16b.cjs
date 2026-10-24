#!/usr/bin/env node
/* S16b — fast typed search for Movies/TV (docs/s16-watched-search-plan.md, Part B).
 * The slots route's early paint (cards with facts first, then the "vs."
 * lines; the writer starts before the bundles finish), the client's NDJSON
 * reader (same cards, lines merged), the typed-mood routing in the page
 * (parse beside the title check, title wins, fallbacks named, Books and
 * Wine untouched), the in-place merge in the results, and no prompt or
 * wording change. No network: TMDb, the writer and the database are stubs.
 * Run: node scripts/validate-s16b.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
for (const level of ["warn", "info", "error"]) console[level] = () => {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the route, with TMDb / writer / taste stubbed ----------------------
const media = load("src/lib/tmdbMedia.ts", { "./tmdbVerify": { authFor: () => ({}), normalizeTitle: norm } });
const mk = (prefix, n, votes0, genre = 9648) =>
  Array.from({ length: n }, (_, i) => ({ id: prefix.charCodeAt(0) * 1000 + i, kind: "movie", title: `${prefix} ${i}`, year: 2010, overview: `${prefix} ${i} is a mystery. It has a second sentence.`, genreIds: [genre], votes: votes0 - i * 10, rating: 7.5 }));
const tier1 = mk("T", 50, 30000);
const pools = { tier1, tier2: mk("U", 50, 9000), tier3: mk("V", 50, 4000), touchstones: tier1.slice(0, 20), popular: tier1.slice(20), fresh: mk("F", 50, 2000), classic: mk("C", 50, 8000) };

const events = [];
let bundleDelay = 300;
const bundleFor = (kind, id) => ({
  id, kind, title: `t${id}`, year: 2010, overview: "o", genreIds: [9648],
  completion: { trailerUrl: null, watch: id % 2 ? { link: "l", stream: [{ name: "Netflix", url: "u" }], rentBuy: [] } : { link: "l", stream: [], rentBuy: [] }, availability: null },
  candidates: tier1.slice(0, 30), commitment: kind === "movie" ? "2h 10m" : "3 seasons · 30 episodes", rating: 7.5, votes: 3000,
});
const R0 = load("src/lib/slotRecipe.ts", { "./tmdbVerify": { normalizeTitle: norm }, "./tmdbMedia": media });
const R = { ...R0, loadPools: async () => pools, loadGoTos: async (kind, goTos) => goTos.map((g) => ({ ...g, bundle: bundleFor(kind, 777) })) };
let writerFails = false;
const route = load("app/api/slots/route.ts", {
  "../../../src/lib/envCheck": { runEnvCheck() {} },
  "../../../src/lib/llm": { withLlmContext: (_req, fn) => fn() },
  "../../../src/lib/anchorSnapshots": { cleanClientId: (x) => (typeof x === "string" ? x : null) },
  "../../../src/lib/apiUsage": { capGate: async () => null },
  "../../../src/lib/tmdbMedia": {
    ...media,
    mediaConfigured: () => true,
    loadMediaBundle: async (kind, id) => {
      events.push(["bundle-start", id]);
      await sleep(bundleDelay);
      events.push(["bundle-end", id]);
      return bundleFor(kind, id);
    },
  },
  "../../../src/lib/tmdbVerify": { normalizeTitle: norm },
  "../../../src/lib/mediaReks": {
    raceTaste: async () => ({ liked: [], disliked: [], watched: ["T 0"] }),
    linesVsGoTo: async ({ candidates }) => {
      events.push(["writer-start"]);
      await sleep(500);
      events.push(["writer-end"]);
      if (writerFails) throw new Error("writer down");
      return new Map(candidates.map((c) => [c.id, `Darker than it, same puzzle box (${c.title}).`]));
    },
  },
  "../../../src/lib/slotRecipe": R,
  "../../../src/lib/openaiFailure": { maybeSimulateOpenAIFailure() {}, openAIFailureResponse: () => null },
});
const post = (body) => route.POST(new Request("http://x/api/slots", { method: "POST", body: JSON.stringify(body) }));
const readNdjson = async (res) => {
  const out = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      out.push({ at: Date.now(), msg: JSON.parse(buf.slice(0, nl)) });
      buf = buf.slice(nl + 1);
    }
  }
  return out;
};

(async () => {
  const base = { clientId: "anon_test_client_1234", category: "Movies", lane: "Mystery", refiner: null, seen: [] };

  console.log("1. Early paint: cards first (with facts), then the lines");
  events.length = 0;
  const t0 = Date.now();
  let res = await post({ ...base, goTos: [{ name: "Knives Out", tmdbKind: "movie", tmdbId: 546554, at: "2026-10-01" }], stream: "ndjson" });
  check("answers NDJSON", (res.headers.get("content-type") || "").includes("ndjson"), true);
  let msgs = await readNdjson(res);
  check("two messages: cards, then lines", msgs.map((m) => m.msg.type), ["cards", "lines"]);
  const cards = msgs[0].msg;
  check("five cards", cards.reks.length, 5);
  check("cards carry TMDb synopses (no line yet)", cards.reks.every((r) => r.vsGoTo === null && /is a mystery\./.test(r.short)), true);
  check("cards carry commitment + where to watch", cards.reks.every((r) => r.facts[0] === "2h 10m" && (r.facts.length === 1 || r.facts[1] === "on Netflix")), true);
  check("linesPending true while the writer runs", cards.linesPending, true);
  check("steer + order in the head", [cards.steer, cards.order], ["Knives Out", ["Knives Out"]]);
  check("watched titles never ship (taste.watched)", cards.reks.some((r) => r.title === "T 0"), false);
  check("cards land before the writer finishes", msgs[0].at - t0 < 800 && msgs[1].at - msgs[0].at > 100, true);
  const ws = events.findIndex((e) => e[0] === "writer-start");
  const lastBundleEnd = events.map((e) => e[0]).lastIndexOf("bundle-end");
  check("the writer starts before the bundles finish (parallel)", ws >= 0 && ws < lastBundleEnd, true);
  const lines = msgs[1].msg.lines;
  check("lines keyed by tmdbId, one per card", lines.map((l) => l.tmdbId).sort(), cards.reks.map((r) => r.tmdbId).sort());
  check("line = leadLine, vs the steering go-to", lines.every((l) => l.vsGoTo === "Knives Out" && /^darker than it/.test(l.short)), true);

  console.log("\n2. No go-to: no writer, linesPending false, empty lines");
  events.length = 0;
  res = await post({ ...base, goTos: [], stream: "ndjson" });
  msgs = await readNdjson(res);
  check("cards + empty lines", [msgs[0].msg.linesPending, msgs[1].msg.lines.length], [false, 0]);
  check("no writer call", events.some((e) => e[0] === "writer-start"), false);

  console.log("\n3. Writer down: synopses stand, named");
  writerFails = true;
  res = await post({ ...base, goTos: [{ name: "Knives Out", tmdbKind: "movie", tmdbId: 546554, at: "2026-10-01" }], stream: "ndjson" });
  msgs = await readNdjson(res);
  check("cards, then no lines", [msgs[0].msg.reks.length, msgs[1].msg.lines.length], [5, 0]);
  writerFails = false;

  console.log("\n4. A slow bundle never holds the cards past the hang guard");
  check("guard is 4 s", /const BUNDLE_WAIT_MS = 4000;/.test(read("app/api/slots/route.ts")), true);

  console.log("\n5. Plain JSON (one-card backfill) keeps its shape, plus facts");
  res = await post({ ...base, goTos: [], count: 1 });
  const json = await res.json();
  check("JSON, one card, facts", [json.ok, json.reks.length, json.reks[0].facts[0]], [true, 1, "2h 10m"]);

  console.log("\n6. The client reader: same cards, lines merged by id");
  const SC = load("src/lib/slotsClient.ts", {
    "./userPrefs": { getAnonymousClientId: () => "anon_test_client_1234" },
    "./goTos": { goTosFor: () => [] },
    "./screenVisit": { visitSeen: () => [] },
    "./aiServiceError": { readServiceFailure: async () => null },
  });
  const streamed = [
    JSON.stringify({ type: "cards", ok: true, steer: "Knives Out", order: ["Knives Out"], linesPending: true, reks: [1, 2, 3].map((i) => ({ title: `M${i}`, year: 2010, tmdbId: i, short: "syn", long: "syn long", slot: "neighbor", vsGoTo: null, facts: ["2h"] })) }),
    JSON.stringify({ type: "lines", lines: [{ tmdbId: 1, short: "darker.", vsGoTo: "Knives Out" }, { tmdbId: 3, short: "funnier.", vsGoTo: "Knives Out" }] }),
  ];
  let sentBody = null;
  globalThis.fetch = async (_u, init) => {
    sentBody = JSON.parse(init.body);
    const enc = new TextEncoder();
    const body = new ReadableStream({
      async start(c) {
        c.enqueue(enc.encode(streamed[0] + "\n"));
        await sleep(50);
        c.enqueue(enc.encode(streamed[1] + "\n"));
        c.close();
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": "application/x-ndjson" } });
  };
  let painted = null;
  const fin = await SC.fetchSlots({ category: "Movies", lane: "Mystery", refiner: null }, { onCards: (c) => (painted = c) });
  check("asks for the stream", sentBody.stream, "ndjson");
  check("onCards fired with synopses + linesPending", [painted.reks.length, painted.reks[0].short, painted.linesPending], [3, "syn", true]);
  check("final = the SAME ids", fin.reks.map((r) => r.id), painted.reks.map((r) => r.id));
  check("lines merged where written", fin.reks.map((r) => [r.short, r.vsGoTo]), [["darker.", "Knives Out"], ["syn", null], ["funnier.", "Knives Out"]]);
  check("facts survive", fin.reks[0].facts, ["2h"]);
  await SC.fetchSlots({ category: "Movies", lane: null, refiner: null }, { count: 1, onCards: () => {} });
  check("a one-card backfill never streams", sentBody.stream, undefined);

  console.log("\n7. The page: typed moods → slots; titles, Books and Wine unchanged");
  const page = read("app/page.tsx");
  check("parse runs beside the prefs read and the title check", /Promise\.all\(\[\s*loadPrefsForCategory\(nextCategory\),\s*typedText \? resolveTypedAnchor\(typedText, nextCategory\) : Promise\.resolve\(null\),\s*typedMood \? parseTypedMood\(typedText, nextCategory\) : Promise\.resolve\(null\),/.test(page), true);
  check("typed moods only on Movies/TV, never on a chip or steer run", /const typedMood =\s*!slotReq && !!typedText && \(nextCategory === "Movies" \|\| nextCategory === "TV Shows"\);/.test(page), true);
  const iAnchor = page.indexOf("if (typedAnchor) {");
  const iPlan = page.indexOf("const plan = slotPlanFromMood(mood);");
  check("a typed title still lands as the anchor first", iAnchor > 0 && iPlan > iAnchor, true);
  check("the parse posts source: typed", /source: "typed",/.test(page), true);
  check("fallbacks are named", ['"[typed-mood] → AI search"', "parse_failed", "not_mapped", '"category"'].every((s) => page.includes(s)), true);
  check("slots path paints early and merges lines", /onCards: \(c\) => \{[\s\S]*?setLinesPending\(c\.linesPending\);[\s\S]*?setLoading\(false\);/.test(page) && /if \(painted\) setReks\(ans\.reks\);/.test(page), true);
  check("voice and typed share one mapping", (page.match(/slotPlanFromMood\(/g) || []).length, 3);
  const mood = read("app/api/mood/route.ts");
  check("typed moods are not stored as voice", /const store = clientId && source === "voice" \? await getSnapshotStore\(\) : null;/.test(mood), true);

  console.log("\n7b. The gate: only moods the chip vocabulary holds whole go fast");
  const G = load("src/lib/typedMoodGate.ts", {});
  const L = (lane) => ({ label: lane, lane });
  // The parses the preview produced for the ten measured moods (2026-10-24).
  const measured = [
    ["a cozy mystery", { lane: L("Mystery"), refiner: "Feel-good" }, false],
    ["something like Ted Lasso but darker", { lane: L("Comedy"), refiner: "Dark", goTo: { name: "Ted Lasso" } }, false],
    ["a funny heist movie", { lane: L("Comedy"), refiner: null }, false],
    ["a slow-burn psychological thriller", { lane: L("Thriller"), refiner: "Smart" }, false],
    ["something light and romantic for date night", { lane: L("Romance"), refiner: "Feel-good" }, false],
    ["a mind-bending sci-fi movie", { lane: L("Sci-Fi"), refiner: "Smart" }, false],
    ["a dark crime show", { lane: L("Crime"), refiner: "Dark" }, true],
    ["an uplifting sports movie", { lane: L("Drama"), refiner: "Feel-good" }, false],
    ["a scary movie that isn't too gory", { lane: L("Horror"), refiner: null }, false],
    ["a show like The Office", { lane: L("Comedy"), refiner: null, goTo: { name: "The Office" } }, false],
  ];
  for (const [text, mood, fast] of measured) check(`"${text}" → ${fast ? "fast" : "AI search"}`, G.typedMoodGate(text, mood).fast, fast);
  check("residual names what the vocabulary couldn't hold", G.typedMoodGate("an uplifting sports movie", measured[7][1]).residual, ["sports"]);
  check("a named title is its own reason", G.typedMoodGate("a show like The Office", measured[9][1]).reason, "named_title");
  const simple = [
    ["something funny", { lane: L("Comedy"), refiner: null }],
    ["I want a scary movie", { lane: L("Horror"), refiner: null }],
    ["a feel-good comedy", { lane: L("Comedy"), refiner: "Feel-good" }],
    ["a new sci-fi show", { lane: L("Sci-Fi"), refiner: "New" }],
    ["classic romance", { lane: L("Romance"), refiner: "Classic" }],
    ["something dark and twisty", { lane: L("Thriller"), refiner: "Dark" }],
    ["a clever thriller tonight", { lane: L("Thriller"), refiner: "Smart" }],
  ];
  for (const [text, mood] of simple) check(`"${text}" → fast`, G.typedMoodGate(text, mood).fast, true);
  check("a word the parse didn't use isn't covered (comedy words under Drama)", G.typedMoodGate("a funny drama", { lane: L("Drama"), refiner: null }).fast, false);
  check("the page logs the gate's reason and residual", read("app/page.tsx").includes('console.info("[typed-mood] → AI search", { reason: gate.reason, residual: gate.residual });'), true);

  console.log("\n8. The results merge lines in place (no reset)");
  const rv = read("src/components/ResultsV4.tsx");
  check("same ids + titles → merge, return before the reset", /if \(ids && ids === lastIncomingIdsRef\.current\) \{[\s\S]*?setReks\(merge\);\s*setTrail\(merge\);\s*return;/.test(rv), true);
  check("pending marker on the results", /data-lines-pending=\{linesPending \|\| undefined\}/.test(rv), true);

  console.log("\n9. No prompt or wording change");
  const mergedB = (() => {
    try {
      execSync("git merge-base --is-ancestor auto/s16b-fast-typed main", { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  const range = mergedB ? "a7665a2 main" : execSync("git merge-base main HEAD", { cwd: root, encoding: "utf8" }).trim();
  const promptDiff = execSync(`git diff ${range} -- src/lib/mediaReks.ts src/lib/voiceMood.ts src/engine/rekomendrEngine.ts src/lib/screenSnap.ts`, { cwd: root, encoding: "utf8" });
  check("prompts untouched (mediaReks, voiceMood, engine, screen read)", promptDiff, "");
  const diff = execSync(`git diff ${range} -- src app`, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++") && !/^\+\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
  const jsx = (diff.match(/>([^<>{}]*[A-Za-z][^<>{}]*)</g) || []).map((m) => m.slice(1, -1).trim()).filter((t) => t && !/[();=?]/.test(t));
  check("no new JSX text", jsx, []);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
