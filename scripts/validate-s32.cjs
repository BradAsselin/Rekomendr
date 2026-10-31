/* eslint-disable no-console */
//
// scripts/validate-s32.cjs — S32: "+ More like this" on a card under a
// snapped or typed title follows S31's More like this rule (Brad,
// 2026-10-31): standalone lines, "Compare to [Title]" unchecked.
//
//   1. The route's chain prompt: with `standalone` on a Movies/TV/Books
//      pursuit, the referent override is gone and the MEDIA clause's
//      sentence 3 is swapped — nothing else in the prompt differs.
//      Without the flag, for uses-mode, or for a non-title pursuit, the
//      prompt is byte-identical to the snap voice as it was.
//   2. The guarantee: a comparing sentence, or one naming the tapped or
//      the snapped title, never ships; a card with nothing left is dropped.
//   3. The client, from source: the chain sends the flag only for a title,
//      and the chained card becomes the Compare to seed once its set lands.
//
// Compiles the REAL /api/reksnap route. Stubs OpenAI by system prompt.
// No keys, no network.
//
//   node scripts/validate-s32.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s32-validate-"));

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
const CHAIN_HEAD = "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they have been steering";
const chainSystems = [];
let chainReply = () => ({ reks: [] });
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
            text = JSON.stringify(chainReply(req));
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
process.env.MINT_SIGNING_SECRET = "s32-secret";
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
const warns = [];
const quiet = () => {
  const saved = [console.info, console.warn, console.error];
  console.info = () => {};
  console.warn = (...a) => warns.push(a);
  console.error = () => {};
  return () => { [console.info, console.warn, console.error] = saved; };
};

const ME = "anon_s32_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const OVERRIDE = "REFERENT OVERRIDE for this task: comparisons are ALWAYS against the CHAINED ITEM";
const S3_OLD = "Media sentence 3 — the comparative placement against the snapped item";
const S3_NEW = "Media sentence 3 — its register: the tone, pace, or texture of this title alone";

const snap = async (name, category) => {
  visionReply = JSON.stringify({
    detected_item: { name, description: "A signature profile.", category },
    mode: "similar",
    results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `${name} Sim ${i}`, description: "x", category })), uses: [], alternatives: [] },
  });
  const r = await post({ image: IMG, clientId: ME });
  return r.json;
};

const chain = async (first, chained, opts = {}) => {
  const before = chainSystems.length;
  const r = await post({
    chain: {
      kind: "steer",
      ...(opts.standalone ? { standalone: true } : {}),
      detectedItem: first.detected_item,
      mode: opts.mode || "similar",
      chained,
      chainedOrigin: "frontier",
      chainDepth: 1,
      trail: [],
      rejectedNames: [],
      excludeNames: [],
      clientId: ME,
      anchorToken: first.detected_item_token,
    },
  });
  return { ...r, system: chainSystems.length > before ? chainSystems[chainSystems.length - 1] : null };
};

const lineDiff = (a, b) => {
  const A = a.split("\n");
  const B = b.split("\n");
  return { removed: A.filter((l) => !B.includes(l)), added: B.filter((l) => !A.includes(l)) };
};

