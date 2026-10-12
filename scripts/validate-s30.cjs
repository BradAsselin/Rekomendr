/* eslint-disable no-console */
//
// scripts/validate-s30.cjs — S3.0: typed titles land as the anchor; media
// reks come from TMDb's recommendation web, picked and explained by the
// model; Trailer + Where to watch from TMDb.
//
// Compiles the REAL routes (/api/anchor, /api/reksnap, /a/[id]) and libs
// from source. Stubs TMDb (globalThis.fetch), OpenAI and the Supabase
// service-role client. No keys, no network.
//
//   node scripts/validate-s30.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s30-validate-"));

console.log("Compiling /api/anchor, /api/reksnap, /a/[id] from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/anchor/route.ts",
    "app/api/reksnap/route.ts",
    "app/a/[id]/route.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--lib", "es2020,dom",
  ],
  { stdio: "inherit", cwd: ROOT }
);

const out = (line) => process.stdout.write(`${line}\n`);
let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${a}, expected ${e})`}`);
};

let logs = [];
for (const level of ["warn", "info", "log", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    if (process.env.S30_VERBOSE) orig(...args);
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* ---------------- TMDb stub ---------------- */
const row = (id, title, year, votes, extra = {}) => ({
  id,
  title,
  name: title,
  original_title: title,
  original_name: title,
  release_date: `${year}-05-01`,
  first_air_date: `${year}-05-01`,
  vote_count: votes,
  popularity: votes / 10,
  overview: `${title} overview: a concrete premise with a person at stake.`,
  ...extra,
});
const SEARCH = {
  movie: {
    lioness: [row(901, "Lioness", 2008, 4), row(902, "Lioness", 2023, 5)],
    heist: [row(910, "Heist", 2015, 1029)],
    clever: [row(911, "Clever", 2015, 2)],
    heat: [row(920, "Heat", 1995, 8778), row(921, "Heat", 1986, 300)],
    severance: [row(930, "Severance", 2006, 600)],
    "sing street": [row(369557, "Sing Street", 2016, 2526)],
    "winchester 73": [row(940, "Winchester '73", 1950, 400)],
    "real wildcard": [row(950, "Real Wildcard", 2019, 500)],
  },
  tv: {
    lioness: [row(113962, "Lioness", 2023, 1688)],
    severance: [row(95396, "Severance", 2022, 3000)],
  },
};
const candidatesFor = (n) =>
  Array.from({ length: n }, (_, i) => row(5000 + i, `Candidate ${i + 1}`, 2010 + i, 200));
const DETAIL = {
  "tv/113962": {
    id: 113962, name: "Lioness", first_air_date: "2023-07-23",
    overview: "Cruz Manuelos, a young Marine, is recruited to the CIA's Lioness Engagement Team.",
    videos: { results: [
      { site: "YouTube", type: "Teaser", official: true, key: "teaser1", iso_639_1: "en" },
      { site: "YouTube", type: "Trailer", official: false, key: "fan1", iso_639_1: "en" },
      { site: "YouTube", type: "Trailer", official: true, key: "uEjcXhW7CXo", iso_639_1: "en" },
    ] },
    "watch/providers": { results: { US: {
      link: "https://www.themoviedb.org/tv/113962-lioness/watch?locale=US",
      flatrate: [
        { provider_id: 1853, provider_name: "Paramount Plus Apple TV channel", display_priority: 23 },
        { provider_id: 2303, provider_name: "Paramount Plus Premium", display_priority: 14 },
        { provider_id: 257, provider_name: "fuboTV", display_priority: 10 },
      ],
      buy: [
        { provider_id: 10, provider_name: "Amazon Video", display_priority: 8 },
        { provider_id: 2, provider_name: "Apple TV Store", display_priority: 9 },
      ],
    } } },
    recommendations: { results: [
      ...candidatesFor(6),
      row(6001, "Disliked Show", 2020, 900),
      row(6002, "Watched Show", 2021, 900),
      row(6003, "Tiny Show", 2021, 3),
    ] },
    similar: { results: [row(113962, "Lioness", 2023, 1688), row(6004, "No Overview", 2022, 500, { overview: "" })] },
  },
  "movie/1368337": {
    id: 1368337, title: "The Odyssey", release_date: "2026-07-15",
    overview: "Odysseus, the legendary King of Ithaca, embarks on a long voyage home.",
    videos: { results: [] },
    "watch/providers": { results: {} },
    release_dates: { results: [{ iso_3166_1: "US", release_dates: [
      { type: 3, release_date: "2026-07-17T00:00:00.000Z" },
      { type: 4, release_date: "2099-11-17T00:00:00.000Z" },
    ] }] },
    recommendations: { results: [] },
    similar: { results: [] },
  },
  "movie/940": {
    id: 940, title: "Winchester '73", release_date: "1950-07-12",
    overview: "A cowboy chases the man who stole his prize rifle across the West.",
    videos: { results: [] },
    "watch/providers": { results: { US: { link: "https://tmdb/w/940", rent: [{ provider_id: 2, provider_name: "Apple TV Store", display_priority: 9 }] } } },
    release_dates: { results: [] },
    recommendations: { results: candidatesFor(8) },
    similar: { results: [] },
  },
};
const tmdb = { calls: [], down: false };
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  tmdb.calls.push(u.pathname + u.search);
  if (tmdb.down) throw new Error("ECONNRESET");
  const m = u.pathname.match(/^\/3\/search\/(movie|tv)$/);
  if (m) {
    const q = (u.searchParams.get("query") || "").toLowerCase().replace(/'/g, "").trim();
    return new Response(JSON.stringify({ results: SEARCH[m[1]][q] ?? [] }), { status: 200 });
  }
  const d = u.pathname.match(/^\/3\/(movie|tv)\/(\d+)$/);
  if (d && DETAIL[`${d[1]}/${d[2]}`]) {
    return new Response(JSON.stringify(DETAIL[`${d[1]}/${d[2]}`]), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

/* ---------------- OpenAI stub ---------------- */
const ai = { calls: [], chooser: null, vision: null, aborted: 0 };
const asStream = (content, signal) => {
  const n = 40;
  return (async function* () {
    for (let i = 0; i < content.length; i += n) {
      if (signal?.aborted) {
        ai.aborted++;
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      yield { choices: [{ delta: { content: content.slice(i, i + n) } }] };
      await new Promise((r) => setTimeout(r, 1));
    }
    yield { choices: [], usage: { prompt_tokens: 10, completion_tokens: 20 } };
  })();
};
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req, opts) => {
          ai.calls.push(req);
          const system = String(req.messages?.[0]?.content ?? "");
          if (system.startsWith("You pick and explain")) {
            return { choices: [{ message: { content: JSON.stringify(ai.chooser) } }] };
          }
          if (system.startsWith("Decide whether the user's text names ONE specific wine")) {
            return { choices: [{ message: { content: JSON.stringify(ai.classify) } }] };
          }
          const content = JSON.stringify(ai.vision);
          return req.stream
            ? asStream(content, opts?.signal)
            : { choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 2 } };
        },
      },
    };
  }
}
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });

