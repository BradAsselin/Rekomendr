#!/usr/bin/env node
/* S15 — the streaming-screen snap (docs/s15-screen-snap-plan.md).
 * Read → TMDb guard → rank against the nearest go-to (Steer by re-ranks);
 * only approved wording; the snap lane is untouched for anything that
 * isn't a screen of several real titles. No network: TMDb and both model
 * SDKs are stubbed.
 * Run: node scripts/validate-s15-screen.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

// ---- stubs -----------------------------------------------------------------
let modelReply = "{}";
const modelCalls = [];
class FakeAnthropic {
  constructor() {
    this.beta = {
      messages: {
        stream: (req) => {
          modelCalls.push(req);
          const it = (async function* () {
            yield { type: "content_block_delta", delta: { type: "text_delta", text: modelReply } };
          })();
          it.finalMessage = async () => ({ model: req.model, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } });
          return it;
        },
      },
    };
  }
}
class FakeOpenAI {}

// TMDb: search + detail for a small catalogue.
const CAT = {
  "tv:wednesday": { id: 119051, name: "Wednesday", first_air_date: "2022-11-23", genres: [{ id: 35 }, { id: 9648 }], number_of_seasons: 3, number_of_episodes: 16, vote_average: 8.4, vote_count: 9000, recs: [] },
  "movie:glass onion": { id: 661374, title: "Glass Onion: A Knives Out Mystery", release_date: "2022-11-23", genres: [{ id: 35 }, { id: 80 }, { id: 9648 }], runtime: 140, vote_average: 7.0, vote_count: 6000, recs: [{ id: 546554, kind: "movie" }] },
  "tv:the night agent": { id: 129552, name: "The Night Agent", first_air_date: "2023-03-23", genres: [{ id: 10759 }, { id: 18 }], number_of_seasons: 2, number_of_episodes: 20, vote_average: 7.6, vote_count: 900, recs: [{ id: 113962, kind: "tv" }] },
  "movie:knives out": { id: 546554, title: "Knives Out", release_date: "2019-11-27", genres: [{ id: 35 }, { id: 80 }, { id: 9648 }], runtime: 131, vote_average: 7.8, vote_count: 14000, recs: [{ id: 661374, kind: "movie" }] },
  "tv:lioness": { id: 113962, name: "Lioness", first_air_date: "2023-07-23", genres: [{ id: 18 }, { id: 10759 }], number_of_seasons: 2, number_of_episodes: 16, vote_average: 7.7, vote_count: 1700, recs: [{ id: 129552, kind: "tv" }] },
};
const byId = (kind, id) => Object.entries(CAT).find(([k, v]) => k.startsWith(kind + ":") && v.id === id)?.[1];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const s = u.pathname.match(/^\/3\/search\/(movie|tv)$/);
  if (s) {
    const q = (u.searchParams.get("query") || "").toLowerCase();
    const hit = CAT[`${s[1]}:${q}`];
    const row = hit && { id: hit.id, title: hit.title, name: hit.name, original_title: hit.title, original_name: hit.name, release_date: hit.release_date, first_air_date: hit.first_air_date, vote_count: hit.vote_count, overview: "o" };
    return new Response(JSON.stringify({ results: row ? [row] : [] }), { status: 200 });
  }
  const d = u.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
  if (d) {
    const v = byId(d[1], Number(d[2]));
    if (!v) return new Response("{}", { status: 404 });
    const recRows = v.recs.map((r) => ({ ...byId(r.kind, r.id), media_type: r.kind, genre_ids: [], vote_count: 500, overview: "o" }));
    return new Response(JSON.stringify({ ...v, overview: `${v.title || v.name} overview.`, videos: { results: [] }, "watch/providers": { results: {} }, release_dates: { results: [] }, recommendations: { results: recRows }, similar: { results: [] } }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

const cache = {};
function load(rel) {
  if (cache[rel]) return cache[rel];
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  cache[rel] = m.exports;
  const req = (id) => {
    if (id === "openai") return { __esModule: true, default: FakeOpenAI };
    if (id === "@anthropic-ai/sdk") return { __esModule: true, default: FakeAnthropic };
    if (id.startsWith(".")) {
      const p = path.join(path.dirname(rel), id);
      return load(fs.existsSync(path.join(root, p + ".ts")) ? p + ".ts" : p + ".tsx");
    }
    return require(id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  cache[rel] = m.exports;
  return m.exports;
}
for (const level of ["warn", "info", "error"]) console[level] = () => {};

(async () => {
  process.env.TMDB_API_KEY = "v3key";
  process.env.ANTHROPIC_API_KEY = "stub";
  const S = load("src/lib/screenSnap.ts");
  const T = load("src/lib/tmdbMedia.ts");

  console.log("1. Commitment and service");
  check("film runtime", [T.commitmentOf({ runtime: 140 }, "movie"), T.commitmentOf({ runtime: 45 }, "movie"), T.commitmentOf({ runtime: 120 }, "movie")], ["2h 20m", "45m", "2h"]);
  check("show seasons · episodes", [T.commitmentOf({ number_of_seasons: 3, number_of_episodes: 16 }, "tv"), T.commitmentOf({ number_of_seasons: 1, number_of_episodes: 1 }, "tv")], ["3 seasons · 16 episodes", "1 season · 1 episode"]);
  check("no data → nothing said", [T.commitmentOf({}, "movie"), T.commitmentOf({}, "tv")], [null, null]);
  check("services by their app names; unknown → null", ["NETFLIX", "Amazon Prime Video", "HBO Max", "Disney Plus", "Blorp TV", null].map(S.canonicalService), ["Netflix", "Prime Video", "Max", "Disney+", null, null]);

  console.log("\n2. The read");
  modelReply = JSON.stringify({ is_screen: true, service: "Netflix", titles: [{ title: "Wednesday", kind: "tv" }, { title: "Glass Onion", kind: "unknown" }, { title: "Made Up Show", kind: "tv" }, { title: "The Night Agent", kind: "tv" }] });
  const r = await S.readScreen("data:image/jpeg;base64,QUJD");
  check("titles + service", [r.service, r.titles.map((t) => t.title)], ["Netflix", ["Wednesday", "Glass Onion", "Made Up Show", "The Night Agent"]]);
  const call = modelCalls.at(-1);
  check("vision step (Sonnet), schema sent, image as base64", [call.model, !!call.output_config.format, call.messages[0].content[0].type], ["claude-sonnet-5-5", true, "image"]);
  modelReply = JSON.stringify({ is_screen: false, service: null, titles: [] });
  check("not a screen → null", await S.readScreen("data:image/jpeg;base64,QUJD"), null);
  modelReply = JSON.stringify({ is_screen: true, service: "Netflix", titles: [{ title: "Wednesday", kind: "tv" }] });
  check("one title → null (a poster is the snap lane's)", await S.readScreen("data:image/jpeg;base64,QUJD"), null);
  modelReply = "not json";
  check("non-JSON → null", await S.readScreen("data:image/jpeg;base64,QUJD"), null);

  console.log("\n3. The guard: only real TMDb titles ship");
  const titles = await S.resolveScreen(r);
  check("the invented title is dropped, the rest are TMDb's", titles.map((b) => b.title), ["Wednesday", "Glass Onion: A Knives Out Mystery", "The Night Agent"]);
  check("bundles carry commitment + rating", [titles[1].commitment, titles[0].commitment, titles[0].votes], ["2h 20m", "3 seasons · 16 episodes", 9000]);
  const dup = await S.resolveScreen({ service: null, titles: [{ title: "Wednesday", kind: "tv" }, { title: "wednesday", kind: "any" }] });
  check("duplicates collapse", dup.length, 1);

  console.log("\n4. Ranking");
  const { loadMediaBundle } = T;
  const goTo = async (name, kind, id, at) => ({ name, tmdbKind: kind, tmdbId: id, at, bundle: await loadMediaBundle(kind, id) });
  const lioness = await goTo("Lioness", "tv", 113962, "2026-10-20T00:00:00Z");
  const knives = await goTo("Knives Out", "movie", 546554, "2026-10-19T00:00:00Z");
  const a = S.rankScreen(titles, [lioness, knives], null);
  check("nearest go-to to this screen steers by default", a.steer.name, "Knives Out");
  check("…best match on top: Glass Onion (TMDb links it to Knives Out)", a.titles[0].title, "Glass Onion: A Knives Out Mystery");
  const b = S.rankScreen(titles, [lioness, knives], "Lioness");
  check("Steer by Lioness → The Night Agent on top", b.titles[0].title, "The Night Agent");
  check("the ranking changes when Steer by switches", a.titles.map((t) => t.title).join("|") !== b.titles.map((t) => t.title).join("|"), true);
  check("Steer by order: nearest first", a.order.map((g) => g.name), ["Knives Out", "Lioness"]);
  const c = S.rankScreen(titles, [], null);
  check("no go-to → weighted TMDb rating, no steer", [c.steer, c.titles[0].title], [null, "Wednesday"]);
  check("a few high votes don't beat many", S.weightedRating({ rating: 9.5, votes: 10 }) < S.weightedRating({ rating: 8.4, votes: 9000 }), true);

  console.log("\n5. The route");
  const route = read("app/api/screen/route.ts");
  check("photo → vision cap; lines → text cap", [route.includes('capGate(clientId, "reksnap-vision")'), route.includes('capGate(clientId, "reksnap-text")')], [true, true]);
  check("fewer than two real titles → screen null (the normal snap answers)", route.includes("titles.length < 2") && route.includes("screen: null"), true);
  check("cards are built from TMDb bundles only", /ranked\.titles\.map\(\(b, i\) =>[\s\S]*title: b\.title,/.test(route), true);
  check("'Start with this one' only on the best match", /screenNote: i === 0 \? START_WITH : null/.test(route) && route.includes('const START_WITH = "Start with this one";'), true);
  check("where to watch: the photo's service first, then TMDb's", (route.includes("service ?? b.completion.watch?.stream[0]?.name") || (route.includes("whereOf(b, service)") && read("src/lib/tmdbMedia.ts").includes("service ?? b.completion.watch?.stream[0]?.name"))) /* S16 shared whereOf */, true);
  check("lines from the S12 writer", route.includes("linesVsGoTo({"), true);
  check("wrapped for the dev hook", /export async function POST\(req: Request\) \{\s*return withLlmContext\(req, \(\) => handlePost\(req\)\);/.test(route), true);

  console.log("\n6. The page");
  const page = read("app/page.tsx");
  const snap = page.slice(page.indexOf("const handleSnapFile"), page.indexOf("const handleSearch = async"));
  check("screen read only on the Movies/TV bar", snap.includes('if (bar === "Movies" || bar === "TV Shows") {'), true);
  check("…beside the normal snap, which is aborted when the screen answers", ["const firstP = postSnap({ image }, snapAbort.signal);", "snapAbort.abort();", "data = await firstP;"].map((t) => snap.includes(t)), [true, true, true]);
  // S17 — the Steer by row is gone (Movies/TV), so it no longer re-ranks a screen set.
  check("Steer by row removed (S17)", page.includes("SteerByRow"), false);
  check("a thumbs-down never brings in a title that wasn't on the screen", /slotBackfill = async[\s\S]{0,300}if \(screenRef\.current\) return null;/.test(page), true);
  check("a new search, snap or home leaves screen mode", (page.match(/leaveScreen\(\);/g) || []).length, 3);
  check("header wording", page.includes(">\n                          From your screen\n") || page.includes("From your screen"), true);
  const words = (page.match(/"[^"]*"|>[^<>{}]+</g) || []).join(" ");
  check("no other new user-facing words in the page diff", require("child_process").execSync("git diff 1c60240 2ab1240 -- app/page.tsx" /* S15's own range (main moved on) */, { cwd: root, encoding: "utf8" })
    .split("\n").filter((l) => /^\+/.test(l) && !/^\+\+\+/.test(l) && /^\+\s*[A-Z][a-z]+[^=;(){}]*$/.test(l)).map((l) => l.slice(1).trim()), ["From your screen"]);
  check("Results: the screen note rides the marker line; facts ride the descriptor line",
    // S17 — D2 (Movies/TV) frontier cards keep only the screen note on the marker line.
    [(read("src/components/ResultsV4.tsx").match(/markerLine=\{d2 \? (rek\.screenNote|undefined) : rek\.resurfacedNote \?\? rek\.screenNote\}/g) || []).length, read("src/components/DescriptorLine.tsx").includes("...(rek.facts ?? [])")], [2, true]);
  void words;

  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  process.stderr.write("HARNESS CRASH: " + (err && err.stack) + String.fromCharCode(10));
  process.exit(1);
});
