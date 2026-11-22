/* eslint-disable no-console */
//
// scripts/validate-s42-books.cjs — S42 Books card
// (docs/2026-11-22_books_card_launch.md).
//   1. The cover lookup (src/lib/openLibrary.ts, /api/covers): ISBN first,
//      then title + author; only the title, author and ISBN leave the
//      server (no cookies, no client id, a generic User-Agent); the match
//      never takes a different book; misses are answers; outages aren't
//      remembered.
//   2. The wording: "Read it" / "Read" / "Mark as read" / "Read · Undo" for
//      books, Watched everywhere else; the top tile "Read" only in Books.
//   3. The card (source): Books on the D2 card (cover, author line, ☆ ·
//      Save · ×, no thumbs, no tag line), TMDb facts stay Movies/TV, the
//      same Watched mark, Movies/TV unchanged.
// No keys, no network.
//
//   node -r ./scripts/npx-shim.cjs scripts/validate-s42-books.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s42-validate-"));
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

console.log("Compiling /api/covers, openLibrary and barCategory from source…");
execFileSync(
  "npx",
  ["tsc", "app/api/covers/route.ts", "src/lib/barCategory.ts", "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--lib", "es2020,dom"],
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
  out(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  (got ${a}, expected ${e})`}`);
};
for (const level of ["warn", "info", "log", "error"]) console[level] = () => {};

// Open Library, offline: records every request.
const calls = [];
let mode = "ok";
const DOCS = {
  "magpie murders": [
    { title: "Summary of Magpie Murders", author_name: ["FastReads"], cover_i: 999, first_publish_year: 2017 },
    { title: "Magpie Murders", author_name: ["Anthony Horowitz"], cover_i: 8189045, first_publish_year: 2016 },
  ],
  "a man called ove": [
    { title: "A Man Called Ove" },
    { title: "Summary of A Man Called Ove", author_name: ["FastReads"], cover_i: 8864159 },
  ],
  "dracula": [
    { title: "Dracula", author_name: ["Bram Stoker"], cover_i: 111, first_publish_year: 1897 },
    { title: "Dracula", author_name: ["Bram Stoker"], cover_i: 222, first_publish_year: 1975 },
  ],
};
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (mode === "down") throw new Error("offline");
  const u = new URL(String(url));
  if (u.hostname === "covers.openlibrary.org") return new Response(null, { status: u.pathname.includes("9780000000000") ? 404 : 200 });
  const t = (u.searchParams.get("title") || "").toLowerCase();
  return new Response(JSON.stringify({ docs: DOCS[t] ?? [] }), { status: 200, headers: { "content-type": "application/json" } });
};

const ol = require(path.join(OUT, "src/lib/openLibrary.js"));
const route = require(path.join(OUT, "app/api/covers/route.js"));
const bar = require(path.join(OUT, "src/lib/barCategory.js"));

