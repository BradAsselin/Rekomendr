/* eslint-disable no-console */
//
// scripts/validate-s33.cjs — S33 (Brad, 2026-10-31):
//   1. The re-roll ("+ More like this" on the snapped or typed title itself)
//      follows the standalone rule for Movies/TV/Books: only the MEDIA
//      sentence-3 swap differs; without the flag, for uses-mode, and for
//      wine or any other product, the prompt is byte-identical.
//   2. The guarantee on a re-roll: a sentence that compares, or names the
//      re-rolled title, never ships.
//   3. A chain reply that doesn't parse is retried once, silently; only a
//      second miss is a 502 (the failure line). Both attempts are logged.
//   4. The client, from source: the re-roll sends the flag and seeds the
//      Compare to row on the title only for Movies/TV/Books.
//
// Compiles the REAL /api/reksnap route. Stubs OpenAI by system prompt.
// No keys, no network.
//
//   node scripts/validate-s33.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s33-validate-"));

console.log("Compiling /api/reksnap from source…");
execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "tsc", "app/api/reksnap/route.ts",
    "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020",
    "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--lib", "es2020,dom",
  ],
  { stdio: "inherit", cwd: ROOT, shell: process.platform === "win32" }
);

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
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

/* ---------------- OpenAI stub: route by system prompt ---------------- */
const CHAIN_HEAD = "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they ";
const chainSystems = [];
// One raw reply per model call, in order; the last one repeats.
let chainRaw = [];
let visionReply = null;
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = req.messages?.[0]?.content || "";
          let text;
          if (typeof sys === "string" && sys.startsWith(CHAIN_HEAD)) {
            chainSystems.push(sys);
            text = chainRaw.length > 1 ? chainRaw.shift() : chainRaw[0];
          } else {
            text = visionReply;
          }
          if (req.stream) {
            return {
              async *[Symbol.asyncIterator]() {
                for (let i = 0; i < text.length; i += 50) yield { choices: [{ delta: { content: text.slice(i, i + 50) } }] };
                yield { choices: [{ delta: {}, finish_reason: "stop" }] };
              },
            };
          }
          return { choices: [{ message: { content: text }, finish_reason: "stop" }], usage: {} };
        },
      },
    };
  }
}
require.cache[require.resolve("openai")] = {
  id: "openai", filename: "openai", loaded: true, exports: { __esModule: true, default: FakeOpenAI },
};

process.env.OPENAI_API_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s33-secret";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TMDB_API_KEY;

const route = require(path.join(OUT, "app/api/reksnap/route.js"));
const post = async (body) => {
  const res = await route.POST(new Request("http://local/api/reksnap", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, json: await res.json().catch(() => null) };
};
const logs = { info: [], warn: [], error: [] };
const quiet = () => {
  const saved = [console.info, console.warn, console.error];
  console.info = (...a) => logs.info.push(a);
  console.warn = (...a) => logs.warn.push(a);
  console.error = (...a) => logs.error.push(a);
  return () => { [console.info, console.warn, console.error] = saved; };
};
const clearLogs = () => { logs.info.length = 0; logs.warn.length = 0; logs.error.length = 0; };

const ME = "anon_s33_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const S3_OLD = "Media sentence 3 — the comparative placement against the snapped item";
const S3_NEW = "Media sentence 3 — its register: the tone, pace, or texture of this title alone";
const REROLL_HEAD = "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they asked for a FRESH SET";

const snap = async (name, category) => {
  visionReply = JSON.stringify({
    detected_item: { name, description: "A signature profile.", category },
    mode: "similar",
    results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `${name} Sim ${i}`, description: "x", category })), uses: [], alternatives: [] },
  });
  return (await post({ image: IMG, clientId: ME })).json;
};