(async () => {
  const restore = quiet();
  const movie = await snap("Arrival", "movie");
  const book = await snap("Piranesi", "book");
  const scotch = await snap("Glenlivet 12", "scotch");
  restore();
  check("snaps attested (tokens present)", [!!movie?.detected_item_token, !!book?.detected_item_token, !!scotch?.detected_item_token], [true, true, true]);

  out("\n1. The chain prompt");
  const good = (n) => [1, 2, 3, 4, 5].map((i) => ({ name: `${n} ${i}`, description: `A linguist is hired to decode a signal ${i}. The army wants answers before the ships leave. Played slow and intimate.`, category: "movie" }));
  chainReply = () => ({ reks: good("Pick") });
  const r0 = quiet();
  const base = await chain(movie, { name: "Contact", description: "d", category: "movie" });
  const alone = await chain(movie, { name: "Contact", description: "d", category: "movie" }, { standalone: true });
  const bookAlone = await chain(book, { name: "Jonathan Strange & Mr Norrell", description: "d", category: "book" }, { standalone: true });
  const uses = await chain(movie, { name: "Contact", description: "d", category: "movie" }, { standalone: true, mode: "uses" });
  const usesBase = await chain(movie, { name: "Contact", description: "d", category: "movie" }, { mode: "uses" });
  const scotchFlag = await chain(scotch, { name: "Lagavulin 16", description: "d", category: "scotch" }, { standalone: true });
  const scotchBase = await chain(scotch, { name: "Lagavulin 16", description: "d", category: "scotch" });
  r0();
  check("without the flag: the snap voice as it was (override + comparative sentence 3)", [base.system.includes(OVERRIDE), base.system.includes(S3_OLD)], [true, true]);
  check("standalone: no override, sentence 3 swapped", [alone.system.includes(OVERRIDE), alone.system.includes(S3_OLD), alone.system.includes(S3_NEW)], [false, false, true]);
  const d = lineDiff(base.system, alone.system);
  check("…and only those lines differ (5 out: override, media frame, sentence 3, its RIGHT and WRONG examples; 4 in)", [d.removed.length, d.added.length], [5, 4]);
  check("…every changed line is one of the four instructions", d.removed.every((l) => /REFERENT OVERRIDE|Media anchor and media reks|Media sentence 3|Faster and funnier|Warmer and more nostalgic/.test(l)), true);
  check("…the rest of the voice is intact (sentences 1-2, the count rule, the bans)", [
    alone.system.includes("Media sentence 1 — the setup"),
    alone.system.includes("Media sentence 2 — the complication"),
    alone.system.includes("DIFFERENTIATOR RULE — this line ALONE owns the sentence count"),
    alone.system.includes("BAN category-membership filler"),
    alone.system.includes("THE LINE — core rule"),
  ], [true, true, true, true, true]);
  check("a Books pursuit with the flag is standalone too", [bookAlone.system.includes(OVERRIDE), bookAlone.system.includes(S3_NEW)], [false, true]);
  check("uses-mode ignores the flag (byte-identical to its own base)", uses.system, usesBase.system);
  check("a non-title pursuit (scotch) ignores the flag — byte-identical", scotchFlag.system, scotchBase.system);

  out("\n2. The guarantee");
  chainReply = () => ({
    reks: [
      { name: "Clean One", description: "A grieving linguist decodes a signal from orbit. The army wants answers before the ships leave. Played slow and intimate.", category: "movie" },
      { name: "Same Opener", description: "Same first-contact dread, but the aliens are underwater. A diver is trapped below the rig. Played as a siege.", category: "movie" },
      { name: "Names Seed", description: "A radio astronomer hears a voice in the noise. The voice knows her father's name. Like Contact with a ghost story inside.", category: "movie" },
      { name: "Names Anchor", description: "A translator is flown to a crash site. Nobody will say what crashed. The anti-Arrival.", category: "movie" },
      { name: "All Compare", description: "Quieter than the one you saw. Trades the ships for a basement. Instead of linguists, plumbers.", category: "movie" },
    ],
  });
  warns.length = 0;
  const r1 = quiet();
  const g = await chain(movie, { name: "Contact", description: "d", category: "movie" }, { standalone: true });
  const gBase = await chain(movie, { name: "Contact", description: "d", category: "movie" });
  r1();
  const by = Object.fromEntries((g.json?.reks || []).map((r) => [r.name, r.description]));
  check("200", g.status, 200);
  check("a standalone line ships untouched", by["Clean One"], "A grieving linguist decodes a signal from orbit. The army wants answers before the ships leave. Played slow and intimate.");
  check("a 'Same…, but' sentence is removed", by["Same Opener"], "A diver is trapped below the rig. Played as a siege.");
  check("a sentence naming the tapped title is removed", by["Names Seed"], "A radio astronomer hears a voice in the noise. The voice knows her father's name.");
  check("a sentence naming the snapped title is removed", by["Names Anchor"], "A translator is flown to a crash site. Nobody will say what crashed.");
  chainReply = () => ({ reks: [{ name: "Stretched", description: "A hitman finishes a job in Paris. A witness lets him go. Austere and wordless, it goes further into minimalism than the source of the chain.", category: "movie" }] });
  const r2 = quiet();
  const st = await chain(movie, { name: "Contact", description: "d", category: "movie" }, { standalone: true });
  r2();
  check("a stretched comparative ('further … than the source') is removed (live leak, S32)", st.json?.reks?.[0]?.description, "A hitman finishes a job in Paris. A witness lets him go.");
  check("a card with nothing standing alone doesn't ship", "All Compare" in by, false);
  check("no shipped line compares or names either title", Object.values(by).some((t) => /\b(same|than|trades|instead of)\b|Contact|Arrival/i.test(t)), false);
  check("…and the removal is logged", warns.some((a) => a[0] === "[chain] standalone: comparing sentences removed"), true);
  check("without the flag, nothing is touched (snap voice as it was)", (gBase.json?.reks || []).length, 5);

  out("\n3. The client, from source");
  const snapSrc = read("src/components/RekSnapResults.tsx");
  check("chainSeedFor: null for uses-mode and wine cards, a title category otherwise", [
    /if \(mode === "uses" \|\| rek\.wine\) return null;/.test(snapSrc),
    /goToCategoryFor\(rek\.category \|\| anchorCategory\)/.test(snapSrc),
  ], [true, true]);
  check("both card chains send standalone only for a title", (snapSrc.match(/standalone: !!seed,/g) || []).length, 2);
  check("the seed lands with the set (not before), wine chains leave it alone", [
    (snapSrc.match(/wineList\(forResult, mode\) \? undefined : seed/g) || []).length,
    /if \(seedAfter !== undefined\) setChainSeed\(seedAfter\);/.test(snapSrc),
  ], [2, true]);
  check("an anchor re-roll ends the chained seed", /"chain",\s*\/\/ S32 — a re-roll is back on the anchor's line: no chained title\.\s*null/.test(snapSrc), true);
  check("a new snap starts with no chained seed", /setWinePending\(startOff \? autoRef\[0\] : null\);\s*setChainSeed\(null\);/.test(snapSrc), true);
  check("the Compare to row uses the chained seed first", /const activeSeed = chainSeed \?\? \(mltSeed/.test(snapSrc), true);
  const hook = read("src/components/MltCompare.tsx");
  check("the seed never gets a line against itself", /key\(i\.title\) !== key\(seed\.name\)/.test(hook), true);

  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
