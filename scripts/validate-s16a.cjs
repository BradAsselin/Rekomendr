#!/usr/bin/env node
/* S16a — "Watched" on every Movies/TV/Books card (docs/s16-watched-search-plan.md, Part A).
 * The mark/undo hook (a tiny fake React drives it), the route's undo branch
 * against a stubbed database, the category gate, the card wiring in both
 * lanes, and the approved wording. No network.
 * Run: node scripts/validate-s16a.cjs */

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

// ---- a tiny React: enough hooks to drive useWatchedMarks ------------------
let slots = [];
let cursor = 0;
let rerender = () => {};
const FakeReact = {
  useState(init) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
    const set = (v) => {
      slots[i] = typeof v === "function" ? v(slots[i]) : v;
      rerender();
    };
    return [slots[i], set];
  },
  useRef(init) {
    const i = cursor++;
    if (!(i in slots)) slots[i] = { current: init };
    return slots[i];
  },
  useCallback(fn) {
    cursor++;
    return fn;
  },
  useEffect(fn) {
    const i = cursor++;
    if (!(i in slots)) {
      slots[i] = true;
      fn();
    }
  },
};

// ---- stubbed fetch: the watched route's answers ---------------------------
const posts = [];
let nextAnswer = () => ({ ok: true });
let gate = null; // a promise the mark write waits on (to test the undo race)
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  posts.push({ url, body });
  if (!body.undo && gate) await gate;
  return new Response(JSON.stringify(nextAnswer(body)), { status: 200 });
};
globalThis.localStorage = { getItem: () => "anon_test_client_1234", setItem() {} };
globalThis.window = {};

const cache = {};
function load(rel, extra = {}) {
  if (cache[rel]) return cache[rel];
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
  cache[rel] = m.exports;
  const req = (id) => {
    if (id === "react") return { __esModule: true, default: FakeReact, ...FakeReact };
    if (extra[id]) return extra[id];
    if (id.startsWith(".")) {
      const p = path.join(path.dirname(rel), id);
      return load(fs.existsSync(path.join(root, p + ".ts")) ? p + ".ts" : p + ".tsx", extra);
    }
    return require(id);
  };
  new Function("module", "exports", "require", out)(m, m.exports, req);
  cache[rel] = m.exports;
  return m.exports;
}
for (const level of ["warn", "info", "error"]) console[level] = () => {};
const tick = () => new Promise((r) => setTimeout(r, 0));