const call = async (first, opts = {}) => {
  const before = chainSystems.length;
  const r = await post({
    chain: {
      kind: opts.kind || "reroll",
      ...(opts.standalone ? { standalone: true } : {}),
      detectedItem: first.detected_item,
      mode: opts.mode || "similar",
      ...(opts.chained ? { chained: opts.chained, chainedOrigin: "frontier", chainDepth: 1 } : {}),
      trail: [],
      rejectedNames: [],
      excludeNames: [],
      clientId: ME,
      anchorToken: first.detected_item_token,
    },
  });
  return { ...r, calls: chainSystems.length - before, system: chainSystems.length > before ? chainSystems[chainSystems.length - 1] : null };
};

const lineDiff = (a, b) => {
  const A = a.split("\n");
  const B = b.split("\n");
  return { removed: A.filter((l) => !B.includes(l)), added: B.filter((l) => !A.includes(l)) };
};
const reply = (reks) => JSON.stringify({ reks });
const clean = (n) => ({ name: n, description: `A detective takes a case ${n}. The witness vanishes. Bleak and patient.`, category: "movie" });

(async () => {
  const restore = quiet();
  const movie = await snap("Heat", "movie");
  const tv = await snap("The Wire", "tv");
  const book = await snap("Piranesi", "book");
  const wine = await snap("Kim Crawford Sauvignon Blanc", "wine");
  const scotch = await snap("Glenlivet 12", "scotch");
  restore();
  check("snaps attested", [movie, tv, book, wine, scotch].map((s) => !!s?.detected_item_token), [true, true, true, true, true]);

  out("\n1. The re-roll prompt");
  chainRaw = [reply([1, 2, 3, 4, 5].map((i) => clean(`Pick ${i}`)))];
  const r0 = quiet();
  const base = await call(movie);
  const alone = await call(movie, { standalone: true });
  const tvAlone = await call(tv, { standalone: true });
  const bookAlone = await call(book, { standalone: true });
  const usesFlag = await call(movie, { standalone: true, mode: "uses" });
  const usesBase = await call(movie, { mode: "uses" });
  const scotchFlag = await call(scotch, { standalone: true });
  const scotchBase = await call(scotch);
  const wineFlag = await call(wine, { standalone: true });
  const wineBase = await call(wine);
  r0();
  check("it is the re-roll prompt", [base.system.startsWith(REROLL_HEAD), alone.system.startsWith(REROLL_HEAD)], [true, true]);
  check("without the flag: the snap voice as it was", [base.system.includes(S3_OLD), base.system.includes(S3_NEW)], [true, false]);
  check("standalone: sentence 3 swapped", [alone.system.includes(S3_OLD), alone.system.includes(S3_NEW)], [false, true]);
  const d = lineDiff(base.system, alone.system);
  check("…and only the media frame, sentence 3 and its RIGHT/WRONG examples differ (4 out, 4 in)", [d.removed.length, d.added.length], [4, 4]);
  check("…every changed line is one of those", d.removed.every((l) => /Media anchor and media reks|Media sentence 3|Faster and funnier|Warmer and more nostalgic/.test(l)), true);
  check("…the re-roll rule and the rest of the voice are intact", [
    alone.system.includes("RE-ROLL RULE: every previously seen name is banned"),
    alone.system.includes("Media sentence 1 — the setup"),
    alone.system.includes("Media sentence 2 — the complication"),
    alone.system.includes("DIFFERENTIATOR RULE — this line ALONE owns the sentence count"),
  ], [true, true, true, true]);
  check("TV and Books re-rolls with the flag are standalone too", [tvAlone.system.includes(S3_NEW), bookAlone.system.includes(S3_NEW)], [true, true]);
  check("uses-mode ignores the flag — byte-identical", usesFlag.system, usesBase.system);
  check("scotch ignores the flag — byte-identical", scotchFlag.system, scotchBase.system);
  check("wine (the chain route) ignores the flag — byte-identical", wineFlag.system, wineBase.system);

  out("\n2. The guarantee on a re-roll");
  chainRaw = [reply([
    clean("Clean"),
    { name: "Names It", description: "A thief plans one score. The crew splits. Heat with the sound turned down.", category: "movie" },
    { name: "Compares", description: "A cop hunts a killer. The trail goes cold. Quieter than the one you typed.", category: "movie" },
    { name: "All Compare", description: "Same cat-and-mouse, but in Paris. Trades the guns for knives.", category: "movie" },
  ])];
  clearLogs();
  const r1 = quiet();
  const g = await call(movie, { standalone: true });
  const gBase = await call(movie);
  r1();
  const by = Object.fromEntries((g.json?.reks || []).map((r) => [r.name, r.description]));
  check("a standalone line ships untouched", by["Clean"], clean("Clean").description);
  check("a sentence naming the re-rolled title is removed", by["Names It"], "A thief plans one score. The crew splits.");
  check("a comparing sentence is removed", by["Compares"], "A cop hunts a killer. The trail goes cold.");
  check("a card with nothing standing alone doesn't ship", "All Compare" in by, false);
  check("…logged", logs.warn.some((a) => a[0] === "[chain] standalone: comparing sentences removed"), true);
  check("without the flag nothing is touched", (gBase.json?.reks || []).length, 4);

  out("\n3. A reply that doesn't parse: one silent retry");
  for (const [label, opts] of [["re-roll", {}], ["steer", { kind: "steer", chained: { name: "Collateral", description: "d", category: "movie" } }]]) {
    chainRaw = ["{ not json", reply([clean("Retry One"), clean("Retry Two")])];
    clearLogs();
    const r2 = quiet();
    const ok = await call(movie, opts);
    r2();
    check(`${label}: a bad reply then a good one → 200 with the good set`, [ok.status, ok.calls, (ok.json?.reks || []).map((r) => r.name)], [200, 2, ["Retry One", "Retry Two"]]);
    const w = logs.warn.find((a) => a[0] === "[chain] parse failed — retrying");
    check(`${label}: attempt 1 logged (warn), attempt 2 logged (info)`, [
      !!w && w[1].attempt === 1 && w[1].of === 2 && typeof w[1].chars === "number" && "finishReason" in w[1],
      logs.info.some((a) => a[0] === "[chain] parse retry succeeded" && a[1].attempt === 2),
      logs.error.length,
    ], [true, true, 0]);

    chainRaw = ["{ not json"];
    clearLogs();
    const r3 = quiet();
    const bad = await call(movie, opts);
    r3();
    check(`${label}: two bad replies → 502 (the failure line), exactly two tries`, [bad.status, bad.calls], [502, 2]);
    check(`${label}: both attempts logged`, [
      logs.warn.filter((a) => a[0] === "[chain] parse failed — retrying").map((a) => a[1].attempt),
      logs.error.filter((a) => a[0] === "[chain] parse failed — giving up").map((a) => a[1].attempt),
    ], [[1], [2]]);
  }
  chainRaw = [reply([clean("First Try")])];
  const r4 = quiet();
  const once = await call(movie);
  r4();
  check("a good first reply: one call, no retry", [once.status, once.calls], [200, 1]);

  out("\n4. The client, from source");
  const snapSrc = read("src/components/RekSnapResults.tsx");
  const rerollFn = snapSrc.slice(snapSrc.indexOf("const handleAnchorReroll = () => {"), snapSrc.indexOf("// S8b — a price chip"));
  check("the wine re-roll returns before any of this (unchanged)", rerollFn.indexOf('"wine"\n') < rerollFn.indexOf("const anchorSeed") || /"wine"\s*\);\s*return;\s*}\s*const anchorSeed/.test(rerollFn), true);
  check("the seed comes from chainSeedFor (Movies/TV/Books only, never uses-mode)", /const anchorSeed = chainSeedFor\(/.test(rerollFn), true);
  check("…with the anchor's TMDb identity", /tmdbKind: forResult\.media\.kind, tmdbId: forResult\.media\.id \?\? null/.test(rerollFn), true);
  check("the flag rides only with a seed", /\.\.\.\(seed \? \{ standalone: true \} : \{\}\)/.test(rerollFn), true);
  check("the re-rolled title becomes the Compare to seed when the set lands", /"chain",[^]*?seed\s*\);/.test(rerollFn), true);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
