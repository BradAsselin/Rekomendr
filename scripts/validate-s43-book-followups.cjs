/* eslint-disable no-console */
//
// scripts/validate-s43-book-followups.cjs — Brad's S42 follow-ups (2026-11-22).
//   1. The empty Read list in Books: "Nothing marked read yet."
//   2. Share on book cards: /api/anchor "book-card" signs the card's own
//      line only for a real Open Library book (the token verifies as /api/save
//      checks it); the card page shows the cover and author, looked up once
//      and stored on the row; the snapshot text stays byte-identical.
//   3. Snapped books use the D2 card (source).
//   4. Movies/TV cards show "You liked this in …" (source).
// No keys, no network.
//
//   node -r ./scripts/npx-shim.cjs scripts/validate-s43-book-followups.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s43-validate-"));
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

console.log("Compiling /api/anchor, /a/[id], /api/og/[id] and the libs from source…");
execFileSync(
  "npx",
  ["tsc", "app/api/anchor/route.ts", "app/a/[id]/route.ts", "app/api/og/[id]/route.tsx", "src/lib/mintToken.ts", "--outDir", OUT, "--rootDir", ".", "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node", "--esModuleInterop", "--skipLibCheck", "--jsx", "react-jsx", "--resolveJsonModule", "--lib", "es2020,dom"],
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

process.env.MINT_SIGNING_SECRET = "s43-secret";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.TMDB_API_KEY = "v3key";

const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(path.join(OUT, "src/lib/apiUsage.js"), { capGate: async () => null });
seed(require.resolve("next/og", { paths: [ROOT] }), { ImageResponse: class { constructor() { this.headers = new Headers(); } } });

// Open Library, offline.
const olCalls = [];
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname === "openlibrary.org") {
    olCalls.push(String(url));
    const t = (u.searchParams.get("title") || "").toLowerCase();
    const docs = t === "rebecca" ? [{ title: "Rebecca", author_name: ["Daphne du Maurier"], cover_i: 4242, first_publish_year: 1938 }] : t === "the maid" ? [{ title: "The Maid", author_name: ["Nita Prose"] }] : [];
    return new Response(JSON.stringify({ docs }), { status: 200 });
  }
  throw new Error("offline");
};

// Supabase: one shared book card; updates recorded.
const updates = [];
const rows = [];
function query() {
  const filters = [];
  let patch = null;
  const b = {
    select: () => b,
    eq: (c, v) => (filters.push((r) => r[c] === v), b),
    not: (c) => (filters.push((r) => r[c] != null), b),
    is: (c, v) => (filters.push((r) => r[c] == v), b),
    limit: () => b,
    update: (p) => ((patch = p), b),
    maybeSingle: () => Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
    then: (res, rej) => {
      if (patch) {
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        hit.forEach((r) => Object.assign(r, patch));
        updates.push({ patch, n: hit.length });
      }
      return Promise.resolve({ data: null, error: null }).then(res, rej);
    },
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: () => query() } });

const book = {
  id: crypto.randomUUID(),
  client_id: "anon_s43_sender_0001",
  item_name: "Rebecca",
  item_category: "books",
  short_description: "A shy companion marries a widower & moves into Manderley, where the first wife’s \"presence\" <lingers>.",
  long_description: null,
  mode: "similar",
  shared_at: new Date().toISOString(),
  revoked_at: null,
  created_at: new Date().toISOString(),
  sender_name: "Brad",
  media_kind: null,
  media_id: null,
  poster_path: null,
  trailer_url: null,
  providers: null,
  providers_at: null,
};
rows.push(book);

