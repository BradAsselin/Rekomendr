#!/usr/bin/env node
/* S19c — the snap lane's first five never show a title this person
 * watched or disliked (docs/s19-fast-moods-plan.md, Part C).
 * The drop-set read waits (hang guard) instead of racing to empty; the
 * TMDb snap path, the typed-title reks and the vision path's media lists
 * all use it. The database is a stub with a controllable delay.
 * Run: node scripts/validate-s19c.cjs */

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
function load(rel, stubs) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
  }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, (id) => (stubs[id] !== undefined ? stubs[id] : require(id)));
  return m.exports;
}
const warns = [];
console.warn = (...a) => warns.push(String(a[0]));
console.info = () => {};
console.error = () => {};

// A Supabase stub: every query chain resolves after `delay` ms.
let delay = 50;
let fail = false;
const rows = {
  user_likes: [
    { title: "Glass Onion: A Knives Out Mystery", action: "watched", created_at: "2026-10-24" },
    { title: "Clue", action: "dislike", created_at: "2026-10-23" },
    { title: "Murder Mystery", action: "save", created_at: "2026-10-22" },
  ],
  reksnap_signals: [],
};
const chain = (table) => {
  const p = {
    then: (res, rej) =>
      new Promise((r, j) => setTimeout(() => (fail ? j(new Error("db down")) : r({ data: rows[table], error: null })), delay)).then(res, rej),
  };
  for (const k of ["select", "eq", "ilike", "in", "gte", "order", "limit"]) p[k] = () => p;
  return p;
};
process.env.SUPABASE_URL = "https://stub";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
const R = load("src/lib/mediaReks.ts", {
  "./supabaseServer": { supabaseServer: { from: chain } },
  "./llm": { llmCall: async () => ({ text: "{}" }), jsonText: (s) => s },
  "./tmdbVerify": { normalizeTitle: (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), logFakeTitles: () => {} },
  "./tmdbMedia": { mediaCategoryFor: (k) => (k === "movie" ? "movies" : "tv"), resolveExactTitle: async () => null },
  // S31 — the shared standalone-line check (no imports of its own).
  "./standaloneLine": load("src/lib/standaloneLine.ts", {}),
});

(async () => {
  console.log("\n1. The drop-set read waits; the old race gave up");
  delay = 50;
  let t = await R.guardTaste("anon_x", "movie", "snap");
  check("a normal read: watched + disliked", [t.watched, t.disliked], [["Glass Onion: A Knives Out Mystery"], ["Clue"]]);
  delay = 600;
  const raced = await R.raceTaste("anon_x", "movie");
  check("raceTaste on a 600 ms read: EMPTY (the S18 leak)", raced.watched, []);
  t = await R.guardTaste("anon_x", "movie", "snap");
  check("guardTaste on a 600 ms read: still the watched title", t.watched, ["Glass Onion: A Knives Out Mystery"]);
  check("no warning when the read answered", warns.filter((w) => w.includes("[snap-watched]")).length, 0);
  delay = 3000;
  const t0 = Date.now();
  t = await R.guardTaste("anon_x", "movie", "snap");
  const waited = Date.now() - t0;
  check("a hung read ships empty at the guard (≈2.5 s)", [t.watched, waited >= 2400 && waited < 2900], [[], true]);
  check("…named in the log", warns.some((w) => w.includes("[snap-watched] taste read unavailable — watched/disliked not excluded")), true);
  delay = 10;
  fail = true;
  warns.length = 0;
  t = await R.guardTaste("anon_x", "movie", "snap");
  check("a failed read ships empty, named", [t.watched, warns.some((w) => w.includes("[snap-watched] taste read failed"))], [[], true]);
  fail = false;
  check("no client → no read", (await R.guardTaste(null, "movie", "snap")).watched, []);
  // The guard's late timer never fires after an answer (no stray warning).
  warns.length = 0;
  delay = 20;
  await R.guardTaste("anon_x", "movie", "snap");
  await new Promise((r) => setTimeout(r, 2700));
  check("no stray guard warning after a read answered", warns.filter((w) => w.includes("[snap-watched]")).length, 0);

  console.log("\n2. Every first-five site uses it");
  const snap = read("app/api/reksnap/route.ts");
  check("the TMDb snap path starts it early, beside the lookups", /const tasteEarly = kind === "any" \? null : guardTaste\(clientId, kind, "snap"\);\s*const hit = await resolveSnappedTitle\(name, kind\);/.test(snap), true);
  check("…and never falls back to the race", /raceTaste/.test(snap), false);
  check("the chooser drops taste.watched + disliked (unchanged guarantee)", /\[anchor\.title, \.\.\.taste\.liked, \.\.\.taste\.disliked, \.\.\.taste\.watched\]/.test(read("src/lib/mediaReks.ts")), true);
  const anchor = read("app/api/anchor/route.ts");
  check("typed-title reks use it", /guardTaste\(clientId, kind, "typed"\)/.test(anchor) && !/raceTaste/.test(anchor), true);
  check("the vision path's media lists drop watched + disliked at the response site", /const tasteDrop =[\s\S]*?guardTaste\(clientId, anchorKind, "vision"\)/.test(snap) && /\[\.\.\.tasteDrop\.watched, \.\.\.tasteDrop\.disliked\]\.map\(normalizeTitle\)/.test(snap), true);
  check("…all three lists, media reks only, re-ranked", /similar: anchorIsHealthMedical \? \[\] : reRank\(keep\(similar\)\),\s*uses: anchorIsHealthMedical \? \[\] : reRank\(keep\(uses\)\),\s*alternatives: anchorIsHealthMedical \? \[\] : reRank\(keep\(alternatives\)\),/.test(snap) && /!!mediaKindFor\(r\.category\) && dropSet\.has\(normalizeTitle\(r\.name\)\)/.test(snap), true);
  check("…health anchors never read taste", /!anchorIsHealthMedical && clientId && \(anchorKind === "movie" \|\| anchorKind === "tv"\)/.test(snap), true);
  check("the screen snap is untouched (shows what was on the screen)", /guardTaste/.test(read("app/api/screen/route.ts")), false);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
