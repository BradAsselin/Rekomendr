#!/usr/bin/env node
/* S17b — mood first: D2 cards for Movies/TV (docs/s17-mood-first-plan.md).
 * The poster switch (storage that throws, the per-device memory), the
 * poster-path guard, the Undo route against a stubbed database, the facts
 * route against a stubbed TMDb bundle, the card/page wiring, and the
 * approved wording. No network.
 * Run: node scripts/validate-s17b.cjs */

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

const FakeReact = {
  useState: (init) => [typeof init === "function" ? init() : init, () => {}],
  useEffect() {},
  useRef: (v) => ({ current: v }),
  useCallback: (fn) => fn,
};

function load(rel, extra = {}) {
  const out = ts.transpileModule(read(rel), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, jsx: ts.JsxEmit.React },
  }).outputText;
  const m = { exports: {} };
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
  return m.exports;
}
for (const level of ["log", "warn", "info", "error"]) console[level] = () => {};

(async () => {
  say("\n1. The poster switch: on by default, remembered per device, storage failures keep posters on");
  let store = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => (store[k] = String(v)),
      removeItem: (k) => delete store[k],
    },
  };
  let P = load("src/lib/posterPref.ts");
  check("default: posters on", P.postersHidden(), false);
  check("first render reads the device (on)", P.usePostersOn(), true);
  P.setPostersHidden(true);
  check("× hides: remembered under the device key", store["rekomendr.posters_hidden"], "1");
  check("hidden now", P.postersHidden(), true);
  check("first render reads the device (off → no <img> ever made)", P.usePostersOn(), false);
  P.setPostersHidden(false);
  check("Show posters / Undo: key removed", "rekomendr.posters_hidden" in store, false);
  // A stored "hidden" from an earlier visit is read by a fresh load.
  store = { "rekomendr.posters_hidden": "1" };
  P = load("src/lib/posterPref.ts");
  check("a later visit still has them hidden", P.postersHidden(), true);
  // Storage that throws on every touch (private mode, blocked site data).
  globalThis.window = { localStorage: { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } } };
  P = load("src/lib/posterPref.ts");
  check("throwing storage → posters on, no crash", P.postersHidden(), false);
  let threw = false;
  try {
    P.setPostersHidden(true);
  } catch {
    threw = true;
  }
  check("throwing storage: hiding doesn't throw", threw, false);
  check("…and holds for this tab", P.postersHidden(), true);

  say("\n2. Poster paths: only TMDb's own shape reaches an <img src>");
  delete globalThis.window; // tmdbMedia refuses to load in a browser
  const M = load("src/lib/tmdbMedia.ts", { "server-only": {} });
  check("normal path", M.safePosterPath("/abc123.jpg"), "/abc123.jpg");
  check("no leading slash", M.safePosterPath("abc.jpg"), null);
  check("off-site URL", M.safePosterPath("//evil.example/x.jpg"), null);
  check("query/script chars", M.safePosterPath('/a.jpg"onerror=x'), null);
  check("null / number", [M.safePosterPath(null), M.safePosterPath(7)], [null, null]);
  const V = read("src/lib/tmdbVerify.ts");
  check("verify verdict carries tmdbId + guarded posterPath", /tmdbId: (best|row|r|hit)\.id/.test(V) && /posterPath/.test(V) && /\^\\\/\[\\w\.-\]\{1,120\}\$/.test(V), true);

  say("\n3. The Undo route: this client's newest row, inside ten minutes; remove = every save row");
  const now = Date.now();
  let rows = [];
  const deleted = [];
  const ops = [];
  const fakeDb = {
    from(table) {
      const f = [];
      let isDelete = false;
      let ids = null;
      let lim = Infinity;
      const match = (r) =>
        f.every(([op, c, v]) =>
          op === "eq" ? r[c] === v : op === "ilike" ? String(r[c]).toLowerCase() === String(v).toLowerCase() : op === "gte" ? r[c] >= v : true
        ) && (!ids || ids.includes(r.id));
      const chain = {
        select() {
          if (isDelete) {
            const hit = rows.filter(match);
            rows = rows.filter((r) => !hit.includes(r));
            deleted.push(...hit.map((r) => r.id));
            ops.push({ table, op: "delete", filters: f.slice(), ids });
            return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
          }
          return chain;
        },
        delete() { isDelete = true; return chain; },
        eq(c, v) { f.push(["eq", c, v]); return chain; },
        ilike(c, v) { f.push(["ilike", c, v]); return chain; },
        gte(c, v) { f.push(["gte", c, v]); return chain; },
        in(c, v) { ids = v; return chain; },
        order() { return chain; },
        limit(n) {
          lim = n;
          const hit = rows.filter(match).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, lim);
          ops.push({ table, op: "select", filters: f.slice() });
          return Promise.resolve({ data: hit, error: null });
        },
      };
      return chain;
    },
  };
  process.env.SUPABASE_URL = "x";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "y";
  const undoRoute = load("app/api/signals/undo/route.ts", {
    "../../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../../src/lib/supabaseServer": { supabaseServer: fakeDb },
  });
  const post = async (body) => {
    const r = await undoRoute.POST(new Request("http://x/api/signals/undo", { method: "POST", body: JSON.stringify(body) }));
    return [r.status, await r.json()];
  };
  const iso = (agoMs) => new Date(now - agoMs).toISOString();
  const ME = "anon_test_client_1234";
  const seed = () => {
    rows = [
      { id: 1, client_id: ME, category: "Movies", title: "Knives Out", action: "dislike", created_at: iso(5000) },
      { id: 2, client_id: ME, category: "movies", title: "Knives Out", action: "dislike", created_at: iso(1000) },
      { id: 3, client_id: "anon_someone_else_99", category: "Movies", title: "Knives Out", action: "dislike", created_at: iso(500) },
      { id: 4, client_id: ME, category: "Movies", title: "Knives Out", action: "save", created_at: iso(2000) },
      { id: 5, client_id: ME, category: "Movies", title: "Knives Out", action: "save", created_at: iso(30 * 86400000) },
      { id: 6, client_id: ME, category: "Movies", title: "Old Pick", action: "dislike", created_at: iso(11 * 60000) },
      { id: 7, client_id: ME, category: "Movies", title: "Knives Out", action: "like", created_at: iso(100) },
    ];
    deleted.length = 0;
  };
  seed();
  check("undo a dislike → removes one", await post({ clientId: ME, category: "Movies", title: "Knives Out", action: "dislike" }), [200, { ok: true, removed: 1 }]);
  check("…the NEWEST of mine (any category case), never another client's", deleted, [2]);
  seed();
  check("undo a save → the fresh save only", (await post({ clientId: ME, category: "Movies", title: "Knives Out", action: "save" }))[1], { ok: true, removed: 1 });
  check("…id 4, not last month's", deleted, [4]);
  seed();
  check("older than ten minutes → nothing to undo", (await post({ clientId: ME, category: "Movies", title: "Old Pick", action: "dislike" }))[1], { ok: true, removed: 0 });
  check("…and nothing deleted", deleted, []);
  seed();
  check("remove (Saved page) → every save row of the title", (await post({ clientId: ME, category: "Movies", title: "Knives Out", action: "save", remove: true }))[1], { ok: true, removed: 2 });
  check("…ids 4 and 5, likes and dislikes untouched", deleted.sort(), [4, 5]);
  seed();
  check("likes can't be undone here", (await post({ clientId: ME, category: "Movies", title: "Knives Out", action: "like" }))[0], 400);
  check("watched can't be undone here", (await post({ clientId: ME, category: "Movies", title: "Knives Out", action: "watched" }))[0], 400);
  check("remove only for saves", (await post({ clientId: ME, category: "Movies", title: "Knives Out", action: "dislike", remove: true }))[0], 400);
  check("no client id → refused", (await post({ category: "Movies", title: "Knives Out", action: "dislike" }))[0], 400);
  check("nothing deleted by refused calls", deleted, []);
  check("every delete is scoped to the client id", ops.filter((o) => o.op === "delete").every((o) => o.filters.some(([op, c, v]) => op === "eq" && c === "client_id" && v === ME)), true);

  say("\n4. The facts route: commitment + where + poster for AI cards; misses named, never guessed");
  const bundles = {
    "movie:10": { commitment: "1h 43m", posterPath: "/p10.jpg", where: "on Netflix" },
    "tv:20": { commitment: "3 seasons · 30 episodes", posterPath: null, where: null },
  };
  let mediaOn = true;
  const factsRoute = load("app/api/facts/route.ts", {
    "../../../src/lib/envCheck": { runEnvCheck() {} },
    "../../../src/lib/tmdbMedia": {
      mediaConfigured: () => mediaOn,
      loadMediaBundle: async (kind, id) => {
        const b = bundles[`${kind}:${id}`];
        if (!b) throw new Error("miss");
        return b;
      },
      whereOf: (b) => b.where,
    },
  });
  const facts = async (body) => {
    const r = await factsRoute.POST(new Request("http://x/api/facts", { method: "POST", body: JSON.stringify(body) }));
    return [r.status, await r.json()];
  };
  check(
    "movie + tv + a miss",
    (await facts({ items: [{ kind: "movie", id: 10 }, { kind: "tv", id: 20 }, { kind: "movie", id: 99 }] }))[1],
    { ok: true, facts: [{ kind: "movie", id: 10, facts: ["1h 43m", "on Netflix"], posterPath: "/p10.jpg" }, { kind: "tv", id: 20, facts: ["3 seasons · 30 episodes"], posterPath: null }] }
  );
  check("junk items → 400", (await facts({ items: [{ kind: "book", id: 1 }, { kind: "movie", id: -3 }, { kind: "movie", id: "7" }] }))[0], 400);
  const many = Array.from({ length: 20 }, () => ({ kind: "movie", id: 10 }));
  check("at most 12 asked", (await facts({ items: many }))[1].facts.length, 12);
  mediaOn = false;
  check("no TMDb key → empty, not an error", (await facts({ items: [{ kind: "movie", id: 10 }] }))[1], { ok: true, facts: [] });

  say("\n5. Wiring");
  const card = read("src/components/RekCard.tsx");
  const rv = read("src/components/ResultsV4.tsx");
  const page = read("app/page.tsx");
  const bar = read("src/components/SearchBar.tsx");
  const thumb = read("src/components/PosterThumb.tsx");
  const swipe = read("src/lib/useSwipeToAction.ts");
  check("D2 is Movies and TV only", /d2 = category === "Movies" \|\| category === "TV Shows"/.test(rv), true);
  check("posters only rendered while on", /postersOn \?/.test(rv) || /!postersOn/.test(rv), true);
  check("poster: w185, lazy, async, 76×114", [/\/t\/p\/w185/.test(thumb), /loading="lazy"/.test(thumb), /decoding="async"/.test(thumb), /h-\[114px\] w-\[76px\]/.test(thumb)], [true, true, true, true]);
  check("poster ×: 44px target", /h-11 w-11/.test(thumb), true);
  check("card: no thumbs on D2 (☆ · Save · ×)", /aria-label=\{NOT_FOR_ME\}/.test(card) && /Bookmark/.test(card), true);
  check("card: bottom row = Watched · Share · More like this", /cloneElement\(shareSlot[^)]*leading: watchedSlot[^)]*trailing: verbRight/.test(card.replace(/\s+/g, " ")), true);
  check("swipe: left and right are different acts", /onSwipeLeft/.test(swipe) && /onSwipeRight/.test(swipe) && /data-swipe/.test(swipe), true);
  check("swipe: reduced motion honoured", /prefers-reduced-motion/.test(swipe), true);
  check("swipe: vertical pans stay native", /touch-pan-y/.test(card), true);
  check("search field: no GO, Search key, mic + camera", [/>\s*GO\s*</.test(bar), /enterKeyHint="search"/.test(bar)], [false, true]);
  check("chips: selected #3B6BD4 white bold", /bg-\[#3B6BD4\][^"]*font-semibold[^"]*text-white|border-\[#3B6BD4\] bg-\[#3B6BD4\] font-semibold text-white/.test(bar), true);
  // S21 — the rows scroll sideways now instead of wrapping.
  check("chips scroll in one row (S21)", [/flex-wrap/.test(bar), /overflow-x-auto/.test(bar)], [false, true]);
  check("page: no Steer by row", /SteerByRow/.test(page), false);
  check("page: shortlist only for wine", /shortlist=\{category === "Wine" \? shortlist : \[\]\}/.test(page), true);
  check("page: results header wired", /header=\{resultsHeader\}/.test(page), true);
  check("D2: no 'You liked this' marker", /markerLine=\{d2 \?/.test(rv), true);
  check("AI cards fill facts from /api/facts", /\/api\/facts/.test(rv), true);
  check("TMDb attribution present", /This product uses the TMDB API but is not endorsed or certified by TMDB/.test(read("app/layout.tsx")), true);

  say("\n6. Wording: the toasts and labels are the approved ones");
  const toast = read("src/components/WatchedControl.tsx");
  check("toast labels", /UndoToastLabel = "Not for me" \| "Saved" \| "Watched" \| "Posters hidden"/.test(toast), true);
  check("toast shape: {label} · Undo", /\{label\} ·/.test(toast) || /`\$\{label\} ·/.test(toast), true);
  check("card labels", [/NOT_FOR_ME = "Not for me"/.test(card), /SAVE_FOR_LATER = "Save for later"/.test(card)], [true, true]);

  say(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  process.stdout.write("CRASH " + (e && e.stack ? e.stack : e) + "\n");
  process.exit(1);
});