/* ---------------- Supabase stub: taste rows ---------------- */
const taste = { likes: [], signals: [], snapshot: null };
function query(table) {
  const b = {
    select() { return b; }, insert() { return b; }, eq() { return b; }, gt() { return b; },
    gte() { return b; }, in() { return b; }, order() { return b; }, limit() { return b; },
    not() { return b; }, is() { return b; }, ilike() { return b; },
    maybeSingle() { return Promise.resolve({ data: table === "anchor_snapshots" ? taste.snapshot : null, error: null }); },
    then(res, rej) {
      const data = table === "user_likes" ? taste.likes : table === "reksnap_signals" ? taste.signals : [];
      return Promise.resolve({ data, error: null, count: 0 }).then(res, rej);
    },
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: (t) => query(t) } });

process.env.TMDB_API_KEY = "v3key";
process.env.OPENAI_API_KEY = "stub";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s30-secret";

const { extractCompleteObject } = require(path.join(OUT, "src/lib/jsonEarly.js"));
const media = require(path.join(OUT, "src/lib/tmdbMedia.js"));
const { verifyAnchor } = require(path.join(OUT, "src/lib/mintToken.js"));
const anchorRoute = require(path.join(OUT, "app/api/anchor/route.js"));
const snapRoute = require(path.join(OUT, "app/api/reksnap/route.js"));
const sharePage = require(path.join(OUT, "app/a/[id]/route.js"));

