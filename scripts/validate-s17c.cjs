#!/usr/bin/env node
/* S17c — the Saved page (docs/s17-mood-first-plan.md): the list rules
 * (newest per title, spellings merged, watched moves tabs, a later Not for
 * me is a reversal), the read route against a stubbed database, the change
 * signal, the wiring, and the wording. No network.
 * Run: node scripts/validate-s17c.cjs */

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
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
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
  const L = load("src/lib/savedLists.ts");
  const t = (min) => new Date(Date.UTC(2026, 9, 24, 12, 0) - min * 60000).toISOString();
  const row = (category, title, action, min, year = null) => ({ category, title, action, created_at: t(min), year });

  say("\n1. Categories: every spelling lands under the bar's label; others are left out");
  check("movie / Movies / movies", ["movie", "Movies", "movies"].map(L.savedCategoryFor), ["Movies", "Movies", "Movies"]);
  check("tv / TV Shows", ["tv", "TV Shows"].map(L.savedCategoryFor), ["TV Shows", "TV Shows"]);
  check("book / Books / wine / Wine", ["book", "Books", "wine", "Wine"].map(L.savedCategoryFor), ["Books", "Books", "Wine", "Wine"]);
  check("health, food, junk → none", ["health", "food", "", null, 3].map(L.savedCategoryFor), [null, null, null, null, null]);

  say("\n2. The lists (rows newest first, as the route reads them)");
  const rows = [
    row("Movies", "Knives Out", "save", 1, 2019),
    row("movie", "Knives Out", "save", 50),
    row("Movies", "Heat", "save", 5),
    row("Movies", "Heat", "watched", 2), // saved, then watched → Watched tab only
    row("TV Shows", "Severance", "dislike", 3), // Not for me AFTER the save → a reversal
    row("TV Shows", "Severance", "save", 10),
    row("Books", "Piranesi", "dislike", 30), // Not for me BEFORE the save → still saved
    row("Books", "Piranesi", "save", 20),
    row("Wine", "Caymus", "save", 40),
    row("health", "Advil", "save", 4), // never a Saved-page item
    row("Movies", "Arrival", "like", 6), // a like isn't a save
    row("Movies", "Arrival", "watched", 7),
    row("movies", "Arrival", "watched", 8),
  ];
  const { saved, watched } = L.buildSavedLists(rows);
  check("saved: newest first, one per title", saved.map((s) => `${s.category}:${s.title}`), ["Movies:Knives Out", "Books:Piranesi", "Wine:Caymus"]);
  check("both spellings carried (a remove clears both)", saved[0].rawCategories, ["Movies", "movie"]);
  check("year from whichever row has it", saved[0].year, 2019);
  check("watched: newest per title", watched.map((s) => s.title), ["Heat", "Arrival"]);
  check("watched spellings merged", watched[1].rawCategories, ["Movies", "movies"]);
  check("empty → empty", L.buildSavedLists([]), { saved: [], watched: [], savedWatched: [] });
  // S18b — the save behind a watched title is still a save (cards light it).
  check("saved-then-watched: off the Saved tab, kept in savedWatched", L.buildSavedLists(rows).savedWatched.map((s) => s.title), ["Heat"]);

  say("\n3. The route: this client's rows only; failures are named, never a crash");
  let lastQuery = null;
  let answer = { data: rows, error: null };
  const fakeDb = {
    from(table) {
      const q = { table, filters: [] };
      lastQuery = q;
      const chain = {
        select(cols) { q.cols = cols; return chain; },
        eq(c, v) { q.filters.push(["eq", c, v]); return chain; },
        in(c, v) { q.filters.push(["in", c, v]); return chain; },
        order() { return chain; },
        limit(n) { q.limit = n; return Promise.resolve(answer); },
      };
      return chain;
    },
  };
  process.env.SUPABASE_URL = "x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "y";
  const route = load("app/api/saved/route.ts", {
    "../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../src/lib/supabaseServer": { supabaseServer: fakeDb },
  });
  const post = async (body) => {
    const r = await route.POST(new Request("http://x/api/saved", { method: "POST", body: JSON.stringify(body) }));
    return [r.status, await r.json()];
  };
  const [st, data] = await post({ clientId: "anon_test_client_1234" });
  check("ok with both lists", [st, data.ok, data.saved.length, data.watched.length], [200, true, 3, 2]);
  check("read is scoped to the client and to save/watched/dislike", lastQuery.filters, [["eq", "client_id", "anon_test_client_1234"], ["in", "action", ["save", "watched", "dislike"]]]);
  check("bounded read", lastQuery.limit, 1000);
  check("no client id → 400", (await post({}))[0], 400);
  answer = { data: null, error: { code: "XX000" } };
  check("db error → named, not thrown", (await post({ clientId: "anon_test_client_1234" }))[1], { ok: false, reason: "db_error" });

  say("\n4. The change signal: every write that moves the count tells the Saved button");
  const up = read("src/lib/userPrefs.ts");
  check("save / Not for me writes notify", /if \(params\.action === 'save' \|\| params\.action === 'dislike'\) notifySavedChange\(\);/.test(up), true);
  check("watched, un-watch and undo notify on success", (up.match(/notifySavedChange\(\);\s*return \{ ok: true \};/g) || []).length, 3);

  say("\n5. Wiring");
  const sp = read("src/components/SavedPage.tsx");
  const layout = read("app/layout.tsx");
  const page = read("app/page.tsx");
  // S24b — the four buttons and the ⋯ menu (Share lives in it). S26a:
  // row 1 is the wordmark and ⋯, row 2 the four tiles.
  // S28c: ⋯ alone on row 1, the wordmark centered on row 2, then the tiles.
  check("top bar: ⋯ row, wordmark row, then the Saved tiles", layout.indexOf("<MoreMenu ") > 0 && layout.indexOf("<MoreMenu ") < layout.indexOf("<HomeWordmark />") && layout.indexOf("<HomeWordmark />") < layout.indexOf("<SavedPage />"), true);
  check("tabs Favorites · Watched · Recent · Saved", /const TABS: Tab\[\] = \["Favorites", "Watched", "Recent", "Saved"\];/.test(sp), true);
  check("groups Movies · TV Shows · Books · Wine", /const GROUPS: SavedCategory\[\] = \["Movies", "TV Shows", "Books", "Wine"\];/.test(sp), true);
  check("remove = every save row, every spelling", /item\.rawCategories\.map\(\(category\) => undoSignal\(\{ category, title: item\.title, action: "save", remove: true \}\)\)/.test(sp), true);
  check("un-watch through S16's route", /undoWatched\(\{ category, title: item\.title \}\)/.test(sp), true);
  check("un-star: go-tos by the S12 star, wine by its favorite", /<GoToStar item=/.test(sp) && /setWineFavorite\(null\)/.test(sp), true);
  // S21 — the event carries `counted`: a title tap isn't, "+ More like this" is.
  check("tap opens the card on the page (not counted as a go-to more)", /onOpenSavedItem\(\(t, counted\) => moreFromGoToRef\.current\(t, \{ counted \}\)\)/.test(page) && /const openItem = \(t: GoToTarget, counted = false\)/.test(sp), true);
  // S24b — the posters switch moved to the ⋯ menu.
  check("posters: Show posters / Hide posters in the ⋯ menu", /setPostersHidden\(postersOn\)/.test(read("src/components/MoreMenu.tsx")) && !/setPostersHidden/.test(sp), true);
  check("a failed write puts the row back (re-read)", (sp.match(/void reload\(\);\s*\}/g) || []).length >= 2, true);
  check("route reads through the guarded dynamic import", /import\("\.\.\/\.\.\/\.\.\/src\/lib\/supabaseServer"\)/.test(read("app/api/saved/route.ts")) && !/^import .*supabaseServer/m.test(read("app/api/saved/route.ts")), true);

  say("\n6. Wording: only approved or existing words");
  const code = sp.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");
  const visible = [
    ...(code.match(/>\s*([A-Z][^<>{}]*?)\s*</g) || []).map((m) => m.replace(/^>\s*|\s*<$/g, "")),
    ...(code.match(/aria-label="([^"]+)"/g) || []).map((m) => m.slice(12, -1)),
  ].filter(Boolean);
  // S24a — "Recent" and "Clear recent" (Brad's approved wording, 2026-10-25).
  const allowed = new Set(["Saved", "Watched", "Favorites", "Show posters", "Close", "Your go-to (tap to unstar)", "Recent", "Clear recent"]);
  // S18a — the three empty states, approved by Brad 2026-10-24.
  check("empty states: the approved wording, exactly", [
    sp.includes('Saved: "Nothing saved yet. Tap the bookmark on any card to keep it here."'),
    sp.includes('Watched: "Nothing marked watched yet."'),
    sp.includes('Favorites: "No favorites yet. Tap ☆ on a card you love."'),
  ], [true, true, true]);
  check("empty text waits for a real answer (not shown while loading or after a failed read)", /tabCount\[tab\] === 0 && \(tab === "Favorites" \|\| loaded\) && EMPTY\[tab\]/.test(sp), true);
  check("every visible string / label is approved or existing", [...new Set(visible)].filter((w) => !allowed.has(w)), []);

  say(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stdout.write("CRASH " + (e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
