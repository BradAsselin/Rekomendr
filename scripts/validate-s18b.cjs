#!/usr/bin/env node
/* S18b — the D2 card in the snap lane (Movies/TV anchors: snapped, typed,
 * or opened from the Saved page), with the right saved/starred/watched
 * marks. /api/facts by title (stubbed TMDb), the marks hook, and the
 * lane's wiring. No network.
 * Run: node scripts/validate-s18b.cjs */

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
  process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}\n`);
}
const say = (s) => process.stdout.write(s + "\n");
function load(rel, extra = {}) {
  const out = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React } }).outputText;
  const m = { exports: {} };
  const req = (id) => {
    if (extra[id]) return extra[id];
    if (id.startsWith(".")) {
      const p = path.join(path.dirname(rel), id);
      return load(fs.existsSync(path.join(root, p + ".ts")) ? p + ".ts" : p + ".tsx", extra);
    }
    return require(id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  return m.exports;
}
for (const level of ["log", "warn", "info", "error"]) console[level] = () => {};

(async () => {
  say("\n1. /api/facts by title: matched by the title check, never a near miss");
  const asked = [];
  const route = load("app/api/facts/route.ts", {
    "../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../src/lib/tmdbMedia": {
      mediaConfigured: () => true,
      loadMediaBundle: async (kind, id) => ({ commitment: id === 949 ? "2h 50m" : "3 seasons · 30 episodes", posterPath: `/p${id}.jpg`, where: "on Netflix" }),
      whereOf: (b) => b.where,
    },
    "../../../src/lib/tmdbVerify": {
      verifyTitles: async (items) => {
        asked.push(...items);
        return {
          enabled: true,
          verdicts: items.map((i) =>
            i.title === "Heat" ? { title: i.title, resolved: true, tmdbId: 949 } : i.title === "Severance" ? { title: i.title, resolved: true, tmdbId: 95396 } : { title: i.title, resolved: false, reason: "no_match" }
          ),
        };
      },
    },
  });
  const post = async (body) => {
    const r = await route.POST(new Request("http://x/api/facts", { method: "POST", body: JSON.stringify(body) }));
    return [r.status, await r.json()];
  };
  const [st, data] = await post({
    items: [
      { kind: "movie", id: 603 },
      { kind: "movie", title: "Heat", year: 1995 },
      { kind: "tv", title: " Severance " },
      { kind: "movie", title: "Charade in the Fog" },
    ],
  });
  check("ok", [st, data.ok], [200, true]);
  check("id item answered by id (no title)", data.facts.find((f) => f.id === 603), { kind: "movie", id: 603, facts: ["3 seasons · 30 episodes", "on Netflix"], posterPath: "/p603.jpg" });
  check("title item matched → its id, title echoed", data.facts.find((f) => f.title === "Heat"), { kind: "movie", id: 949, title: "Heat", facts: ["2h 50m", "on Netflix"], posterPath: "/p949.jpg" });
  check("title trimmed", !!data.facts.find((f) => f.title === "Severance"), true);
  check("unmatched title is absent (no guess)", data.facts.some((f) => f.title === "Charade in the Fog"), false);
  check("only the titled items went to the title check, with kind + year", asked.map((a) => [a.title, a.kind, a.year ?? null]), [["Heat", "movie", 1995], ["Severance", "tv", null], ["Charade in the Fog", "movie", null]]);
  check("junk → 400", (await post({ items: [{ kind: "movie", title: "   " }, { kind: "book", title: "Dune" }] }))[0], 400);

  say("\n2. The marks: server-known saves and watches open filled");
  const um = read("src/lib/useServerMarks.ts");
  check("reads /api/saved, re-reads on every change", /fetchSavedLists\(\)/.test(um) && /onSavedChange\(/.test(um), true);
  check("a failed read keeps the last answer", /if \(alive && lists\) setMarks/.test(um), true);
  const wm = read("src/lib/useWatchedMarks.ts");
  check("watched hook: seed marks without a write", /const seed = useCallback\(\(titles: string\[\]\)/.test(wm) && /writes\.current\.set\(k, Promise\.resolve\(true\)\)/.test(wm), true);

  say("\n3. The snap lane");
  const rs = read("src/components/RekSnapResults.tsx");
  check("D2 only for Movies/TV (never health)", /const isD2Category = \(raw: unknown\) => \{\s*const c = goToCategoryFor\(raw\);\s*return c === "movies" \|\| c === "tv";/.test(rs) && /!isHealthMedical\(/.test(rs.slice(rs.indexOf("const d2 ="), rs.indexOf("const d2 =") + 300)), true);
  check("all three card sites use the D2 layout", (rs.match(/layout=\{d2 \? "d2" : undefined\}/g) || []).length, 3);
  check("the anchor is never dismissed (no ×)", /noDismiss=\{d2\}/.test(rs), true);
  check("saves write user_likes (the Saved page) beside the snap signal", /writeLike\(name, category, year, "save"\)/.test(rs) && /recordLike\(\{ category: cat, title: name/.test(rs), true);
  check("un-save removes every save row (incl. an earlier visit's)", /unwriteLike\(name, category, "save", true\)/.test(rs), true);
  check("Not for me writes a dislike, Undo deletes it and restores the card", /writeLike\(rek\.name, rek\.category, rek\.year, "dislike"\)/.test(rs) && /unwriteLike\(rek\.name, rek\.category, "dislike"\)/.test(rs) && /restoreRek\(rek, mode, index\)/.test(rs), true);
  check("swipe left = Not for me, right = Save for later; no old swipe", /onSwipeLeft=\{d2 \? \(\) => d2NotForMe\(rek\) : undefined\}/.test(rs) && /onSwipeRight=\{d2 \? \(\) => d2Save\(rek\.name, rek\.category, rek\.year\) : undefined\}/.test(rs) && /swipeable=\{!d2\}/.test(rs), true);
  check("Watched on a frontier card fades out + backfills, Undo restores", /leaveFrontier\(rek, mode\)/.test(rs) && /restore = \(\) => restoreRek\(rek, mode, index\)/.test(rs), true);
  check("server marks seed saved + watched, never over a tap this snap", /filter\(\(n\) => !touchedRef\.current\.has\(markKey\(n\)\)\)/.test(rs) && /seedWatched\(names\.filter/.test(rs), true);
  check("only Movies/TV rows seed (a same-named book doesn't)", /x\.category === "Movies" \|\| x\.category === "TV Shows"/.test(rs), true);
  check("facts by title, by id for a TMDb anchor; late answers for an old anchor drop", /\{ kind: forResult\.media\.kind, id: forResult\.media\.id \}/.test(rs) && /if \(resultRef\.current !== forResult\) return;\s*const next/.test(rs), true);
  check("anchor's facts line skips where (its WatchLine has the links)", /isAnchor && result\.media\?\.watch \? all\.filter\(\(f\) => !\/\^on \/\.test\(f\)\)/.test(rs), true);
  check("one Undo toast on D2", /d2 \? \(\s*<UndoToast/.test(rs), true);
  check("Share on the anchor saves for real on D2", /if \(d2\) d2Save\(forResult\.detected_item\.name/.test(rs), true);
  check("reduced motion", /motion-reduce:transition-none/.test(rs), true);

  say("\n4. The card: anchor frame + no × on D2");
  const card = read("src/components/RekCard.tsx");
  check("D2 accent frame", /accent\s*\?\s*"relative rounded-2xl p-4 bg-white border-\[3px\] border-\[#1E3A8A\] shadow-lg"/.test(card), true);
  check("noDismiss hides ×", /\{!noDismiss && \(/.test(card), true);

  say("\n5. Wording: nothing new");
  const added = require("child_process")
    .execSync("git diff main -- src/components/RekSnapResults.tsx src/components/RekCard.tsx src/lib/useServerMarks.ts", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++") && !/^\+\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
  const jsxText = (added.match(/>\s*([A-Za-z][^<>{}]*?)\s*</g) || []).map((m) => m.replace(/^>\s*|\s*<$/g, "")).filter(Boolean);
  check("no new visible text in the diff", jsxText, []);
  check("toast labels are the approved ones", (added.match(/showToast\("([^"]+)"/g) || []).map((m) => m.slice(11, -1)).sort(), ["Not for me", "Not for me", "Posters hidden", "Saved", "Watched"]);

  say(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stdout.write("CRASH " + (e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
