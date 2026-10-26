/* eslint-disable no-console */
//
// scripts/validate-s13c.cjs — S13c: voice mood input v1
// (docs/s13-opus-voice-plan.md, Part B).
//
//   1. The vocabulary guarantee: validateMood keeps only the app's own
//      lanes, refiners and price chips; an unclear category is the bar's;
//      Books and nonsense never search.
//   2. /api/mood: parses on step "mood", answers mapped / not mapped
//      (never an error for words), steers by a starred go-to as is and by
//      a named title through TMDb (transient), names its failures.
//   3. /api/voice + voiceSignals: shown ×5, one event per (kind, title),
//      only titles in the voice set, refused without a mood id.
//   4. The bar and the page: approved wording only, mic next to the
//      camera, fallback to keyboard dictation, late answers dropped,
//      results through the existing paths (slots / steer / wine chip).
//   5. /api/stats voice rows; the SQL posture.
//
//   node scripts/validate-s13c.cjs
//
const { execFileSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s13c-validate-"));

console.log("Compiling /api/mood, /api/voice from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/mood/route.ts", "app/api/voice/route.ts", "src/lib/voiceMood.ts",
    "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020",
    "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--lib", "es2020,dom",
  ],
  { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" }
);

let pass = 0;
let fail = 0;
const check = (label, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${a}, expected ${e})`}`);
};
const logs = [];
for (const level of ["warn", "info", "error"]) {
  console[level] = (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
}

/* ---------------- stubs ---------------- */
const ai = { calls: [], reply: null, fail: null };
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          ai.calls.push(req);
          if (ai.fail) throw ai.fail;
          return { choices: [{ message: { content: typeof ai.reply === "string" ? ai.reply : JSON.stringify(ai.reply) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
        },
      },
    };
  }
}
FakeOpenAI.APIConnectionError = class extends Error {};
require.cache[require.resolve("openai")] = { id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI } };

const tmdbRow = (id, title, year) => ({ id, title, name: title, original_title: title, original_name: title, release_date: `${year}-01-01`, first_air_date: `${year}-01-01`, vote_count: 900, popularity: 90, overview: `${title} overview.` });
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  const m = u.pathname.match(/^\/3\/search\/(movie|tv|multi)$/);
  if (m) {
    const q = (u.searchParams.get("query") || "").toLowerCase();
    const results = q === "lioness" && m[1] !== "movie" ? [{ ...tmdbRow(113962, "Lioness", 2023), media_type: "tv" }] : [];
    return new Response(JSON.stringify({ results }), { status: 200 });
  }
  return new Response("{}", { status: 404 });
};

process.env.OPENAI_API_KEY = "stub";
process.env.TMDB_API_KEY = "v3key";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.REKS_MODEL_PROVIDER;
delete process.env.REKS_PROVIDER_MOOD;