(async () => {
  out("\n1. The cover lookup");
  check("URLs: ISBN cover first, then the search — title, author and ISBN only", ol.bookLookupUrls({ title: "Magpie Murders", author: "Anthony Horowitz", isbn: "978-0-06-264522-1", year: 2016 }), [
    "https://covers.openlibrary.org/b/isbn/9780062645221-M.jpg?default=false",
    "https://openlibrary.org/search.json?title=Magpie+Murders&author=Anthony+Horowitz&limit=8&fields=title%2Cauthor_name%2Ccover_i%2Cfirst_publish_year",
  ]);
  const params = (u) => [...new URL(u).searchParams.keys()].sort();
  check("…the search's only person-free parameters (no year, no id)", params(ol.bookLookupUrls({ title: "Dracula", year: 1897 })[0]), ["fields", "limit", "title"]);

  calls.length = 0;
  let r = await ol.lookupBook({ title: "Magpie Murders", year: 2016 });
  check("a title finds its own book (not the 'Summary of…' knockoff), with the author", r, { coverUrl: "https://covers.openlibrary.org/b/id/8189045-M.jpg", author: "Anthony Horowitz", found: true });
  check("…one request, no cookies, a generic User-Agent naming the app", [calls.length, calls[0].init.credentials, calls[0].init.headers["User-Agent"], Object.keys(calls[0].init.headers).sort()], [1, "omit", "Rekomendr/1.0 (+https://www.rekomendr.ai)", ["Accept", "User-Agent"]]);
  calls.length = 0;
  r = await ol.lookupBook({ title: "Magpie Murders", year: 2016 });
  check("…cached: the same book asks nothing again", [calls.length, r.author], [0, "Anthony Horowitz"]);
  r = await ol.lookupBook({ title: "A Man Called Ove", year: 2012 });
  check("no cover on the real book → a miss (never a different book's cover)", r, { coverUrl: null, author: null, found: true });
  r = await ol.lookupBook({ title: "Dracula", year: 1975 });
  check("same title, two editions: the card's year picks", r.coverUrl, "https://covers.openlibrary.org/b/id/222-M.jpg");
  calls.length = 0;
  r = await ol.lookupBook({ title: "Gone Girl", isbn: "0307588378", author: "Gillian Flynn" });
  check("ISBN first: its cover found, the search not needed when the author is known", [r.coverUrl, calls.map((c) => [new URL(c.url).hostname, c.init.method ?? "GET"])], ["https://covers.openlibrary.org/b/isbn/0307588378-M.jpg", [["covers.openlibrary.org", "HEAD"]]]);
  calls.length = 0;
  r = await ol.lookupBook({ title: "Dracula", isbn: "9780000000000" });
  check("ISBN with no cover → title search next", [r.coverUrl, calls.length], ["https://covers.openlibrary.org/b/id/111-M.jpg", 2]);
  mode = "down";
  r = await ol.lookupBook({ title: "The Maid", year: 2022 });
  mode = "ok";
  const after = await ol.lookupBook({ title: "The Maid", year: 2022 });
  check("an outage is not remembered as a miss", [r.coverUrl, calls.filter((c) => c.url.includes("The+Maid")).length >= 2, after.coverUrl], [null, true, null]);
  check("titles match through articles, accents, subtitles", [ol.normTitle("The Seven Husbands of Evelyn Hugo: A Novel"), ol.normTitle("Seven Husbands of Evelyn Hugo"), ol.normTitle("Café Society"), ol.normTitle("Legends & Lattes")], ["seven husbands of evelyn hugo", "seven husbands of evelyn hugo", "cafe society", "legends and lattes"]);

  calls.length = 0;
  const res = await route.POST(new Request("http://x/api/covers", { method: "POST", body: JSON.stringify({ clientId: "anon_x", items: [{ title: "Magpie Murders", year: 2016, clientId: "anon_x", email: "x@y.z" }, { title: "" }] }) }));
  const body = await res.json();
  check("/api/covers answers by title; blanks dropped", body, { ok: true, covers: [{ title: "Magpie Murders", coverUrl: "https://covers.openlibrary.org/b/id/8189045-M.jpg", author: "Anthony Horowitz" }] });
  check("…and nothing about the person reaches Open Library", calls.every((c) => !/anon_|email|x@y|client/i.test(c.url + JSON.stringify(c.init.headers))), true);
  check("/api/covers: an empty ask is a 400", (await route.POST(new Request("http://x", { method: "POST", body: "{}" }))).status, 400);

  out("\n2. The wording");
  const wc = src("src/components/WatchedControl.tsx");
  check("books: Read it / Read / Mark as read", wc.includes('export const READ_WORDS = { verb: "Read it", done: "Read", label: "Mark as read" } as const;'), true);
  check("…everything else unchanged: Watched it / Watched", wc.includes('export const WATCHED_WORDS = { verb: "Watched it", done: "Watched", label: "Watched" } as const;'), true);
  check("the toasts: Read · Undo for a book", [wc.includes('"Not for me" | "Saved" | "Watched" | "Read" | "Posters hidden"'), wc.includes("{isReadCategory(item.category) ? READ_WORDS.done : WATCHED_WORDS.done} ·")], [true, true]);
  check("the top tile: Read only in Books", ["Books", "Movies", "TV Shows", "Wine"].map(bar.watchedTabLabel), ["Read", "Watched", "Watched", "Watched"]);
  const saved = src("src/components/SavedPage.tsx");
  check("the tile and the sheet's tab use it; book rows in the list say Read", [saved.includes("<span className=\"truncate\">{tabLabel(t)}</span>"), saved.includes("{tabLabel(t)}\n"), saved.includes('read={w.category === "Books"}')], [true, true, true]);
  check("the page tells the tiles the bar's category", src("app/page.tsx").includes("publishBarCategory(c);"), true);
  check("Compare to's tab reads Read in Books", src("src/components/CompareSheet.tsx").includes('{t === "Watched" && category === "Books" ? "Read" : t}'), true);
  const snap = src("src/components/RekSnapResults.tsx");
  check("the snap lane's books say it too (pill and toast)", [snap.includes("read={isReadCategory(cat)}"), snap.includes("read={isReadCategory(watchCatFor(category))}"), snap.includes('showToast(isReadCategory(cat) ? "Read" : "Watched"')], [true, true, true]);
  check("'Did you watch one of these?' stays Movies/TV", /if \(!isMedia\(e\.category\)\) continue;/.test(src("src/lib/watchAsk.ts")), true);

  out("\n3. The card");
  const rv = src("src/components/ResultsV4.tsx");
  check("Books on the D2 card; TMDb facts stay Movies/TV", [rv.includes("const d2 = tmdbLane || books;"), rv.includes("if (!tmdbLane) return;\n    const kind")], [true, true]);
  check("the cover in the poster's place (same component, same size)", rv.includes('<PosterThumb key={rek.coverUrl ?? "none"} url={rek.coverUrl} onHide={hidePosters} />'), true);
  check("…posters hidden → no cover either", /postersOn \? \(\s*books \?/.test(rv), true);
  check("the author is the facts line; a miss keeps none", rv.includes("facts: r.facts ?? (c?.author ? [c.author] : [])"), true);
  check("only the title goes out from the card (and the year, kept on our server)", rv.includes("items: need.map((r) => ({ title: r.title, year: r.year || null }))"), true);
  check("the same Watched mark ('read' is the word only)", [rv.includes('<WatchedButton on={watched.isWatched(rek.title)} read={books}'), rv.includes('showToast(books ? "Read" : "Watched"')], [true, true]);
  // S43 — Movies/TV show it too (Brad).
  check("'You liked this in …' on every D2 card (S43: Movies/TV too)", (rv.match(/markerLine=\{d2 \? (\(books \? rek\.resurfacedNote : undefined\)|rek\.resurfacedNote) : rek\.resurfacedNote \?\? rek\.screenNote\}/g) || []).length, 2);
  const card = src("src/components/RekCard.tsx");
  const d2 = card.slice(card.indexOf('if (layout === "d2")'), card.indexOf("if (!directional) return card;"));
  check("the D2 card has no thumbs and no tag line", [/Thumbs|ThumbsUp|SignalButtons/.test(d2), d2.includes("{genreLine}")], [false, false]);
  const pt = src("src/components/PosterThumb.tsx");
  check("covers load with no referrer; posters unchanged", [pt.includes('referrerPolicy={url ? "no-referrer" : undefined}'), pt.includes("`https://image.tmdb.org/t/p/w185${path}`")], [true, true]);
  check("no prompt edits (engine prompt text untouched)", execFileSync("git", ["diff", "origin/main", "--", "src/engine/rekomendrEngine.ts"], { cwd: ROOT }).toString().split("\n").filter((l) => /^[+-][^+-]/.test(l)).every((l) => /coverUrl|S42|poster placeholder shows|Unset until the lookup/.test(l)), true);

  out(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