const CLIENT = "anon_s30_harness";
const call = async (route, body) => {
  const res = await route.POST(
    new Request("http://local/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
};

const chooserPicks = (nums, wildcard = null) => ({
  picks: nums.map((n) => ({ n, line: `Same pressure, but candidate ${n} moves it somewhere concrete.` })),
  wildcard,
});

(async () => {
  out("\n1. Reading detected_item out of a stream that is still arriving");
  check("incomplete → null", extractCompleteObject('{"detected_item": {"name": "A", "desc', "detected_item"), null);
  check(
    "complete → parsed, braces inside strings ignored",
    extractCompleteObject('{"detected_item": {"name": "A {b}", "description": "say \\"}\\" ok", "category": "movies"}, "mode": "sim', "detected_item"),
    { name: "A {b}", description: 'say "}" ok', category: "movies" }
  );
  check("key absent → null", extractCompleteObject('{"mode": "similar"}', "detected_item"), null);

  out("\n2. The detection rule: a typed TITLE, or not");
  const typed = async (t, k) => {
    const r = await media.resolveTypedTitle(t, k);
    return r ? `${r.kind}:${r.title}:${r.year}` : null;
  };
  check("'Lioness' under TV → the show", await typed("Lioness", "tv"), "tv:Lioness:2023");
  check("'Lioness' under Movies → the show (films named Lioness have 9 votes)", await typed("Lioness", "movie"), "tv:Lioness:2023");
  check("'Sing Street' → the film", await typed("Sing Street", "movie"), "movie:Sing Street:2016");
  check("'heist' (a 1,029-vote film) stays a genre query", await typed("heist", "movie"), null);
  check("'clever' (2 votes) stays a mood query", await typed("clever", "movie"), null);
  check("'something clever' → not a title", await typed("something clever", "movie"), null);
  check("'Heat 1995' → the 1995 film", await typed("Heat 1995", "movie"), "movie:Heat:1995");
  check("'Heat (1986)' → the 1986 film", await typed("Heat (1986)", "movie"), "movie:Heat:1986");
  check("'Severance' under Movies → the far better-known show", await typed("Severance", "movie"), "tv:Severance:2022");
  check("'Severance' under TV → the show", await typed("Severance", "tv"), "tv:Severance:2022");

  out("\n3. The bundle: trailer, providers, candidates, availability");
  const b = await media.loadMediaBundle("tv", 113962);
  check("overview verbatim", b.overview, DETAIL["tv/113962"].overview);
  check("official Trailer beats teaser and fan cut", b.completion.trailerUrl, "https://www.youtube.com/watch?v=uEjcXhW7CXo");
  check("stream list: source order, channel resale dropped", b.completion.watch.stream.map((p) => p.name), ["fuboTV", "Paramount Plus Premium"]);
  check("rent/buy list", b.completion.watch.rentBuy.map((p) => p.name), ["Amazon Video", "Apple TV Store"]);
  check("known provider → direct search link", b.completion.watch.rentBuy[1].url, "https://tv.apple.com/search?term=Lioness");
  check("unknown provider → TMDb watch page", b.completion.watch.stream[0].url, "https://www.themoviedb.org/tv/113962-lioness/watch?locale=US");
  check("candidates: anchor, no-overview and <20-vote rows excluded", b.candidates.map((c) => c.title).includes("Lioness") || b.candidates.some((c) => c.title === "Tiny Show" || c.title === "No Overview"), false);
  check("candidates: recommendations order kept", b.candidates.slice(0, 2).map((c) => c.title), ["Candidate 1", "Candidate 2"]);
  const ody = await media.loadMediaBundle("movie", 1368337);
  check("no providers → honest release window", ody.completion.availability, "In theaters — on digital Nov 17, 2099");
  check("no providers → watch is null", ody.completion.watch, null);
  check("availability: future theatrical", media.parseAvailability({ results: [{ iso_3166_1: "US", release_dates: [{ type: 3, release_date: "2099-03-01T00:00:00Z" }] }] }), "In theaters Mar 1, 2099");
  check("availability: nothing true to say → null", media.parseAvailability({ results: [] }), null);

  out("\n4. /api/anchor resolve — TMDb only, no model call, signed");
  ai.calls = [];
  const r1 = await call(anchorRoute, { action: "resolve", text: "Lioness", category: "TV Shows", clientId: CLIENT });
  const a = r1.json.anchor;
  check("resolve: 200 with an anchor", [r1.status, !!a], [200, true]);
  check("anchor name/category/year", [a.detected_item.name, a.detected_item.category, a.detected_item.year], ["Lioness", "tv", 2023]);
  check("anchor description = TMDb overview verbatim", a.detected_item.description, DETAIL["tv/113962"].overview);
  check("no model call to show the anchor", ai.calls.length, 0);
  check("token signs exactly this anchor (Share works from the first second)",
    verifyAnchor({ name: "Lioness", category: "tv", short: a.detected_item.description, long: null, clientId: CLIENT }, a.detected_item_token), true);
  check("media block carries trailer + providers", [a.media.kind, a.media.id, !!a.media.trailerUrl, !!a.media.watch], ["tv", 113962, true, true]);
  const r2 = await call(anchorRoute, { action: "resolve", text: "something clever", category: "Movies", clientId: CLIENT });
  check("mood query → anchor null (search as before)", r2.json, { anchor: null });
  const r3 = await call(anchorRoute, { action: "resolve", text: "Lioness", category: "Wine", clientId: CLIENT });
  check("non-media lane → anchor null", r3.json, { anchor: null });

  out("\n4b. S3.1 — a FAILED lookup is loud, never a quiet 'not a title'");
  logs = [];
  tmdb.down = true;
  const f1 = await call(anchorRoute, { action: "resolve", text: "Some Unseen Title", category: "Movies", clientId: CLIENT });
  tmdb.down = false;
  check("TMDb down → fallback named lookup_failed", f1.json, { anchor: null, fallback: "lookup_failed" });
  check("…logged at error level with the reason", logged("[typed-anchor] FALLBACK lookup failed") && logged("network_"), true);
  check("…and NOT logged as 'not a title'", logged("[typed-anchor] not a title"), false);
  logs = [];
  const f2 = await call(anchorRoute, { action: "resolve", text: "something clever", category: "Movies", clientId: CLIENT });
  check("clean miss stays quiet (no fallback field)", [f2.json, logged("FALLBACK")], [{ anchor: null }, false]);
  const savedKey = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  logs = [];
  const f3 = await call(anchorRoute, { action: "resolve", text: "Lioness", category: "TV Shows", clientId: CLIENT });
  process.env.TMDB_API_KEY = savedKey;
  check("no key → fallback named disabled, error-level log", [f3.json, logged("[typed-anchor] FALLBACK disabled")], [{ anchor: null, fallback: "disabled" }, true]);

  out("\n5. /api/anchor reks — the chooser picks from TMDb's web");
  taste.likes = [{ title: "Candidate 6", action: "like" }, { title: "Disliked Show", action: "dislike" }, { title: "Watched Show", action: "watched" }];
  taste.signals = [];
  ai.calls = [];
  ai.chooser = chooserPicks([1, 2, 99, 2, 3, 4]);
  const k1 = await call(anchorRoute, { action: "reks", kind: "tv", id: 113962, clientId: CLIENT, lane: "Crime" });
  const userMsg = String(ai.calls[0]?.messages?.[1]?.content ?? "");
  check("exclusion guarantee: disliked/watched/liked never reach the model",
    ["Disliked Show", "Watched Show", "Candidate 6"].some((t) => userMsg.split("CANDIDATES:")[1].includes(t)), false);
  check("taste rides as pressure", userMsg.includes("DISLIKED: Disliked Show") && userMsg.includes("LIKED: Candidate 6"), true);
  check("lane rides", userMsg.includes("LANE: Crime"), true);
  check("chooser model is gpt-4o-mini (§2.10)", ai.calls[0]?.model, "gpt-4o-mini");
  check("invalid and duplicate picks dropped; ranks 1..n",
    k1.json.reks.map((r) => `${r.rank}:${r.name}`), ["1:Candidate 1", "2:Candidate 2", "3:Candidate 3", "4:Candidate 4"]);
  check("card short = the line; long = TMDb overview", [k1.json.reks[0].description.startsWith("Same pressure"), k1.json.reks[0].long], [true, row(0, "Candidate 1").overview]);
  check("short set is logged", logged("[media-reks] short set"), true);

  out("\n6. The wildcard: verified against TMDb or dropped");
  logs = [];
  ai.chooser = chooserPicks([1, 2, 3, 4, 5], { title: "Invented Title", year: 2020, line: "Made up." });
  const k2 = await call(anchorRoute, { action: "reks", kind: "tv", id: 113962, clientId: CLIENT });
  check("fictional wildcard dropped → five TMDb picks", k2.json.reks.map((r) => r.source), ["tmdb", "tmdb", "tmdb", "tmdb", "tmdb"]);
  check("[fake-title] names the anchor", logged("[fake-title] dropped unresolved media titles") && logged('"anchor":"Lioness"'), true);
  ai.chooser = chooserPicks([1, 2, 3, 4, 5], { title: "Severance", year: 2022, line: "Same office dread, colder." });
  const k3 = await call(anchorRoute, { action: "reks", kind: "tv", id: 113962, clientId: CLIENT });
  check("real wildcard takes slot five", k3.json.reks.map((r) => `${r.rank}:${r.name}:${r.source}`).slice(3), ["4:Candidate 4:tmdb", "5:Severance:wildcard"]);
  ai.chooser = chooserPicks([1, 2, 3, 4, 5], { title: "Disliked Show", year: 2020, line: "x" });
  const k4 = await call(anchorRoute, { action: "reks", kind: "tv", id: 113962, clientId: CLIENT });
  check("wildcard on the exclusion list never ships", k4.json.reks.some((r) => r.name === "Disliked Show"), false);
  taste.likes = [];

  out("\n7. A movie snap: the stream stops at the anchor, TMDb takes over");
  ai.calls = [];
  ai.aborted = 0;
  ai.vision = {
    detected_item: { name: "Winchester '73 DVD", description: "Model-written premise.", category: "movies" },
    mode: "similar",
    results: {
      similar: Array.from({ length: 5 }, (_, i) => ({ name: `Model Film ${i}`, description: "x ".repeat(200), category: "movies", rank: i + 1 })),
      uses: [], alternatives: [],
    },
  };
  ai.chooser = chooserPicks([1, 2, 3, 4, 5]);
  const s1 = await call(snapRoute, { image: "data:image/png;base64,AAAA", clientId: CLIENT });
  check("snap: 200, anchor resolved through TMDb (package noise stripped)", [s1.status, s1.json.detected_item.name, s1.json.detected_item.year], [200, "Winchester '73", 1950]);
  check("snap: description = TMDb overview, not the model's", s1.json.detected_item.description, DETAIL["movie/940"].overview);
  check("snap: reks are the chooser's TMDb picks", s1.json.results.similar.map((r) => r.name), ["Candidate 1", "Candidate 2", "Candidate 3", "Candidate 4", "Candidate 5"]);
  check("snap: uses/alternatives empty", [s1.json.results.uses.length, s1.json.results.alternatives.length], [0, 0]);
  await new Promise((r) => setTimeout(r, 100)); // let the stub see the abort
  check("snap: the vision stream was stopped early", ai.aborted, 1);
  check("snap: media completion attached", [s1.json.media.kind, s1.json.media.watch.rentBuy[0].name], ["movie", "Apple TV Store"]);
  check("snap: token signs the TMDb text", verifyAnchor({ name: "Winchester '73", category: "movies", short: DETAIL["movie/940"].overview, long: null, clientId: CLIENT }, s1.json.detected_item_token), true);

  out("\n8. Everything else keeps the vision path, unchanged");
  ai.vision = {
    detected_item: { name: "Bonanza Cabernet", description: "Dry and plush.", category: "wine" },
    mode: "similar",
    results: { similar: Array.from({ length: 5 }, (_, i) => ({ name: `Wine ${i}`, description: "d", category: "wine", rank: i + 1 })), uses: [], alternatives: [] },
  };
  const s2 = await call(snapRoute, { image: "data:image/png;base64,AAAA", clientId: CLIENT });
  check("wine: model's own description and reks", [s2.json.detected_item.description, s2.json.results.similar.length, !!s2.json.media], ["Dry and plush.", 5, false]);
  ai.vision = {
    detected_item: { name: "Unknown Indie Film", description: "A model premise.", category: "movies" },
    mode: "similar",
    results: { similar: [{ name: "Sing Street", description: "d", category: "movies", rank: 1 }], uses: [], alternatives: [] },
  };
  const s3 = await call(snapRoute, { image: "data:image/png;base64,AAAA", clientId: CLIENT });
  check("media TMDb doesn't know → vision path (guarded as before)", [s3.json.detected_item.description, s3.json.results.similar.map((r) => r.name), !!s3.json.media], ["A model premise.", ["Sing Street"], false]);
  check("…and the miss is logged", logged("[media-snap] not on TMDb"), true);
  ai.vision = {
    detected_item: { name: "Melatonin Gummies", description: "claims", category: "movies" },
    mode: "similar",
    results: { similar: [], uses: [], alternatives: [] },
  };
  logs = [];
  await call(snapRoute, { image: "data:image/png;base64,AAAA", clientId: CLIENT });
  check("health name backstop never takes the media path", logged("[media-snap] tmdb path"), false);

  out("\n9. Wine by name (typed)");
  ai.classify = { specific: false, name: null };
  const w1 = await call(snapRoute, { typed: { text: "something bold", clientId: CLIENT } });
  check("style/mood → anchor null", w1.json, { anchor: null });
  ai.classify = { specific: true, name: "Bonanza Cabernet" };
  ai.vision = {
    detected_item: { name: "Bonanza Cabernet", description: "Dry and plush.", category: "wine" },
    mode: "similar",
    results: { similar: Array.from({ length: 5 }, (_, i) => ({ name: `Wine ${i}`, description: "d", category: "wine", rank: i + 1 })), uses: [], alternatives: [] },
  };
  ai.calls = [];
  const w2 = await call(snapRoute, { typed: { text: "bonanza", clientId: CLIENT } });
  check("specific wine → full snap-shaped anchor + reks", [w2.json.detected_item.name, w2.json.results.similar.length, !!w2.json.detected_item_token], ["Bonanza Cabernet", 5, true]);
  const gen = ai.calls.find((c) => String(c.messages?.[0]?.content ?? "").startsWith("You are a taste-aware recommendation engine reading a single photo."));
  check("same snap prompt; the name in place of the photo", !!gen && String(gen.messages[1].content).includes('"Bonanza Cabernet"'), true);

  out("\n10. The shared page shows trailer + where to watch");
  taste.snapshot = {
    id: "11111111-1111-4111-8111-111111111111", client_id: CLIENT, item_name: "Lioness", item_category: "tv",
    short_description: DETAIL["tv/113962"].overview, long_description: null, mode: "similar",
    shared_at: new Date().toISOString(), revoked_at: null, created_at: new Date().toISOString(),
  };
  const page = await sharePage.GET(new Request("http://local/a/x", { headers: { host: "local" } }), { params: { id: taste.snapshot.id } });
  const html = await page.text();
  check("page: 200", page.status, 200);
  check("page: official trailer link", html.includes("https://www.youtube.com/watch?v=uEjcXhW7CXo"), true);
  check("page: stream first, then rent or buy", html.indexOf("Stream: ") > 0 && html.indexOf("Stream: ") < html.indexOf("Rent or buy: "), true);
  check("page: via JustWatch attribution", html.includes(">JustWatch</a>"), true);
  check("page: still no scripts (CSP)", page.headers.get("content-security-policy").includes("default-src 'none'"), true);
  tmdb.down = true;
  media.loadMediaBundle; // cache already holds Lioness — a fresh title would degrade:
  taste.snapshot = { ...taste.snapshot, item_name: "Sing Street", item_category: "movies" };
  const page2 = await sharePage.GET(new Request("http://local/a/x", { headers: { host: "local" } }), { params: { id: taste.snapshot.id } });
  const html2 = await page2.text();
  check("page: TMDb down → still 200, neutral links, no provider block", [page2.status, html2.includes("Stream: "), html2.includes("where%20to%20watch")], [200, false, true]);
  tmdb.down = false;

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  console.error = console.error;
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
