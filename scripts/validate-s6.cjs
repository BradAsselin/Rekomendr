/* eslint-disable no-console */
//
// scripts/validate-s6.cjs — S6: Share never depends on Save; Share on
// every rek card.
//   share-after-save (Brad's "Designated Survivor" bug) · a failed Save
//   mint never blocks Share · a revoked earlier save isn't "already saved"
//   · a refused long falls back short-only · every rek is signed for its
//   own client, never health · a signed rek mints + shares like the anchor.
//
// Compiles the REAL /api/save, /api/share, shareSnapshot and rekTokens from
// source. Stubs OpenAI moderation and the Supabase service-role client (an
// in-memory table). No keys, no network.
//
//   node scripts/validate-s6.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s6-validate-"));

console.log("Compiling /api/save, /api/share, shareSnapshot, rekTokens from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/api/save/route.ts",
    "app/api/share/route.ts",
    "src/lib/shareSnapshot.ts",
    "src/lib/rekTokens.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--lib", "es2020,dom",
  ],
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

/* ---------------- OpenAI moderation stub ---------------- */
const mod = { flagged: false, calls: 0 };
class FakeOpenAI {
  constructor() {
    this.moderations = {
      create: async () => {
        mod.calls++;
        return { results: [{ flagged: mod.flagged }] };
      },
    };
    this.chat = { completions: { create: async () => { throw new Error("no generation in S6"); } } };
  }
}
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
seed(require.resolve("openai"), { __esModule: true, default: FakeOpenAI });

/* ---------------- Supabase stub: a tiny in-memory table engine ---------------- */
const db = { anchor_snapshots: [], client_profiles: [], card_events: [] };
function query(table) {
  const st = { op: "select", filters: [], order: null, limit: null, head: false, payload: null };
  const rowsOf = () => db[table];
  const match = (r) => st.filters.every((f) => f(r));
  const run = () => {
    if (st.op === "insert") {
      const items = (Array.isArray(st.payload) ? st.payload : [st.payload]).map((p) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        shared_at: null,
        revoked_at: null,
        sender_name: null,
        ...p,
      }));
      rowsOf().push(...items);
      return { data: items, error: null };
    }
    if (st.op === "update") {
      const hit = rowsOf().filter(match);
      hit.forEach((r) => Object.assign(r, st.payload));
      return { data: hit, error: null };
    }
    let rows = rowsOf().filter(match);
    if (st.order) {
      const { col, asc } = st.order;
      rows = rows.slice().sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
    }
    const count = rows.length;
    if (st.limit != null) rows = rows.slice(0, st.limit);
    return { data: st.head ? null : rows.map((r) => ({ ...r })), error: null, count };
  };
  const b = {
    select(_cols, opts) { if (opts?.head) st.head = true; return b; },
    insert(p) { st.op = "insert"; st.payload = p; return b; },
    update(p) { st.op = "update"; st.payload = p; return b; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return b; },
    gte(c, v) { st.filters.push((r) => r[c] != null && Date.parse(r[c]) >= Date.parse(v)); return b; },
    is(c, v) { st.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; },
    order(c, o) { st.order = { col: c, asc: o?.ascending !== false }; return b; },
    limit(n) { st.limit = n; return b; },
    single() { const r = run(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
    maybeSingle() { const r = run(); return Promise.resolve({ ...r, data: r.data?.[0] ?? null }); },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: (t) => query(t) } });

process.env.OPENAI_API_KEY = "stub";
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.MINT_SIGNING_SECRET = "s6-secret";

const saveRoute = require(path.join(OUT, "app/api/save/route.js"));
const shareRoute = require(path.join(OUT, "app/api/share/route.js"));
const { snapshotForShare, flipShare, mintSnapshot } = require(path.join(OUT, "src/lib/shareSnapshot.js"));
const { withRekTokens } = require(path.join(OUT, "src/lib/rekTokens.js"));
const { signAnchor } = require(path.join(OUT, "src/lib/mintToken.js"));