(async () => {
  const userPrefs = load("src/lib/userPrefs.ts", {
    "./supabaseClient": { supabase: null },
    "./clientId": { getAnonymousClientId: () => "anon_test_client_1234" },
  });
  const W = load("src/lib/useWatchedMarks.ts", { "./userPrefs": userPrefs });

  console.log("\n1. The gate: Movies, TV and Books only");
  check("Movies → Movies", W.watchedCategory("Movies"), "Movies");
  check("movie (snap) → Movies", W.watchedCategory("movie"), "Movies");
  check("tv → TV Shows", W.watchedCategory("tv"), "TV Shows");
  check("TV Shows → TV Shows", W.watchedCategory("TV Shows"), "TV Shows");
  check("book → Books", W.watchedCategory("book"), "Books");
  check("Wine → none", W.watchedCategory("Wine"), null);
  check("health → none", W.watchedCategory("health"), null);
  check("food → none", W.watchedCategory("food"), null);
  check("toast lasts ~4 s", W.TOAST_MS, 4000);

  // Drive the hook: render = call it, keep the latest return.
  const changes = [];
  let api;
  const render = () => {
    cursor = 0;
    api = W.useWatchedMarks((item, on) => changes.push([item.title, on]));
  };
  rerender = render;
  slots = [];
  render();

  console.log("\n2. Mark → filled + toast + one write");
  const item = { title: "Knives Out", year: 2019, category: "Movies" };
  api.toggle(item);
  check("marked", api.isWatched("knives out"), true);
  check("toast shows the item", api.toast && api.toast.title, "Knives Out");
  check("page told: watched", changes.at(-1), ["Knives Out", true]);
  await tick();
  await tick();
  check("one write to the watched route", posts.length, 1);
  check("write carries the reader's category + year", [posts[0].url, posts[0].body.category, posts[0].body.year, !!posts[0].body.undo], ["/api/signals/watched", "Movies", 2019, false]);

  console.log("\n3. Undo → unmarked, toast gone, the row deleted");
  api.undo(item);
  check("unmarked", api.isWatched("Knives Out"), false);
  check("toast gone", api.toast, null);
  check("page told: not watched", changes.at(-1), ["Knives Out", false]);
  await tick();
  await tick();
  await tick();
  check("undo posted after the write", posts.length, 2);
  check("undo body", [posts[1].body.undo, posts[1].body.title, posts[1].body.category], [true, "Knives Out", "Movies"]);

  console.log("\n4. Undo while the write is in flight waits for it");
  posts.length = 0;
  let open;
  gate = new Promise((r) => (open = r));
  const lioness = { title: "Lioness", year: 2023, category: "TV Shows" };
  api.toggle(lioness);
  await tick();
  api.toggle(lioness); // second tap = undo
  await tick();
  await tick();
  check("no delete before the insert lands", posts.map((p) => !!p.body.undo), [false]);
  open();
  gate = null;
  for (let i = 0; i < 6; i++) await tick();
  check("then the delete follows", posts.map((p) => !!p.body.undo), [false, true]);
  check("still unmarked", api.isWatched("Lioness"), false);

  console.log("\n5. A failed write reverts the mark (never a silent success)");
  posts.length = 0;
  nextAnswer = () => ({ ok: false, reason: "migration_pending" });
  const dune = { title: "Dune", year: 1965, category: "Books" };
  api.toggle(dune);
  check("marked at once", api.isWatched("Dune"), true);
  for (let i = 0; i < 6; i++) await tick();
  check("reverted after the refusal", api.isWatched("Dune"), false);
  check("page told: not watched", changes.at(-1), ["Dune", false]);
  nextAnswer = () => ({ ok: true });

  console.log("\n6. A failed write followed by undo posts no delete");
  posts.length = 0;
  nextAnswer = (b) => (b.undo ? { ok: true } : { ok: false, reason: "insert_error" });
  const heat = { title: "Heat", year: 1995, category: "Movies" };
  api.toggle(heat);
  api.undo(heat);
  for (let i = 0; i < 6; i++) await tick();
  check("only the insert went out", posts.map((p) => !!p.body.undo), [false]);
  nextAnswer = () => ({ ok: true });

  console.log("\n7. Wine is never marked");
  posts.length = 0;
  api.toggle({ title: "Caymus", category: "Wine" });
  await tick();
  check("no write, no mark", [posts.length, api.isWatched("Caymus")], [0, false]);

  console.log("\n8. The route: undo deletes only this client's watched row for that title");
  const calls = [];
  const fakeDb = {
    from(table) {
      const q = { table, filters: [], op: null };
      calls.push(q);
      const chain = {
        insert(row) { q.op = ["insert", row]; return Promise.resolve({ error: null }); },
        delete() { q.op = ["delete"]; return chain; },
        eq(col, v) { q.filters.push([col, v]); return chain; },
        select() { return Promise.resolve({ data: [{ id: 1 }], error: null }); },
      };
      return chain;
    },
  };
  process.env.SUPABASE_URL = "x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "y";
  const route = load("app/api/signals/watched/route.ts", {
    "../../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../../src/lib/supabaseServer": { supabaseServer: fakeDb },
  });
  const post = (body) => route.POST(new Request("http://x/api/signals/watched", { method: "POST", body: JSON.stringify(body) }));
  let res = await post({ clientId: "anon_test_client_1234", category: "Movies", title: "Knives Out", undo: true });
  let data = await res.json();
  check("undo answers ok + removed", data, { ok: true, removed: 1 });
  check("delete on user_likes", [calls[0].table, calls[0].op], ["user_likes", ["delete"]]);
  check("filters: client, category, title, action=watched", calls[0].filters, [["client_id", "anon_test_client_1234"], ["category", "Movies"], ["title", "Knives Out"], ["action", "watched"]]);
  calls.length = 0;
  res = await post({ clientId: "anon_test_client_1234", category: "Movies", title: "Knives Out" });
  data = await res.json();
  check("a plain post still inserts 'watched'", [data.ok, calls[0].op[0], calls[0].op[1].action], [true, "insert", "watched"]);
  res = await post({ category: "Movies", title: "Knives Out", undo: true });
  check("undo without a client id is refused", res.status, 400);

  console.log("\n9. Wiring: both lanes, anchor + reks, the old expanded button gone");
  const rv = read("src/components/ResultsV4.tsx");
  const rs = read("src/components/RekSnapResults.tsx");
  check("search lane: watchedSlot on frontier + trail", (rv.match(/watchedSlot=\{watchedFor\(rek(, true)?\)\}/g) || []).length, 2); // S17: the frontier passes fade-out
  check("search lane: no expanded 'Watched it' left", /detailAction=\{watchedVerb/.test(rv), false);
  // S18b — each site picks the D2 Watched (the lane's toast) or S16's.
  check("snap lane: anchor + trail + frontier", (rs.match(/: watchedFor\(/g) || []).length, 3);
  check("snap lane: health anchors get none", /anchorIsHealthMedical \? null : watchedCategory/.test(rs), true);
  check("both lanes render the toast", [/<WatchedToast/.test(rv), /<WatchedToast/.test(rs)], [true, true]);
  check("page keeps the session list from both lanes", (read("app/page.tsx").match(/onWatchedChange=\{handleWatchedChange\}/g) || []).length, 2);
  const card = read("src/components/RekCard.tsx");
  check("card: Watched shares Share's row (leading slot)", /cloneElement\(shareSlot/.test(card) && /leading\?: React.ReactNode/.test(read("src/components/ShareRow.tsx")), true);
  check("card: the dim wraps the content, not the bottom row", /dimmed \? "opacity-70/.test(card), true);

  console.log("\n10. Wording: only the approved words are new");
  // S16a's own range once merged (#59, a7665a2), so later sessions don't
  // re-aim it; before the merge, the merge base plus uncommitted new
  // files. Comment lines are dropped before matching.
  const merged = (() => {
    try {
      execSync("git merge-base --is-ancestor a7665a2 HEAD", { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  const range = merged ? "04f351c a7665a2" : execSync("git merge-base main HEAD", { cwd: root, encoding: "utf8" }).trim();
  const diff = execSync(`git diff ${range} -- src app`, { cwd: root, encoding: "utf8" });
  const untracked = (merged ? "" : execSync("git ls-files --others --exclude-standard -- src app", { cwd: root, encoding: "utf8" }))
    .split("\n")
    .filter(Boolean)
    .map((f) => read(f));
  const added = [
    ...diff.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)),
    ...untracked.flatMap((t) => t.split("\n")),
  ]
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .join("\n");
  const jsxText = (added.match(/>([^<>{}]*[A-Za-z][^<>{}]*)</g) || [])
    .map((m) => m.slice(1, -1).trim())
    .filter((t) => !/[();=?]/.test(t)) // TS generics, not JSX text
    .filter(Boolean);
  check("new JSX text = Watched / Watched · / Undo", Array.from(new Set(jsxText)).sort(), ["Undo", "Watched", "Watched ·"]);
  const control = read("src/components/WatchedControl.tsx");
  check("aria-label is the approved word", /aria-label="Watched"/.test(control), true);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