let mainPage = null;
try {
  const ts = require("typescript");
  const mainSrc = execFileSync("git", ["show", "origin/main:app/a/[id]/route.ts"], { cwd: ROOT }).toString();
  const js = ts.transpileModule(mainSrc.replace(/"\.\.\/\.\.\/\.\.\/src\/lib\//g, `"${path.join(OUT, "src/lib").replace(/\\/g, "/")}/`), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  fs.writeFileSync(path.join(OUT, "main-card.js"), js);
  mainPage = path.join(OUT, "main-card.js");
} catch {}

const anchor = require(path.join(OUT, "app/api/anchor/route.js"));
const page = require(path.join(OUT, "app/a/[id]/route.js"));
const { verifyAnchor } = require(path.join(OUT, "src/lib/mintToken.js"));
const paras = (html) => (html.slice(html.indexOf("<article"), html.indexOf("</article>")).match(/<p>[\s\S]*?<\/p>/g) || []);
const render = async (mod, id = book.id) => {
  const res = await mod.GET(new Request(`https://www.rekomendr.ai/a/${id}`, { headers: { host: "www.rekomendr.ai" } }), { params: { id } });
  return { status: res.status, html: await res.text(), csp: res.headers.get("content-security-policy") };
};

(async () => {
  out("\n1. The empty Read list");
  const sp = src("src/components/SavedPage.tsx");
  check("Books: 'Nothing marked read yet.'; elsewhere unchanged", [sp.includes('const EMPTY_READ = "Nothing marked read yet.";'), sp.includes('{tab === "Watched" && barCategory === "Books" ? EMPTY_READ : EMPTY[tab]}'), sp.includes('Watched: "Nothing marked watched yet."')], [true, true, true]);

  out("\n2. Share on book cards — the mint");
  const post = (body) => anchor.POST(new Request("http://x/api/anchor", { method: "POST", body: JSON.stringify(body) })).then((r) => r.json());
  const line = "A shy companion marries a widower and moves into a house that still belongs to his first wife.";
  let r = await post({ action: "book-card", title: "Rebecca", year: 1938, short: line, clientId: "anon_agent_s43_x1" });
  check("a real book: signed, as Books, exactly the card's line", [r.ok, r.item], [true, { name: "Rebecca", category: "Books", short: line }]);
  check("…the token verifies as /api/save checks it (short only, this client)", verifyAnchor({ name: "Rebecca", category: "Books", short: line, long: null, clientId: "anon_agent_s43_x1" }, r.token), true);
  check("…and not for another client, or other text", [verifyAnchor({ name: "Rebecca", category: "Books", short: line, long: null, clientId: "anon_agent_other" }, r.token), verifyAnchor({ name: "Rebecca", category: "Books", short: line + "!", long: null, clientId: "anon_agent_s43_x1" }, r.token)], [false, false]);
  check("…the lookup sent the title only", olCalls.every((u) => { const k = [...new URL(u).searchParams.keys()].sort().join(","); return k === "fields,limit,title"; }), true);
  r = await post({ action: "book-card", title: "A Book That Is Not There", short: line, clientId: "anon_agent_s43_x1" });
  check("not on Open Library: no card", [r.ok, r.reason, !!r.token], [false, "not_found", false]);
  r = await post({ action: "book-card", title: "The Maid", short: line, clientId: "anon_agent_s43_x1" });
  check("a real book with no cover still gets its card", r.ok, true);
  check("bad asks refused (no client, empty line, too long)", [
    (await anchor.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "book-card", title: "Rebecca", short: line }) }))).status,
    (await anchor.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "book-card", title: "Rebecca", short: " ", clientId: "anon_agent_s43_x1" }) }))).status,
    (await anchor.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ action: "book-card", title: "Rebecca", short: "x".repeat(2001), clientId: "anon_agent_s43_x1" }) }))).status,
  ], [400, 400, 400]);
  check("the share flip still moderates everything public, failing closed (unchanged)", /input: \[row\.item_name, row\.short_description, row\.long_description \?\? ""\]/.test(src("app/api/share/route.ts")) && /moderation_unreachable/.test(src("app/api/share/route.ts")), true);
  const rv = src("src/components/ResultsV4.tsx");
  check("book cards share their own line (never the vs. line)", rv.includes("bookCardSnapshot({ title: rek.title, year: rek.year || null, short: rek.baseShort ?? rek.short }"), true);

  out("\n2b. The shared book card page");
  const before = JSON.parse(JSON.stringify(book));
  let p = await render(page);
  check("200, cover and author shown", [p.status, p.html.includes('<img class="poster" src="https://covers.openlibrary.org/b/id/4242-M.jpg" alt="" width="92" height="138" referrerpolicy="no-referrer">'), p.html.includes('<div class="by">Daphne du Maurier</div>')], [200, true, true]);
  check("the cover host is allowed by the page's CSP", /img-src 'self' https:\/\/image\.tmdb\.org https:\/\/covers\.openlibrary\.org;/.test(p.csp), true);
  check("stored once on the row: cover in poster_path, author in providers", [book.poster_path, book.providers, updates.length], ["https://covers.openlibrary.org/b/id/4242-M.jpg", { book: { author: "Daphne du Maurier" } }, 1]);
  check("…the text columns untouched", [book.item_name, book.short_description, book.long_description], [before.item_name, before.short_description, before.long_description]);
  const callsBefore = olCalls.length;
  p = await render(page);
  check("the next open reads the stored answer (no lookup, no write)", [olCalls.length - callsBefore, updates.length, p.html.includes("Daphne du Maurier")], [0, 1, true]);
  check("the og image points at the cover", /\/api\/og\/[0-9a-f-]+\?v=\d+&amp;k=/.test(p.html), true);
  if (mainPage) {
    const m = await render(require(mainPage));
    check("snapshot text byte-identical to main's page", paras(p.html), paras(m.html));
  } else check("origin/main readable", false, true);
  const og = src("app/api/og/[id]/route.tsx");
  check("og: a book's cover in the large size", og.includes('isOpenLibraryCover(path) ? largeCover(path as string) : posterUrl(path, "w500")') && og.includes("const posterRef = book ? book.coverUrl"), true);

  out("\n3. Snapped books on the D2 card (source)");
  const snap = src("src/components/RekSnapResults.tsx");
  check("D2 covers Movies, TV and Books", snap.includes('return c === "movies" || c === "tv" || c === "books";'), true);
  check("books ask /api/covers (title, year only), never /api/facts", snap.includes('bookAsk.push({ title: name, year: typeof body.year === "number" ? body.year : null });') && snap.includes('void fetch("/api/covers"'), true);
  check("the cover in the poster box; author as the facts line", [snap.includes("<PosterThumb key={factsFor(name)?.coverUrl ?? \"none\"} url={factsFor(name)?.coverUrl}"), snap.includes("facts: typeof c.author === \"string\" && c.author ? [c.author] : []")], [true, true]);
  check("server marks follow the anchor's kind (a saved book never lights a same-named film)", [snap.includes('const marksFor = (anchorCategory: unknown) => (isBookCategory(anchorCategory) ? BOOK_MARKS : MEDIA_MARKS);'), (snap.match(/marksFor\(result\??\.detected_item\.category\)\.has\(x\.category\)/g) || []).length], [true, 2]);

  out("\n4. Movies/TV show 'You liked this in …'");
  check("every D2 card passes its resurfaced note", (rv.match(/markerLine=\{d2 \? rek\.resurfacedNote : rek\.resurfacedNote \?\? rek\.screenNote\}/g) || []).length, 2);
  check("the D2 card draws it", src("src/components/RekCard.tsx").includes('data-testid="marker-line"'), true);

  out(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