// The routes, as the browser's postJson would reach them.
const ROUTES = { "/api/save": saveRoute, "/api/share": shareRoute };
const calls = [];
const post = async (url, body) => {
  calls.push(url);
  const res = await ROUTES[url].POST(
    new Request("http://local/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  );
  return res.json().catch(() => null);
};

const ME = "anon_s6_client_00001";
const OTHER = "anon_s6_other_000001";
const DS = {
  name: "Designated Survivor",
  category: "tv",
  short: "A low-level cabinet member becomes president after a catastrophic attack on the Capitol.",
};
const anchorItem = (over = {}) => ({
  ...DS,
  token: signAnchor({ ...DS, long: null, clientId: ME }),
  long: null,
  longToken: null,
  mode: "similar",
  ...over,
});
const rowsFor = (name) => db.anchor_snapshots.filter((r) => r.item_name === name);

(async () => {
  out("\n1. Share after Save (the Designated Survivor bug)");
  // The Save tap mints…
  const saveTap = await mintSnapshot(anchorItem(), ME, post);
  check("Save tap mints a private row", [!!saveTap.id, rowsFor(DS.name).length, rowsFor(DS.name)[0]?.shared_at], [true, 1, null]);
  // …and Share, tapped after, uses that row.
  const afterSave = await snapshotForShare({ item: anchorItem(), clientId: ME, post, pending: Promise.resolve(saveTap.id) });
  check("Share after Save: same row, no second mint", [afterSave.id === saveTap.id, rowsFor(DS.name).length], [true, 1]);
  const flip = await flipShare(afterSave.id, ME, post);
  check("…and it flips public", [flip.ok, !!rowsFor(DS.name)[0].shared_at], [true, true]);

  out("\n2. Already saved, but the Save tap's mint failed — Share still works");
  db.anchor_snapshots.length = 0;
  calls.length = 0;
  await mintSnapshot(anchorItem(), ME, post); // saved earlier (row exists)
  const failedSaveMint = Promise.resolve(null); // this view's Save mint did not land
  const s2 = await snapshotForShare({ item: anchorItem(), clientId: ME, post, pending: failedSaveMint });
  check("Share mints its own: the server's dedupe answers 'already saved' with the same row", [!!s2.id, s2.id === db.anchor_snapshots[0].id, rowsFor(DS.name).length], [true, true, 1]);
  check("…and it flips public (never 'couldn't share — it's still saved')", (await flipShare(s2.id, ME, post)).ok, true);
  const s2b = await snapshotForShare({ item: anchorItem(), clientId: ME, post, pending: Promise.reject(new Error("network")) });
  check("a Save mint that THREW is treated the same", s2b.id === s2.id, true);

  out("\n3. Share with no Save at all");
  db.anchor_snapshots.length = 0;
  const s3 = await snapshotForShare({ item: anchorItem(), clientId: ME, post, pending: null });
  check("mints and shares without a Save step", [!!s3.id, (await flipShare(s3.id, ME, post)).ok], [true, true]);

  out("\n4. A revoked earlier save is not 'already saved'");
  db.anchor_snapshots.length = 0;
  const old = await mintSnapshot(anchorItem(), ME, post);
  db.anchor_snapshots[0].revoked_at = new Date().toISOString();
  const s4 = await snapshotForShare({ item: anchorItem(), clientId: ME, post, pending: null });
  check("a fresh row, not the revoked one", [!!s4.id, s4.id !== old.id], [true, true]);
  check("…and it shares (the revoked id would have answered not_found)", (await flipShare(s4.id, ME, post)).ok, true);
  check("control: the revoked row itself still refuses", (await flipShare(old.id, ME, post)).reason, "not_found");

  out("\n5. A long that fails to verify never blocks a share");
  db.anchor_snapshots.length = 0;
  const badLong = anchorItem({ long: "A deeper read the user opened.", longToken: { sig: "forged", issued_at: Date.now() } });
  const s5 = await snapshotForShare({ item: badLong, clientId: ME, post, pending: null });
  check("falls back to short-only and mints", [!!s5.id, db.anchor_snapshots[0]?.long_description ?? null], [true, null]);
  const goodLongText = "A deeper read the user opened.";
  const goodLong = anchorItem({ long: goodLongText, longToken: signAnchor({ ...DS, long: goodLongText, clientId: ME }) });
  db.anchor_snapshots.length = 0;
  await snapshotForShare({ item: goodLong, clientId: ME, post, pending: null });
  check("control: a valid long rides along", db.anchor_snapshots[0]?.long_description, goodLongText);

  out("\n6. Every rek is signed — for this client, never for health");
  const reks = [
    { name: "The West Wing", description: "Idealists run the White House.", category: "tv", rank: 1 },
    { name: "House of Cards", description: "Ruthless ambition in Washington.", rank: 2 }, // no own label
    { name: "Melatonin Gummies", description: "Sleep aid.", category: "snacks", rank: 3 }, // health by name
    { name: "Multivitamin", description: "Daily.", category: "supplements", rank: 4 }, // health by category
  ];
  const signed = withRekTokens(reks, ME, "tv");
  check("non-health reks carry a token", [!!signed[0].token, !!signed[1].token], [true, true]);
  check("a missing label is pinned to the anchor's category (what was signed is what returns)", signed[1].category, "tv");
  check("health by name → no token", !!signed[2].token, false);
  check("health by category → no token", !!signed[3].token, false);
  check("no client → no tokens", withRekTokens(reks, null, "tv").some((r) => r.token), false);
  check("no category at all → no token", !!withRekTokens([{ name: "X", description: "y" }], ME, "")[0].token, false);
  check("rank and fields pass through untouched", [signed[0].rank, signed[0].description], [1, reks[0].description]);

  out("\n7. A rek card shares exactly like the anchor");
  db.anchor_snapshots.length = 0;
  const wing = signed[0];
  const rekItem = { name: wing.name, category: wing.category, short: wing.description, token: wing.token, mode: "similar" };
  const r7 = await snapshotForShare({ item: rekItem, clientId: ME, post });
  check("mints from the rek's own token", [!!r7.id, db.anchor_snapshots[0]?.item_name, db.anchor_snapshots[0]?.short_description], [true, "The West Wing", wing.description]);
  check("…and flips public", (await flipShare(r7.id, ME, post)).ok, true);
  const again = await snapshotForShare({ item: rekItem, clientId: ME, post });
  check("a second share of the same rek reuses the row", [again.id === r7.id, db.anchor_snapshots.length], [true, 1]);

  out("\n8. Integrity holds (Ledger #19)");
  const tampered = await snapshotForShare({ item: { ...rekItem, short: "Arbitrary text I typed." }, clientId: ME, post });
  check("edited text → refused (token_invalid)", [tampered.id, tampered.reason], [null, "token_invalid"]);
  const stolen = await snapshotForShare({ item: rekItem, clientId: OTHER, post });
  check("another client can't mint my rek's token", [stolen.id, stolen.reason], [null, "token_invalid"]);
  const healthAttempt = await mintSnapshot(
    { name: "Multivitamin", category: "supplements", short: "Daily.", token: signAnchor({ name: "Multivitamin", category: "supplements", short: "Daily.", long: null, clientId: ME }), mode: "similar" },
    ME,
    post
  );
  check("even a validly signed health item is refused at /api/save (wall twin)", healthAttempt.reason, "health");
  check("another client can't flip my row", (await flipShare(r7.id, OTHER, post)).reason, "not_found");

  out("\n9. Client wiring (source)");
  const rsr = fs.readFileSync(path.join(ROOT, "src/components/RekSnapResults.tsx"), "utf8");
  const row = fs.readFileSync(path.join(ROOT, "src/components/ShareRow.tsx"), "utf8");
  const card = fs.readFileSync(path.join(ROOT, "src/components/RekCard.tsx"), "utf8");
  check("anchor Share goes through snapshotForShare, Save mint only as a hint", /snapshotForShare\(\{[\s\S]{0,600}pending:/.test(rsr), true);
  check("anchor share never toggles an existing save off", /if \(forResult && !savedNames\[forResult\.detected_item\.name\]\)/.test(rsr), true);
  check("frontier AND trail rek cards carry a Share row", [rsr.includes("shareSlot={rekShare(rek, activeMode)}"), rsr.includes("shareSlot={rekShare(entry.rek, entry.mode)}")], [true, true]);
  check("rek Share only with the rek's token, never under a health anchor", /!anchorIsHealthMedical && rek\.token && rek\.category \?/.test(rsr), true);
  check("RekCard renders the slot", card.includes("{shareSlot}"), true);
  check("one ShareRow for all: same name prompt, same 'sent' event, same /a/ URL", [row.includes("Your name, so friends know it’s from you."), /outcome === "shared" \|\| outcome === "copied" \|\| outcome === "manual"[\s\S]{0,120}recordCardSent/.test(row), row.includes("`${window.location.origin}/a/${id}`")], [true, true, true]);
  check("a refused share can be retried (no sticky failed mint)", /let id = idRef\.current;\s*if \(!id\) \{\s*const minted = await getSnapshot\(\)/.test(row), true);
  const page = fs.readFileSync(path.join(ROOT, "app/page.tsx"), "utf8");
  check("rek tokens survive every client remap", [(rsr.match(/token: asToken\(/g) || []).length, (page.match(/token: asToken\(/g) || []).length], [2, 1]);
  const routeSrc = fs.readFileSync(path.join(ROOT, "app/api/reksnap/route.ts"), "utf8");
  const anchorSrc = fs.readFileSync(path.join(ROOT, "app/api/anchor/route.ts"), "utf8");
  check("every server rek path signs (snap ×3 lists, media snap, backfill, chain, typed)", [(routeSrc.match(/withRekTokens\(/g) || []).length, (anchorSrc.match(/withRekTokens\(/g) || []).length], [6, 1]);

  out(`\n${pass} passed, ${fail} failed.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