const V = require(path.join(OUT, "src/lib/voiceMood.js"));
const mood = require(path.join(OUT, "app/api/mood/route.js"));
const voice = require(path.join(OUT, "app/api/voice/route.js"));
const CLIENT = "anon_s13c_client_0001";
const post = async (route, body) => {
  const res = await route.POST(new Request("http://local/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const noGoTos = { movies: [], tv: [], wine: null };

(async () => {
  console.log("\n1. The vocabulary guarantee");
  const v = (raw, bar = "Movies") => V.validateMood(raw, bar);
  check("goofy comedy → Movies · Comedy", (({ category, lane, mapped }) => [category, lane?.label, mapped])(v({ category: "Movies", lane: "Comedy", mapped: true })), ["Movies", "Comedy", true]);
  check("a horror movie → Horror (a recipe lane, not on the chip row)", v({ category: "Movies", lane: "horror", mapped: true }).lane, { label: "Horror", lane: "Horror" });
  check("TV lanes: Sci-Fi spelled as the chip row", v({ category: "TV Shows", lane: "sci-fi" }).lane?.label, "Sci-Fi");
  check("an invented lane is dropped", v({ category: "Movies", lane: "Swashbuckler", mapped: true }).lane, null);
  check("an invented refiner is dropped", v({ category: "Movies", lane: "Comedy", refiner: "Zany" }).refiner, null);
  check("refiner kept when it's the category's own", v({ category: "Movies", lane: "Comedy", refiner: "feel-good" }).refiner, "Feel-good");
  check("unclear category → the bar's", v({ category: null, lane: "Comedy" }, "TV Shows").category, "TV Shows");
  check("wine: lane, style refiner and price chip", (({ lane, refiner, price }) => [lane?.label, refiner, price])(v({ category: "Wine", lane: "Crisp White", refiner: "Easy sipper", price: "under20" })), ["Crisp White", "Easy sipper", "under20"]);
  check("price only on wine", v({ category: "Movies", lane: "Comedy", price: "under20" }).price, null);
  check("an unknown price chip is dropped", v({ category: "Wine", lane: "Rosé", price: "cheap" }).price, null);
  check("Books is out of v1: nothing maps, nothing searches", (({ category, mapped, lane }) => [category, mapped, lane])(v({ category: null, lane: "Mystery" }, "Books")), ["Books", false, null]);
  check("nothing maps → mapped false + closest from the vocabulary", (({ mapped, closest }) => [mapped, closest])(v({ category: "Movies", lane: null, mapped: false, closest: ["Comedy", "Banana", "Drama", "Comedy"] })), [false, ["Comedy", "Drama"]]);
  check("model says mapped but gave no usable tag → not mapped", v({ category: "Movies", lane: "xyz", mapped: true }).mapped, false);
  check("a named title is kept (trimmed)", v({ category: "TV Shows", lane: "Comedy", go_to: "  Lioness " }).goTo, "Lioness");
  const w = V.categoryFromWords;
  check("words decide the category: movie on the Wine bar", w("a horror movie", "Wine"), "Movies");
  check("…show / series → TV", [w("a dark twisty crime show", "Movies"), w("a cozy series", "Wine")], ["TV Shows", "TV Shows"]);
  check("…bottle / crisp → Wine", [w("a bottle for steak night", "Movies"), w("something crisp and cheap for the patio", "TV Shows")], ["Wine", "Wine"]);
  check("…a screen genre on the Wine bar → Movies", w("I'm feeling like a goofy comedy", "Wine"), "Movies");
  check("…a genre on the TV bar stays the bar's (no override)", w("I'm feeling like a goofy comedy", "TV Shows"), null);
  check("…two categories named → the model decides", w("a movie like Red Notice", "Movies"), null);
  check("…words win over the model's guess", V.validateMood({ category: "Wine", lane: "Horror" }, "Wine", "Movies").category, "Movies");
  const prompt = V.buildMoodPrompt();
  check("prompt carries every chip lane, refiner and price id", ["Comedy", "Horror", "Reality", "Bold Red", "Bubbles", "Feel-good", "Rich & cozy", "under20", "splurge"].every((t) => prompt.includes(t)), true);
  check("prompt never asks for prose (tags only)", /never recommend anything yourself/.test(prompt) && /Return JSON only/.test(prompt), true);

  console.log("\n2. /api/mood");
  let r = await post(mood, { clientId: CLIENT, transcript: "   ", barCategory: "Movies", goTos: noGoTos });
  check("empty transcript → 400", r.status, 400);
  r = await post(mood, { transcript: "comedy", barCategory: "Movies" });
  check("no client id → 400 (capped like search)", r.status, 400);
  ai.reply = { category: "Movies", lane: "Comedy", refiner: "Feel-good", go_to: null, price: null, mapped: true, closest: [] };
  r = await post(mood, { clientId: CLIENT, transcript: "I'm feeling like a goofy comedy", barCategory: "TV Shows", goTos: noGoTos });
  check("mapped answer", (({ ok, category, lane, refiner, mapped }) => [ok, category, lane, refiner, mapped])(r.json), [true, "Movies", { label: "Comedy", lane: "Comedy" }, "Feel-good", true]);
  const call = ai.calls.at(-1);
  check("one call on the mood step's default model, JSON mode, temperature 0", [call.model, call.response_format?.type, call.temperature], ["gpt-4o-mini", "json_object", 0]);
  check("the transcript and the bar ride the user message", /They said: "I'm feeling like a goofy comedy"/.test(call.messages[1].content) && /Selected category: TV Shows/.test(call.messages[1].content), true);
  check("no database → no mood id, still answers", r.json.moodId, null);
  ai.reply = { category: "TV Shows", lane: "Comedy", go_to: "Lioness", mapped: true };
  r = await post(mood, { clientId: CLIENT, transcript: "like Lioness but funnier", barCategory: "TV Shows", goTos: noGoTos });
  check("an unstarred title → a TMDb steer for this request", r.json.goTo, { name: "Lioness", starred: false, tmdbKind: "tv", tmdbId: 113962 });
  r = await post(mood, { clientId: CLIENT, transcript: "like Lioness but funnier", barCategory: "TV Shows", goTos: { movies: [], tv: ["Lioness"], wine: null } });
  check("a starred go-to steers as is", r.json.goTo, { name: "Lioness", starred: true, tmdbKind: null, tmdbId: null });
  ai.reply = { category: "TV Shows", lane: "Drama", go_to: "Nonexistent Show 9", mapped: true };
  r = await post(mood, { clientId: CLIENT, transcript: "like nonexistent show nine", barCategory: "TV Shows", goTos: noGoTos });
  check("a title TMDb doesn't know → no steer, named in the log", [r.json.goTo, logs.some((l) => l.includes("[mood] named title not on TMDb"))], [null, true]);
  ai.reply = "I think you want a comedy!";
  r = await post(mood, { clientId: CLIENT, transcript: "blorp", barCategory: "Movies", goTos: noGoTos });
  check("non-JSON from the model → 200, not mapped (the words stay)", [r.status, r.json.mapped], [200, false]);
  ai.reply = null;
  ai.fail = Object.assign(new Error("rate"), { status: 429 });
  r = await post(mood, { clientId: CLIENT, transcript: "comedy", barCategory: "Movies", goTos: noGoTos });
  check("a named service failure → the honest copy", [r.status, r.json.reason], [429, "rate_limit"]);
  ai.fail = null;

  console.log("\n3. /api/voice + voiceSignals");
  const v1 = await voice.POST(new Request("http://local/api/voice", { method: "POST", body: JSON.stringify({ clientId: CLIENT, moodId: "nope", events: [{ kind: "tap", title: "X" }] }) }));
  check("a bad mood id → 204 and a named refusal", [v1.status, logs.some((l) => l.includes("[voice] event refused"))], [204, true]);
  const vsrc = read("app/api/voice/route.ts");
  check("events only onto the client's own mood", /\.eq\("id", moodId\)\.eq\("client_id", clientId\)/.test(vsrc), true);
  // voiceSignals, transpiled with a fetch spy.
  const posts = [];
  const sig = (() => {
    const out = ts.transpileModule(read("src/lib/voiceSignals.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
    const m = { exports: {} };
    const g = { window: {}, fetch: (u, o) => { posts.push(JSON.parse(o.body)); return Promise.resolve(); } };
    new Function("module", "exports", "require", "window", "fetch", out)(m, m.exports, (id) => (id === "./userPrefs" ? { getAnonymousClientId: () => CLIENT } : require(id)), g.window, g.fetch);
    return m.exports;
  })();
  sig.setVoiceSet("11111111-1111-4111-8111-111111111111", ["A", "B", "C", "D", "E"]);
  check("setVoiceSet → one post with five 'shown' at positions 0–4", posts[0].events.map((e) => `${e.kind}:${e.title}:${e.position}`), ["shown:A:0", "shown:B:1", "shown:C:2", "shown:D:3", "shown:E:4"]);
  sig.noteVoiceAction("play", "C");
  sig.noteVoiceAction("play", "C");
  sig.noteVoiceAction("save", "Z");
  check("one event per (kind, title); titles outside the set ignored", posts.slice(1).map((p) => p.events[0].kind + ":" + p.events[0].title), ["play:C"]);
  sig.addToVoiceSet("F");
  sig.noteVoiceAction("star", "F");
  check("a replacement joins the set (shown at 5, then starred)", posts.slice(2).map((p) => `${p.events[0].kind}:${p.events[0].title}:${p.events[0].position}`), ["shown:F:5", "star:F:5"]);
  sig.clearVoiceSet();
  sig.noteVoiceAction("tap", "A");
  check("another search ends the voice set", posts.length, 4);

  console.log("\n4. The bar and the page");
  const bar = read("src/components/SearchBar.tsx").replace(/\r\n/g, "\n");
  const base = execSync("git show 0a81a81:src/components/SearchBar.tsx", { cwd: ROOT, encoding: "utf8" }).replace(/\r\n/g, "\n");
  // Quoted strings and JSX text that a person could read (a TS generic
  // like "=> Promise<" is not text).
  // S17 — comment lines aren't wording; they're dropped before matching.
  const uncommented = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  const strings = (raw) => {
    const s = uncommented(raw);
    return new Set(
      (s.match(/"[A-Z][^"]{6,}"/g) || [])
        .concat(s.match(/>\s*[A-Z][^<{]{6,}</g) || [])
        .map((x) => x.replace(/\s+/g, " ").trim())
        .filter((x) => !/^> Promise</.test(x))
    );
  };
  const added = [...strings(bar)].filter((x) => !strings(base).has(x));
  check("approved wording only: the two hints", added.sort(), ['"Say what you’re in the mood for"', '"Tap the keyboard mic to speak"'].sort());
  check("mic sits right before the camera, one tap target", bar.indexOf('data-testid="voice-mic"') < bar.indexOf('aria-label="Snap"') && (bar.match(/onClick=\{tapMic\}/g) || []).length, 1);
  check("no API → focus the box with the fallback hint", /if \(!speechSupported\(\)\) \{\s*fallBack\(\);/.test(bar) && /setHint\(FALLBACK_HINT\);\s*inputRef\.current\?\.focus\(\);/.test(bar), true);
  check("tap again stops", /if \(listening\) \{\s*listenerRef\.current\?\.stop\(\);/.test(bar), true);
  check("late answers dropped (chip, refiner, typing, GO, category)", (bar.match(/voiceEpoch\.current\+\+/g) || []).length >= 5, true);
  check("not mapped → the words stay and the closest chips lead", /setInput\(text\);\s*setChipOrder\(ans\?\.closest/.test(bar), true);
  const vin = read("src/lib/voiceInput.ts");
  check("refused / unavailable mic → fallback (not a dead button)", ["not-allowed", "service-not-allowed", "audio-capture", "network"].every((c) => vin.includes(`"${c}"`)), true);
  check("one phrase, interim words shown", /continuous = false/.test(vin) && /interimResults = true/.test(vin), true);
  check("no audio leaves the page (only text is posted)", !/MediaRecorder|getUserMedia|audio\/webm/.test(vin + bar), true);
  const page = read("app/page.tsx");
  check("screens: the slot recipe with the mapped chip, steered when a title was named", (/await handleSearch\(chipQuery\(cat, chip, refiner\), cat, \{ chip, refiner \}, steerOpts, voice\);/.test(page) || /await handleSearch\(chipQuery\(cat, plan\.chip, plan\.refiner\), cat, \{ chip: plan\.chip, refiner: plan\.refiner \}, plan\.steerOpts, voice\);/.test(page) /* S16: slotPlanFromMood */ || /await handleSearch\(`\$\{cat\}\|\|\|\|\$\{transcript\}\|\|mode:ai`, cat, undefined, undefined, voice, data\);/.test(page)) /* S19a: the typed branch, parse in hand */, true);
  check("wine: the wine chip search, price as lane words", /chipQuery\("Wine", \{ label: chip\.label, lane: laneText \}, refiner\)/.test(page), true);
  // S24a — a named title is the first steering ref (never stored), kept for replacements.
  check("a named title rides as a transient ref, kept for replacements", /const refs = steeringRefs\(named, runCat\);/.test(page) && /refs: s\.refs,/.test(page), true);
  check("any other search ends the voice set", /if \(!voice\) clearVoiceSet\(\);/.test(page), true);
  check("both result paths mark the voice set", (page.match(/if \(voice\) setVoiceSet\(voice\.moodId/g) || []).length, 2);
  const r4 = read("src/components/ResultsV4.tsx");
  // S24a — through noteAct (which also notes Recent).
  check("cards report tap / play / share / save / star", ["\"tap\"", "\"play\"", "\"share\"", "\"save\"", "\"star\""].every((k) => r4.includes(`noteAct(${k}`)) && r4.includes("noteVoiceAction(kind, rek.title);"), true);

  console.log("\n5. Stats and SQL");
  const stats = read("app/api/stats/route.ts");
  check("stats: moods, mapped %, per category, five-card actions, ignored", ["voice_moods", "voice_mapped_pct", "voice_tapped", "voice_played", "voice_shared", "voice_saved", "voice_starred", "voice_ignored"].every((k) => stats.includes(k)), true);
  check("stats: spoken words HTML-escaped", /esc\(v\.said\)/.test(stats), true);
  check("stats: agent traffic excluded like the rest", /voiceReadout\(store, since, agentsOnly\)/.test(stats), true);
  const sql = read("docs/sql/s13-voice-moods.sql");
  check("SQL: RLS on, client roles revoked, both tables", (sql.match(/enable row level security/g) || []).length === 2 && (sql.match(/revoke all on table public\.voice_\w+ from anon, authenticated/g) || []).length === 2, true);
  check("SQL: transcript text only, capped at 300", /transcript text not null check \(char_length\(transcript\) between 1 and 300\)/.test(sql), true);

  console.log(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  process.stderr.write("HARNESS CRASH: " + (err && err.stack) + String.fromCharCode(10));
  process.exit(1);
});
