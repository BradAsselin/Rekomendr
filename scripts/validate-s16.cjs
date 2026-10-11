/* eslint-disable no-console */
//
// scripts/validate-s16.cjs — Session 1.6's counted validation (mechanism).
//
// Compiles the REAL /api/reksnap route and the snapshot completion from
// source and drives them with a stub OpenAI and a stub TMDb (fetch). No
// keys, no network. It proves the PLUMBING: which tier grounds the anchor,
// that the token signs the grounded text, that the long tier receives the
// synopsis as data, that non-media is untouched, and that every failure
// keeps the vision anchor and is named. What the MODEL writes from those
// inputs is counted separately, against the real API, in the PR's report.
//
//   node scripts/validate-s16.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s16-validate-"));

console.log("Compiling the S1.6 server code from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/reksnap/route.ts",
    "src/lib/anchorCompletion.ts",
    "src/lib/tmdbVerify.ts",
    "src/lib/mintToken.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
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
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}  (got ${a}, expected ${e})`);
};

let logs = [];
for (const level of ["warn", "info", "log", "error"]) {
  console[level] = (...args) => {
    logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
}
const logged = (needle) => logs.some((l) => l.includes(needle));

/* Stub TMDb (global fetch). */
const OVERVIEW = "The host of a paranormal podcast becomes haunted by terrifying recordings mysteriously sent her way.";
const tmdb = { mode: "hit", calls: [] }; // hit | miss | down | no_overview | twins
globalThis.fetch = async (url) => {
  const u = String(url);
  if (!u.includes("api.themoviedb.org")) throw new Error(`unexpected fetch ${u}`);
  const q = decodeURIComponent((u.match(/query=([^&]+)/) || [])[1] || "");
  tmdb.calls.push(q);
  if (tmdb.mode === "down") return new Response("{}", { status: 503 });
  const row = (title, year, overview, popularity) => ({
    title, name: title, original_title: title, original_name: title,
    release_date: `${year}-03-13`, first_air_date: `${year}-03-13`, overview, popularity,
  });
  let results = [];
  if (/undertone/i.test(q)) {
    if (tmdb.mode === "hit") results = [row("Undertone", 2026, OVERVIEW, 40)];
    if (tmdb.mode === "no_overview") results = [row("Undertone", 2026, "", 40)];
    if (tmdb.mode === "twins")
      results = [row("Undertone", 2011, "An unrelated 2011 short.", 2), row("Undertone", 2026, OVERVIEW, 40)];
  } else if (/./.test(q) && tmdb.mode !== "miss") {
    // Reks: resolve everything so the real-title guard stays out of the way.
    results = [row(q, 2001, "A rek.", 5)];
  }
  return new Response(JSON.stringify({ results }), { status: 200, headers: { "content-type": "application/json" } });
};

/* Stub OpenAI: the vision reply is scripted; the rewrite and detail calls are recorded. */
const ai = { vision: null, rewrite: "REWRITTEN from the synopsis.", rewriteThrows: false, calls: [] };
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          ai.calls.push(req);
          const sys = req.messages?.[0]?.content ?? "";
          if (typeof sys === "string" && sys.startsWith("You write the two-sentence description")) {
            if (ai.rewriteThrows) throw new Error("rewrite boom");
            return { choices: [{ message: { content: JSON.stringify({ description: ai.rewrite }) } }] };
          }
          if (typeof sys === "string" && sys.includes("'Show details'")) {
            return { choices: [{ message: { content: JSON.stringify({ long: "A longer profile." }) } }] };
          }
          return { choices: [{ message: { content: JSON.stringify(ai.vision) } }] };
        },
      },
    };
    this.moderations = { create: async () => ({ results: [{ flagged: false }] }) };
  }
}
require.cache[require.resolve("openai")] = { id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI } };

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.OPENAI_API_KEY = "stub";
process.env.TMDB_API_KEY = "stub-v3-key";
const SECRET = "s16-harness-secret-0123456789abcdef0123456789abcdef";
process.env.MINT_SIGNING_SECRET = SECRET;

const fresh = (rel) => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(OUT)) delete require.cache[k];
  return require(path.join(OUT, rel));
};
const CLIENT = "anon_s16_harness_client";
const reks = (cat) => [1, 2, 3, 4, 5].map((i) => ({ name: `Rek ${i}`, description: "d", category: cat, rank: i }));
const visionReply = (item) => ({ detected_item: item, mode: "similar", results: { similar: reks(item.category), uses: reks(item.category), alternatives: reks(item.category) } });
const snap = async () => {
  const { POST } = fresh("app/api/reksnap/route.js");
  const res = await POST(new Request("http://local/api/reksnap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: "data:image/jpeg;base64,AAAA", clientId: CLIENT }) }));
  return { status: res.status, json: await res.json() };
};
const reset = () => { logs = []; ai.calls = []; tmdb.calls = []; tmdb.mode = "hit"; ai.rewriteThrows = false; };
const rewriteCalls = () => ai.calls.filter((c) => String(c.messages?.[0]?.content ?? "").startsWith("You write the two-sentence description"));
const undertoneLookups = () => tmdb.calls.filter((q) => /undertone/i.test(q)).length;
const VISION_SHORT = "A reclusive sound engineer hears strange frequencies. Dark and slow.";

(async () => {
  out("\n§1 Tier 1 — the photo carried the synopsis: nothing is looked up or rewritten");
  reset();
  ai.vision = visionReply({ name: "Undertone", category: "movies", description: "Podcast host, recordings. Tense.", grounding: "image_text", year: 2026 });
  let r = await snap();
  check("anchor text is the vision text", r.json.detected_item.description, "Podcast host, recordings. Tense.");
  check("grounding = image_text", r.json.detected_item.grounding, "image_text");
  check("TMDb never asked about the anchor", undertoneLookups(), 0);
  check("no rewrite call", rewriteCalls().length, 0);

  out("\n§2 Tier 2 — no synopsis in the photo, TMDb has one: rewritten from it");
  for (const claimed of ["unknown", "known", undefined]) {
    reset();
    ai.vision = visionReply({ name: "Undertone", category: "movies", description: VISION_SHORT, ...(claimed ? { grounding: claimed } : {}) });
    r = await snap();
    check(`model said ${claimed ?? "(nothing)"} → anchor is the rewrite`, r.json.detected_item.description, "REWRITTEN from the synopsis.");
    check(`…grounding = tmdb`, r.json.detected_item.grounding, "tmdb");
  }
  const call = rewriteCalls()[0];
  check("the rewrite sees the TMDb synopsis", String(call.messages[1].content).includes(OVERVIEW), true);
  check("the rewrite does NOT see the invented vision text", String(call.messages[1].content).includes("sound engineer"), false);
  check("the rewrite uses the shared media grammar", String(call.messages[0].content).includes("Sentence 1: a CHARACTERIZED role"), true);
  const { verifyAnchor } = fresh("src/lib/mintToken.js");
  check("the token signs the GROUNDED text (save will accept it)",
    verifyAnchor({ name: "Undertone", category: "movies", short: "REWRITTEN from the synopsis.", long: null, clientId: CLIENT }, r.json.detected_item_token), true);
  check("…and not the vision text it replaced",
    verifyAnchor({ name: "Undertone", category: "movies", short: VISION_SHORT, long: null, clientId: CLIENT }, r.json.detected_item_token), false);
  check("tripwire names the tier", logged('[anchor-grounding] {"tier":"tmdb"'), true);

  reset();
  tmdb.mode = "twins";
  ai.vision = visionReply({ name: "Undertone", category: "movies", description: VISION_SHORT, grounding: "unknown", year: 2026 });
  await snap();
  check("same-title films: the year picks the right one", String(rewriteCalls()[0].messages[1].content).includes("(2026)"), true);
  reset();
  tmdb.mode = "twins";
  ai.vision = visionReply({ name: "Undertone", category: "movies", description: VISION_SHORT, grounding: "unknown", year: null });
  await snap();
  check("no year: the most popular match wins", String(rewriteCalls()[0].messages[1].content).includes(OVERVIEW), true);

  out("\n§3 Tier 3 and failures — the vision anchor stands, and the miss is named");
  for (const [mode, reason] of [["miss", "no_match"], ["no_overview", "no_overview"], ["down", "lookup_failed"]]) {
    reset();
    tmdb.mode = mode;
    ai.vision = visionReply({ name: "Undertone", category: "movies", description: "Too new for me to know its story yet. Sound-led.", grounding: "unknown" });
    r = await snap();
    check(`TMDb ${mode} → vision anchor kept`, r.json.detected_item.description, "Too new for me to know its story yet. Sound-led.");
    check(`…grounding = unknown, no rewrite`, [r.json.detected_item.grounding, rewriteCalls().length], ["unknown", 0]);
    check(`…logged ${reason}`, logged(`"reason":"${reason}"`), true);
  }
  reset();
  ai.rewriteThrows = true;
  ai.vision = visionReply({ name: "Undertone", category: "movies", description: VISION_SHORT, grounding: "unknown" });
  r = await snap();
  check("rewrite throws → vision anchor kept, 200", [r.status, r.json.detected_item.description], [200, VISION_SHORT]);
  check("…named rewrite_failed", logged("[anchor-grounding] rewrite_failed"), true);
  reset();
  delete process.env.TMDB_API_KEY;
  ai.vision = visionReply({ name: "Undertone", category: "movies", description: VISION_SHORT, grounding: "unknown" });
  r = await snap();
  check("no TMDB_API_KEY → vision anchor kept, named disabled", [r.json.detected_item.description, logged('"reason":"disabled"')], [VISION_SHORT, true]);
  process.env.TMDB_API_KEY = "stub-v3-key";

  out("\n§4 Non-media is untouched");
  reset();
  ai.vision = visionReply({ name: "Test Rosé", category: "wine", description: "Dry and saline. Built for a hot afternoon, not a rich dinner." });
  r = await snap();
  check("wine: anchor text unchanged", r.json.detected_item.description, "Dry and saline. Built for a hot afternoon, not a rich dinner.");
  check("wine: no grounding field, no lookup, no rewrite", ["grounding" in r.json.detected_item, tmdb.calls.length, rewriteCalls().length], [false, 0, 0]);

  out("\n§5 The long tier gets the synopsis as data; its system prompt is untouched");
  const { signAnchor } = fresh("src/lib/mintToken.js");
  const detail = async (name, category, short) => {
    const token = signAnchor({ name, category, short, long: null, clientId: CLIENT });
    const { POST } = fresh("app/api/reksnap/route.js");
    const res = await POST(new Request("http://local/api/reksnap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ anchorDetail: { name, category, shortDescription: short, clientId: CLIENT, token } }) }));
    return res.status;
  };
  const { ANCHOR_DETAIL_PROMPT } = fresh("src/lib/anchorDetailPrompt.js");
  reset();
  check("movie detail → 200", await detail("Undertone", "movies", "REWRITTEN."), 200);
  let user = String(ai.calls.at(-1).messages[1].content);
  check("…user message carries the synopsis", user.includes(`Plot facts you may use (TMDb synopsis)`) && user.includes(OVERVIEW), true);
  check("…system prompt is ANCHOR_DETAIL_PROMPT, unchanged", ai.calls.at(-1).messages[0].content === ANCHOR_DETAIL_PROMPT, true);
  reset();
  tmdb.mode = "miss";
  await detail("Undertone", "movies", "Too new for me to know its story yet. Sound-led.");
  user = String(ai.calls.at(-1).messages[1].content);
  check("movie with no synopsis → 'add no plot facts' line", user.includes("Add no plot facts beyond the displayed profile"), true);
  reset();
  await detail("Test Rosé", "wine", "Dry and saline.");
  user = String(ai.calls.at(-1).messages[1].content);
  check("wine detail → user message byte-identical to before", user, "Item: Test Rosé\nCategory: wine\nIts displayed profile: Dry and saline.");

  out("\n§6 The vision prompt: grammar moved byte-identical, grounding clause present");
  const now = fs.readFileSync(path.join(ROOT, "app/api/reksnap/route.ts"), "utf8");
  const before = execFileSync("git", ["show", "main:app/api/reksnap/route.ts"], { cwd: ROOT, encoding: "utf8" });
  const grammarLines = now.slice(now.indexOf("const MEDIA_ANCHOR_GRAMMAR ="), now.indexOf("const SYSTEM_PROMPT =")).split("\n").filter((l) => l.trim().startsWith('"'));
  check("MEDIA_ANCHOR_GRAMMAR has the five grammar lines", grammarLines.length, 5);
  check("…each one verbatim in main's SYSTEM_PROMPT", grammarLines.every((l) => before.includes(l.replace(/;$/, " +").replace(/" \+$/, '" +'))), true);
  check("GROUNDING clause is in the vision prompt", now.includes('"GROUNDING (media)'), true);
  check("the example is NOT the test fixture (no waveform in the prompt)", /waveform/i.test(now.slice(now.indexOf("const SYSTEM_PROMPT ="), now.indexOf("const SYSTEM_PROMPT =") + 20000)), false);

  out(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`HARNESS ERROR ${e && e.stack}\n`);
  process.exit(1);
});
