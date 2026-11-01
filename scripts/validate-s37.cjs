/* eslint-disable no-console */
//
// scripts/validate-s37.cjs — S37, the S36 follow-ups under charter §2.14
// (Brad, 2026-11-01):
//
//   1. Wine descriptions stand alone. The wine engine's prompt swaps only
//      the instruction that made its lines comparative; every other prompt
//      keeps the snap voice byte-for-byte. A sentence that still compares
//      never ships (the guarantee); a pick with nothing left is dropped.
//      The "vs." line (vs_favorite) is still written against the bottle.
//   2. A typed or snapped single bottle starts "Compare to [Bottle] ☑";
//      unchecking hides the lines and ring, checking again shows them with
//      no new call (client, from source).
//   3. A new search starts with Compare to off; a reopened Recent set
//      brings back the references it was shown with.
//   4. Opening a card in the snap lane lands it in Recent.
//
// Compiles the REAL /api/reksnap route. Stubs OpenAI by prompt text.
// No keys, no network.
//
//   node scripts/validate-s37.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s37-validate-"));

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

/* ---------------- OpenAI stub: route by prompt text ---------------- */
const WINE_HEAD = "You are a taste-aware wine recommendation engine.";
const SHELF_HEAD = "You are reading a photo taken in a wine shop";
const wineSystems = [];
const otherSystems = [];
let wineReply = () => ({ anchor: { price_usd: 15, dry_sweet: 2, light_bold: 4 }, reks: [] });
let visionReply = null;
class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (req) => {
          const sys = typeof req.messages?.[0]?.content === "string" ? req.messages[0].content : "";
          let text;
          if (sys.startsWith(WINE_HEAD)) {
            wineSystems.push(sys);
            text = JSON.stringify(wineReply(req));
          } else if (sys.startsWith(SHELF_HEAD)) {
            text = JSON.stringify({ scene: "single", anchor_name: null, anchor_reason: null, anchor_price: null, bottles: [] });
          } else {
            otherSystems.push(sys);
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
process.env.MINT_SIGNING_SECRET = "s37-secret";
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

const ME = "anon_s37_client_0001";
const IMG = "data:image/jpeg;base64,AAAA";
const BOTTLE = "Josh Cellars Cabernet Sauvignon";
const pick = (name, description, vs = "drier, less vanilla, similar body") => ({
  name, description, category: "wine", price_usd: 15, dry_sweet: 2, light_bold: 4, vs_favorite: vs,
});

(async () => {
  /* ---------------- 1. the wine engine's prompt and guarantee ---------------- */
  out("\n1. Wine descriptions stand alone (server)");
  visionReply = JSON.stringify({
    detected_item: { name: BOTTLE, description: "Dry and fruit-forward — blackberry and plum over vanilla.", category: "wine" },
    mode: "similar",
    results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `Vision Sim ${i}`, description: "Dry and dark-fruited.", category: "wine" })), uses: [], alternatives: [] },
  });
  wineReply = () => ({
    anchor: { price_usd: 15, dry_sweet: 2, light_bold: 4 },
    reks: [
      pick("Bogle Cabernet Sauvignon", "Dry and firmly tannic. The blackcurrant sits low and the grip builds through the finish. Built on structure, and it runs long."),
      pick("Louis Martini Cabernet Sauvignon", "Similarly dry, but more tannic. The dark fruit sits low under a dusty grip. Doubles down on the structure."),
      pick("Robert Mondavi Private Selection Cabernet", "Drier, with less vanilla. Leaner than the one you snapped."),
      pick("Columbia Crest Grand Estates Cabernet", "Off-dry, leaning plush. The fruit rides up front and the oak stays out of the way."),
      pick("Kendall-Jackson Vintner's Reserve Cabernet", "Dry, with cedar and cassis. It is softer than Josh Cellars Cabernet Sauvignon. The finish runs dusty."),
      pick("Joel Gott 815 Cabernet Sauvignon", "Bold and dark-fruited. The oak shows early and stays to the end. All volume, little restraint."),
    ],
  });
  warns.length = 0;
  let restore = quiet();
  const r = await post({ image: IMG, clientId: ME, category: "Wine", wineVisit: { seen: [], rejected: [], goTo: null } });
  restore();
  if (process.env.S37_DEBUG) console.log(JSON.stringify(r).slice(0, 1500), warns.map((w) => JSON.stringify(w).slice(0, 300)));
  const sys = wineSystems[wineSystems.length - 1] || "";
  check("the wine engine ran", wineSystems.length > 0, true);
  check("a single bottle compares to itself (autoRef)", r.json?.wine?.autoRef, true);
  check("prompt: sentence 1 is the bottle's own placement", sys.includes("Sentence 1 — the placement: where this item sits on the category's primary axis"), true);
  check("prompt: no 'Comparisons are ALWAYS against the detected item'", sys.includes("Comparisons are ALWAYS against the detected item"), false);
  check("prompt: no 'placement against the anchor'", sys.includes("placement against the anchor"), false);
  check("prompt: no 'relative to what the user loves about the anchor'", sys.includes("relative to what the user loves about the anchor"), false);
  check("prompt: no comparative RIGHT/WRONG pair left ('Similarly dry')", sys.includes("Similarly dry"), false);
  check("prompt: the vs. line is still asked for, against the bottle", sys.includes(`THE USER'S GO-TO WINE is ${BOTTLE}. For every pick, write vs_favorite`), true);
  check("prompt: the bans and the media clause are untouched", sys.includes("BAN category-membership filler") && sys.includes("Media sentence 3 — the comparative placement against the snapped item"), true);

  const sim = r.json?.results?.similar ?? [];
  const byName = Object.fromEntries(sim.map((s) => [s.name, s]));
  check("a standalone description ships unchanged", byName["Bogle Cabernet Sauvignon"]?.description, "Dry and firmly tannic. The blackcurrant sits low and the grip builds through the finish. Built on structure, and it runs long.");
  check("comparing sentences go, the rest stays", byName["Louis Martini Cabernet Sauvignon"]?.description, "The dark fruit sits low under a dusty grip.");
  check("a pick with nothing standalone left is dropped", !!byName["Robert Mondavi Private Selection Cabernet"], false);
  check("a sentence naming the bottle goes", byName["Kendall-Jackson Vintner's Reserve Cabernet"]?.description, "Dry, with cedar and cassis. The finish runs dusty.");
  check("the vs. line rides on the card", byName["Bogle Cabernet Sauvignon"]?.wine?.vsFavorite != null, true);
  check("five picks ship (the over-ask covers the drop)", sim.length, 5);
  check("the drop is logged, never silent", warns.some((w) => String(w[0]).includes("[wine] standalone: comparing sentences removed")), true);

  // A non-wine snap keeps the snap voice exactly as it was.
  visionReply = JSON.stringify({
    detected_item: { name: "Barilla Spaghetti", description: "Dry pasta.", category: "pasta" },
    mode: "similar",
    results: { similar: [1, 2, 3, 4, 5].map((i) => ({ name: `Pasta ${i}`, description: "Thicker strands. Holds sauce.", category: "pasta" })), uses: [], alternatives: [] },
  });
  restore = quiet();
  const p = await post({ image: IMG, clientId: ME });
  restore();
  const vis = otherSystems.join("\n");
  check("other snaps: the snap voice still compares to the detected item", vis.includes("Comparisons are ALWAYS against the detected item"), true);
  check("other snaps: their descriptions are untouched", p.json?.results?.similar?.[0]?.description, "Thicker strands. Holds sauce.");

  /* ---------------- 1b. the swap list, from source ---------------- */
  const routeSrc = read("app/api/reksnap/route.ts");
  check("one call site: the wine engine gets the standalone voice", /generateWineReks\(STANDALONE_WINE_VOICE,/.test(routeSrc) && !/generateWineReks\(DIFFERENTIATOR_VOICE/.test(routeSrc), true);
  check("each swap must match (drift throws)", routeSrc.includes("standalone wine swap missing"), true);
  check("the vision fallback runs the same guarantee", /finishWineReks\(standaloneWineReks\(similar,/.test(routeSrc), true);
  const wineSrc = read("src/lib/wineReks.ts");
  check("wine More like this: no referent override on descriptions", wineSrc.includes("descriptions compare against"), false);
  check("wine More like this: the direction still steers", wineSrc.includes("Continue that line beyond ${ctx.chained.name} — never back toward the anchor."), true);

  /* ---------------- 2. the wine checker ---------------- */
  out("\n2. The wine checker (src/lib/standaloneLine.ts)");
  const js = ts.transpileModule(read("src/lib/standaloneLine.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("module", "exports", "require", js)(mod, mod.exports, require);
  const SL = mod.exports;
  for (const [line, want] of [
    ["Drier, with less vanilla.", "bare comparative opener"],
    ["Slightly sweeter and rounder.", "bare comparative opener"],
    ["More oak, less fruit.", "more/less opener"],
    ["Similarly dry, but more tannic.", "same/like opener"],
    ["Doubles down on the structure.", "doubles down"],
    ["Trades the plushness for structure.", "trades"],
    ["It reads leaner than the one you snapped.", "the one you snapped"],
    ["It reads stern next to Josh Cellars Cabernet Sauvignon.", "names the seed"],
    ["Dry and firmly tannic.", null],
    ["Off-dry, leaning sweet, with ripe peach.", null],
    ["The passionfruit leads and a grassy edge cuts in behind it, keeping the sweetness honest.", null],
    ["Built on structure, and it runs long.", null],
  ]) {
    check(`"${line}" → ${want ?? "stands alone"}`, SL.wineComparativeReason(line, [BOTTLE]), want);
  }
  check("the shared media checker is unchanged", SL.comparativeReason("Drier, with less vanilla.", "Arrival"), null);

  /* ---------------- 3. the client, from source ---------------- */
  out("\n3. Compare to [Bottle] ☑, and new searches start off (client)");
  const rsr = read("src/components/RekSnapResults.tsx");
  const header = read("src/components/CompareSheet.tsx");
  const page = read("app/page.tsx");
  check("the header's checked state: \"Compare to [Name]\" + ☑", header.includes("{`Compare to ${pendingName}`}") && /<SquareCheck /.test(header) && header.includes("aria-pressed={true}"), true);
  check("checked = the named reference alone", /pendingName && refs\.length === 1 && refs\[0\]\.name === pendingName/.test(header), true);
  check("one tap on ☑ unchecks it", /onClick=\{\(\) => onRemove\(refs\[0\]\.name\)\}/.test(header), true);
  check("a single bottle always names itself in the row", /setWinePending\(autoRef\[0\] \?\? null\);/.test(rsr), true);
  check("it starts checked (More like this wine starts off)", /wineRefsRef\.current = startOff \? \[\] : autoRef;/.test(rsr), true);
  check("the row passes the bottle's name in both states", /pendingName=\{winePending \? shortWineName\(winePending\.name\) : undefined\}/.test(rsr), true);
  check("re-checking turns the hidden lines back on, no call", /if \(!wineRefs\.length && winePending\) \{\s*wineRefsRef\.current = \[winePending\];\s*setWineRefs\(\[winePending\]\);\s*return;/.test(rsr), true);
  check("unchecked re-runs still write the bottle's lines (hidden)", /favorite: refPayload\(wineRefsRef\.current\[0\] \?\? winePendingRef\.current,/.test(rsr), true);
  check("lines and ring follow the checked reference only", /const reference = anchorIsWine \? wineRefs\[0\] \?\? null : null;/.test(rsr), true);
  check("the five against the bottle count as 'before'", /const fromBottle = prev\.length === 1 && !!winePendingRef\.current && sameRef\(prev\[0\], winePendingRef\.current\);/.test(rsr), true);

  check("startCompareOff clears the stored references", /const startCompareOff = \(\) => \{[^]*?clearRefs\(\);/.test(page), true);
  check("a new search (chips, voice, typed) starts off; a re-run keeps them", page.includes("if (!(opts?.rerun || (steerOpts && !voice))) startCompareOff();"), true);
  check("a snap starts off", /clearMlt\(\); \/\/ S31 — a snap starts a new set\s*startCompareOff\(\);/.test(page), true);
  check("More like this from a list starts off", /const snapId = \+\+snapIdRef\.current;\s*startCompareOff\(\);\s*const draft = draftOf\("mlt"/.test(page), true);
  check("the sheet keeps its lists (references are never deleted from them)", /clearRefs/.test(read("src/components/CompareSheet.tsx")), false);
  check("Recent keeps the references a set was shown with", page.includes("compareRefs: compareCategoryOf(cat) ? refsFor(cat) : [],"), true);
  check("reopening puts them back, or strips stale lines", /if \(cc && shownRefs\.length\) setRefs\(cc, shownRefs\);\s*else clearRefs\(\);\s*const reks = shownRefs\.length \? r\.reks : stripCompareLines\(r\.reks\);/.test(page), true);

  /* ---------------- 4. snap-lane opens land in Recent ---------------- */
  out("\n4. Opening a snap-lane card lands it in Recent");
  check("noteOpened writes Recent", /const noteOpened = [^]*?noteRecent\(\{/.test(rsr), true);
  check("the anchor's Show details", /if \(!opening\) return;\s*noteOpened\(\{ name: result\.detected_item\.name/.test(rsr), true);
  check("a frontier card's Show details", rsr.includes("if (openRek !== rek.name) noteOpened(rek);"), true);
  check("a trail card's Show details", rsr.includes("if (openRek !== entry.rek.name) noteOpened(entry.rek);"), true);
  check("nothing is sent (Recent is device-only)", /noteOpened[^]*?fetch\(/.test(rsr.slice(rsr.indexOf("const noteOpened"), rsr.indexOf("const toggleAnchorDetails"))), false);

  out(`\n${pass} passed, ${fail} failed`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
