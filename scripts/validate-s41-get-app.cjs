/* eslint-disable no-console */
//
// scripts/validate-s41-get-app.cjs — S41 Get the app
// (docs/2026-11-22_get_the_app_launch.md).
//   1. H1: the shared card page — the header (logo, "[Name] sent you a
//      pick", Open Rekomendr, Get the app, the free line), the old title
//      bar gone, "Save it for later", "Find more like this →", Get the app
//      hidden in standalone, the snapshot text byte-identical to main's page.
//   2. H2: the sheet — the variant for each browser, the approved wording,
//      the Safari steps; Android uses the stored install prompt; never when
//      installed. card.js runs in a fake page: it picks the variant, shows
//      the sheet, and its counts carry only their kind.
//   3. The manifest: the icon opens home, never the card.
//   4. H4 rules: 14 days after ×/Got it, never after three.
//   5. Counts: allow-listed, nothing but the kind stored; stats Block 3.
//   6. H3 wiring (source): the card opens as a More like this set, Recent
//      entry, "From [Name]", the ask after the picks in the browser only.
//   7. Wine Compare to: same color first, "Other styles" after, unknown first.
// No keys, no network.
//
//   node -r ./scripts/npx-shim.cjs scripts/validate-s41-get-app.cjs
//
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(ROOT, "node_modules", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
const OUT = fs.mkdtempSync(path.join(CACHE, "s41-validate-"));
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

console.log("Compiling /a/[id], /api/manifest, /api/signals and the S41 libs from source…");
execFileSync(
  "npx",
  [
    "tsc",
    "app/a/[id]/route.ts",
    "app/api/manifest/route.ts",
    "src/lib/getApp.ts",
    "src/lib/getAppSheet.ts",
    "src/lib/measureRow.ts",
    "src/lib/measureReadout.ts",
    "src/lib/wineCompare.ts",
    "--outDir", OUT,
    "--rootDir", ".",
    "--module", "commonjs",
    "--target", "es2020",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--jsx", "react-jsx",
    "--resolveJsonModule",
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
for (const level of ["warn", "info", "log", "error"]) console[level] = () => {};

// TMDb is down: the page renders from the card's stored answer.
globalThis.fetch = async () => {
  throw new Error("offline");
};
const seed = (file, exports) => {
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// Supabase: one public card.
const rows = [];
function query() {
  const filters = [];
  const b = {
    select: () => b,
    eq: (c, v) => (filters.push((r) => r[c] === v), b),
    not: (c) => (filters.push((r) => r[c] != null), b),
    is: (c) => (filters.push((r) => r[c] == null), b),
    limit: () => b,
    update: () => b,
    maybeSingle: () => Promise.resolve({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
    then: (res, rej) => Promise.resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }).then(res, rej),
  };
  return b;
}
seed(path.join(OUT, "src/lib/supabaseServer.js"), { supabaseServer: { from: () => query() } });
process.env.SUPABASE_URL = "http://stub.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.TMDB_API_KEY = "v3key";

const card = {
  id: crypto.randomUUID(),
  client_id: "anon_s41_sender_0001",
  item_name: "Lioness",
  item_category: "tv",
  short_description: "Cruz Manuelos, a young Marine, is recruited to the CIA’s \"Lioness\" team & <sent> undercover.",
  long_description: "A longer read, with an apostrophe's edge.",
  mode: "similar",
  shared_at: new Date(Date.now() - 3 * 864e5).toISOString(),
  revoked_at: null,
  created_at: new Date(Date.now() - 3 * 864e5).toISOString(),
  sender_name: "Brad",
  media_kind: "tv",
  media_id: 113962,
  poster_path: "/lioness.jpg",
  trailer_url: "https://www.youtube.com/watch?v=x",
  providers: { watch: { link: "https://tmdb/w", stream: [{ name: "Paramount Plus", url: "https://p" }], rentBuy: [] }, availability: null },
  providers_at: new Date().toISOString(),
};
rows.push(card);

// main's page, for the byte-identical snapshot text (its imports point at
// this build's compiled libs, which the card text does not pass through
// except for escaping, firstSentence and pickLabel — all unchanged).
let mainSrc = null;
try {
  mainSrc = execFileSync("git", ["show", "origin/main:app/a/[id]/route.ts"], { cwd: ROOT }).toString();
} catch {
  mainSrc = null;
}

const page = require(path.join(OUT, "app/a/[id]/route.js"));
const manifestRoute = require(path.join(OUT, "app/api/manifest/route.js"));
const getAppSheet = require(path.join(OUT, "src/lib/getAppSheet.js"));
const { measureRow, GET_APP_EVENTS } = require(path.join(OUT, "src/lib/measureRow.js"));
const readout = require(path.join(OUT, "src/lib/measureReadout.js"));
const wine = require(path.join(OUT, "src/lib/wineCompare.js"));

const render = async (mod) => {
  const res = await mod.GET(new Request(`https://www.rekomendr.ai/a/${card.id}`, { headers: { host: "www.rekomendr.ai" } }), { params: { id: card.id } });
  return { status: res.status, html: await res.text(), headers: res.headers };
};
const articleOf = (html) => html.slice(html.indexOf("<article"), html.indexOf("</article>") + 10);
const paras = (html) => articleOf(html).match(/<p>[\s\S]*?<\/p>/g) || [];

(async () => {
  out("\n1. H1 — the shared card page");
  const p = await render(page);
  const html = p.html;
  const header = html.slice(html.indexOf("<header>"), html.indexOf("</header>"));
  check("200", p.status, 200);
  check("the old title bar is gone", html.includes('<header><a href="/">Rekomendr</a></header>'), false);
  check("header: the Rekomendr.AI logo", header.includes('<a class="logo" href="/">Rekomendr<span>.AI</span></a>'), true);
  check("header: 'Brad sent you a pick' in small gray", header.includes('<span class="sent">Brad sent you a pick</span>'), true);
  check("header: Open Rekomendr (primary) opens the app on this card", header.includes(`<a class="hb primary" href="/?card=${card.id}" data-open-app>Open Rekomendr</a>`), true);
  check("header: Get the app (outlined, with the add-to-home icon)", /<button type="button" class="hb getapp" data-get-app><svg[^>]*>[\s\S]*?<\/svg>Get the app<\/button>/.test(header), true);
  check("header: the free line", header.includes('<div class="free">Free · no App Store needed · find more like this one</div>'), true);
  check("Open Rekomendr comes before Get the app", header.indexOf("Open Rekomendr") < header.indexOf("Get the app"), true);
  check("Save reads 'Save it for later' (link and label)", html.includes(`<a class="save" href="/?card=${card.id}&amp;save=1" aria-label="Save it for later">`) && html.includes("Save it for later</a>"), true);
  check("the bare 'Save' label is gone", />Save<\/a>/.test(html), false);
  check("'Find more like this →' does what Open Rekomendr does", html.includes(`<div class="own"><a href="/?card=${card.id}" data-open-app>Find more like this →</a></div>`), true);
  check("'Snap your own →' is gone", html.includes("Snap your own"), false);
  check("standalone hides Get the app and its line (CSS, both ways)", [html.includes("@media (display-mode:standalone){.getapp,.free{display:none}}"), html.includes("html.standalone .getapp,html.standalone .free{display:none}")], [true, true]);
  check("the card keeps its pick label, Watch, Trailer, synopsis, streaming", ["Brad’s pick", "▶ Watch on Paramount Plus", ">Trailer<", "via ", "Stream: "].map((t) => html.includes(t)), [true, true, true, true, true]);
  check("the sheet is on the page, hidden until asked", html.includes('<div class="ga" data-ga hidden>'), true);
  check("still exactly one script, same-origin /card.js", [(html.match(/<script/g) || []).length, html.includes(`<script src="/card.js" defer data-card="${card.id}">`)], [1, true]);
  check("CSP still forbids inline script; manifest allowed same-origin", [/script-src 'self';/.test(p.headers.get("content-security-policy")), /manifest-src 'self'/.test(p.headers.get("content-security-policy"))], [true, true]);
  check("the page links the static manifest (start_url '/')", html.includes('<link rel="manifest" href="/manifest.json">'), true);
  if (mainSrc) {
    const js = ts.transpileModule(mainSrc.replace(/"\.\.\/\.\.\/\.\.\/src\/lib\//g, `"${path.join(OUT, "src/lib").replace(/\\/g, "/")}/`), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const file = path.join(OUT, "main-card-route.js");
    fs.writeFileSync(file, js);
    const m = await render(require(file));
    check("snapshot text byte-identical to main's page (title, both paragraphs)", [paras(html), (html.match(/<h1>[\s\S]*?<\/h1>/) || [])[0]], [paras(m.html), (m.html.match(/<h1>[\s\S]*?<\/h1>/) || [])[0]]);
    check("…and the og/meta preview tags are unchanged", (html.match(/<meta (property|name)="(og|twitter):[^>]*>/g) || []).join("\n"), (m.html.match(/<meta (property|name)="(og|twitter):[^>]*>/g) || []).join("\n"));
  } else {
    check("origin/main readable for the byte-identical check", false, true);
  }
  const miss = await page.GET(new Request("https://x/a/00000000-0000-0000-0000-000000000000"), { params: { id: "00000000-0000-0000-0000-000000000000" } });
  check("a missing card is still a 404 with the plain notice", [miss.status, (await miss.text()).includes("This rek isn&#39;t here anymore.")], [404, true]);

  out("\n2. H2 — the Get the app sheet");
  const { getAppVariantFor } = require(path.join(OUT, "src/lib/getApp.js"));
  const UA = {
    safari27: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1",
    safari26: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
    safari18: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0",
    chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36",
    webview: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36",
  };
  check(
    "variant per browser: Safari 27 / 26 / older, iOS in-app, Chrome, Android web view",
    [getAppVariantFor(UA.safari27, true, true), getAppVariantFor(UA.safari26, true, true), getAppVariantFor(UA.safari18, true, true), getAppVariantFor(UA.instagram, true, false), getAppVariantFor(UA.chromeAndroid, false, false), getAppVariantFor(UA.webview, false, false)],
    ["ios27", "ios26", "ios", "inapp-ios", "android", "inapp-android"]
  );
  const sheet = getAppSheet.getAppSheetHtml("ios27");
  check("approved wording: heading, two lines, Got it", ["Put Rekomendr on your home screen", "Free. No App Store needed.", "It opens like any app, from its own icon.", ">Got it<"].map((t) => sheet.includes(t)), [true, true, true, true]);
  check("the app icon on the sheet", sheet.includes('<img class="ga-icon" src="/rekomendr_icon_blue_180.png"'), true);
  const stepText = (v) => (sheet.match(new RegExp(`<ol class="ga-steps" data-ga-v="${v}">([\\s\\S]*?)</ol>`)) || [])[1]?.replace(/<svg[\s\S]*?<\/svg>/g, "[icon]").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  check("Safari 27 steps: the menu at the bottom → Share → Add to Home Screen, then Add", stepText("ios27"), "1Tap the menu [icon] at the bottom of Safari2Tap Share [icon]3Tap Add to Home Screen [icon], then Add");
  check("Safari 26 steps: ⋯ at the bottom → Share → Add to Home Screen, then Add", stepText("ios26"), "1Tap [icon] at the bottom of Safari2Tap Share [icon]3Tap Add to Home Screen [icon], then Add");
  check("older Safari steps: Share → Add to Home Screen → Add", stepText("ios"), "1Tap Share [icon] at the bottom of Safari2Tap Add to Home Screen [icon]3Tap Add");
  check("each step pictures its button", (sheet.match(/class="ga-key"/g) || []).length >= 9, true);
  check("an arrow points at the first step's Safari control (left for 27, right for 26)", [getAppSheet.GET_APP_SHEET_CSS.includes('.ga[data-variant="ios27"] .ga-arrow{display:block;text-align:left'), getAppSheet.GET_APP_SHEET_CSS.includes('.ga[data-variant="ios26"] .ga-arrow{display:block;text-align:right')], [true, true]);
  check("in-app browser: open in Safari first, one-tap copy", [sheet.includes('data-ga-v="inapp-ios"><p>Open this page in Safari first, then tap Get the app.</p>'), sheet.includes('data-ga-act="copy">Copy link<')], [true, true]);
  check("only the chosen variant shows (CSS)", getAppSheet.GET_APP_SHEET_CSS.includes('.ga[data-variant="ios27"] [data-ga-v="ios27"]'), true);

  // openGetApp: standalone → nothing; Chrome's prompt → prompt; else the sheet event.
  const loadGetApp = (env) => {
    const sent = [];
    const events = [];
    const store = new Map();
    const files = {
      [path.join(OUT, "src/lib/installPrompt.js")]: null,
      [path.join(OUT, "src/lib/measureClient.js")]: { sendMeasure: (b) => sent.push(b) },
    };
    globalThis.window = {
      matchMedia: () => ({ matches: !!env.standalone }),
      addEventListener() {},
      dispatchEvent: (e) => events.push(e.type),
      localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    };
    globalThis.navigator = { userAgent: UA.chromeAndroid, platform: "Linux", maxTouchPoints: 5, standalone: !!env.standalone };
    globalThis.CustomEvent = class { constructor(t) { this.type = t; } };
    for (const f of Object.keys(files)) delete require.cache[f];
    delete require.cache[path.join(OUT, "src/lib/getApp.js")];
    seed(path.join(OUT, "src/lib/measureClient.js"), files[path.join(OUT, "src/lib/measureClient.js")]);
    const ip = require(path.join(OUT, "src/lib/installPrompt.js"));
    const ga = require(path.join(OUT, "src/lib/getApp.js"));
    return { ga, ip, sent, events, store };
  };
  let env = loadGetApp({ standalone: true });
  await env.ga.openGetApp();
  check("installed (standalone): no sheet, no prompt, no count", [env.events.length, env.sent.length, env.ga.getAppAskDue()], [0, 0, false]);
  env = loadGetApp({});
  let prompted = 0;
  env.ip.holdInstallPrompt({ prompt: async () => { prompted++; }, userChoice: Promise.resolve({ outcome: "accepted" }) });
  await env.ga.openGetApp();
  check("Android: Get the app calls the stored install prompt, one tap", [prompted, env.events.length, env.sent.map((s) => s.event)], [1, 0, ["getapp_open", "install_accepted"]]);
  env = loadGetApp({});
  env.ip.holdInstallPrompt({ prompt: async () => {}, userChoice: Promise.resolve({ outcome: "dismissed" }) });
  await env.ga.openGetApp();
  check("…dismissed is counted and remembered as a dismissal", [env.sent.map((s) => s.event), JSON.parse(env.store.get("rekomendr.get_app_ask")).n], [["getapp_open", "install_dismissed"], 1]);
  env = loadGetApp({});
  await env.ga.openGetApp();
  check("no prompt stored: the sheet opens", [env.events, env.sent.map((s) => s.event)], [["rekomendr:get-app"], ["getapp_open"]]);

  // card.js, in a fake page.
  const runCardJs = (ua, opts = {}) => {
    const posted = [];
    const sheetEl = { attrs: { hidden: "" }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
    let clickHandler = null;
    const ls = new Map([["rekomendr.client_id", "anon_agent_s41_card"]]);
    const docEl = { className: "" };
    const sandbox = {
      document: {
        currentScript: { getAttribute: () => card.id },
        documentElement: docEl,
        querySelector: (q) => (q === "[data-ga]" ? sheetEl : null),
        addEventListener: (t, h) => { if (t === "click") clickHandler = h; },
        createElement: () => ({ setAttribute() {}, style: {}, select() {}, setSelectionRange() {} }),
        body: { appendChild() {}, removeChild() {} },
        execCommand: () => true,
      },
      window: { matchMedia: () => ({ matches: !!opts.standalone }), addEventListener: (t, h) => { if (t === "beforeinstallprompt" && opts.prompt) h(opts.prompt); } },
      navigator: { userAgent: ua, platform: /iPhone/.test(ua) ? "iPhone" : "Linux", maxTouchPoints: 5, sendBeacon: (url, blob) => { posted.push({ url, blob }); return true; } },
      localStorage: { getItem: (k) => ls.get(k) ?? null, setItem: (k, v) => ls.set(k, v) },
      location: { href: `https://www.rekomendr.ai/a/${card.id}` },
      Blob: class { constructor(parts) { this.text = parts.join(""); } },
      JSON, Date, Number, Math, Promise, crypto,
    };
    vm.runInNewContext(src("public/card.js"), sandbox);
    const el = (attr) => ({ closest: (q) => (q === `[${attr.split("=")[0]}]` ? { getAttribute: () => attr.split("=")[1], set textContent(v) { this._t = v; } } : null) });
    const click = (attr) => clickHandler({ target: el(attr) });
    return { posted, sheetEl, click, ls, docEl };
  };
  let page1 = runCardJs(UA.safari27);
  page1.click("data-get-app");
  check("card.js: Get the app shows the sheet, in Safari 27's variant", [page1.sheetEl.attrs.hidden, page1.sheetEl.attrs["data-variant"]], [undefined, "ios27"]);
  page1.click("data-ga-act=got");
  check("card.js: Got it hides it and is remembered (14-day wait)", [page1.sheetEl.attrs.hidden, JSON.parse(page1.ls.get("rekomendr.get_app_ask")).n], ["", 1]);
  page1.click("data-open-app");
  const measures = page1.posted.filter((p) => p.url === "/api/signals").map((p) => JSON.parse(p.blob.text));
  check("card.js counts carry only clientId, kind and the event", measures.map((m) => Object.keys(m).sort().join(",")), ["clientId,event,kind", "clientId,event,kind", "clientId,event,kind"]);
  check("…getapp_open, getapp_got_it, card_open_app", measures.map((m) => m.event), ["getapp_open", "getapp_got_it", "card_open_app"]);
  check("…and the open is still recorded once", page1.posted.filter((p) => p.url === "/api/card/event").map((p) => JSON.parse(p.blob.text).kind), ["open"]);
  let androidPrompted = 0;
  const page2 = runCardJs(UA.chromeAndroid, { prompt: { preventDefault() {}, prompt: () => { androidPrompted++; return Promise.resolve(); }, userChoice: Promise.resolve({ outcome: "accepted" }) } });
  page2.click("data-get-app");
  await new Promise((r) => setTimeout(r, 20));
  check("card.js on Android: the stored install prompt, no sheet", [androidPrompted, page2.sheetEl.attrs.hidden], [1, ""]);
  const page3 = runCardJs(UA.safari27, { standalone: true });
  page3.click("data-get-app");
  check("card.js from the home-screen icon: never the sheet; page marked standalone", [page3.sheetEl.attrs.hidden, page3.docEl.className.includes("standalone")], ["", true]);
  const page4 = runCardJs(UA.instagram);
  page4.click("data-get-app");
  check("card.js in Instagram's browser: the open-in-Safari variant", page4.sheetEl.attrs["data-variant"], "inapp-ios");

  out("\n3. The manifest: the icon opens home");
  const staticManifest = JSON.parse(src("public/manifest.json"));
  check("static manifest: start_url '/', scope '/', standalone", [staticManifest.start_url, staticManifest.scope, staticManifest.display], ["/", "/", "standalone"]);
  const claim = "eyJjIjoiYW5vbl9zNDFfcmVjZWl2ZXIiLCJrIjoiYWJjIn0.abcdefghijklmnopqrstuvwxyz012345";
  let m = await (await manifestRoute.GET(new Request(`http://local/api/manifest?card=${card.id}&claim=${claim}`))).json();
  check("per-save manifest: home with the claim, never the card", [m.start_url, m.start_url.includes("card")], [`/?claim=${claim}`, false]);
  m = await (await manifestRoute.GET(new Request(`http://local/api/manifest?card=${card.id}`))).json();
  check("no claim: plain home", m.start_url, "/");
  const pg = src("app/page.tsx");
  check("an icon start (standalone + claim) lands on home, not the card", /if \(standalone && claim\) \{\s*console\.info\("\[card-claim\] icon start — opening home"\);[\s\S]*?return;\s*\}/.test(pg), true);
  check("the manifest is pointed at the claim only", pg.includes("pointManifestAt(claim)") && src("src/lib/installPrompt.ts").includes("`/api/manifest?claim=${encodeURIComponent(claim)}`"), true);

  out("\n4. H4 — the ask's memory");
  const ga = require(path.join(OUT, "src/lib/getApp.js"));
  const D = 864e5;
  check("never dismissed → due", ga.askAllowed({ n: 0, at: 0 }, 10 * D), true);
  check("× 13 days ago → not due; 14 days → due", [ga.askAllowed({ n: 1, at: 0 }, 13.9 * D), ga.askAllowed({ n: 1, at: 0 }, 14 * D)], [false, true]);
  check("three dismissals → never again", ga.askAllowed({ n: 3, at: 0 }, 400 * D), false);
  const say = src("src/components/SayOrSnap.tsx");
  check("home ask: approved wording", [say.includes("export const HOME_ASK_LINE = 'Put Rekomendr on your home screen';"), say.includes("export const HOME_ASK_HOW = 'How';")], [true, true]);
  check("home ask: browser only, after a first search with results, yields to the watch ask", say.includes("visitHomeAsk = !watchAskDue && hadResults() && getAppAskDue();"), true);
  check("home ask: × and How are remembered/counted; How opens the sheet", [/home_ask_x'[\s\S]{0,40}noteGetAppDismissed\(\)/.test(say), /home_ask_how'[\s\S]{0,80}openGetApp\(\)/.test(say)], [true, true]);
  check("results shown are noted where Recent is written", /isHealthMedical\(category\.trim\(\)\.toLowerCase\(\)\)\) return;\s*noteResultsShown\(\);/.test(pg), true);
  const menu = src("src/components/MoreMenu.tsx");
  check("⋯ menu: 'Add to Home Screen' opens Get the app, hidden when installed", [menu.includes("Add to Home Screen"), /\{!installed && \(/.test(menu), menu.includes("void openGetApp();")], [true, true, true]);
  check("the sheet is mounted once, in the layout", src("app/layout.tsx").includes("<GetAppHost />"), true);

  out("\n5. Counts: the kind and nothing else");
  check("eight new kinds", GET_APP_EVENTS, ["getapp_open", "install_accepted", "install_dismissed", "getapp_got_it", "home_ask_shown", "home_ask_how", "home_ask_x", "card_open_app"]);
  check("each stores only its kind (no device id, no extras)", GET_APP_EVENTS.map((e) => measureRow({ event: e, title: "Lioness", category: "tv", clientId: "anon_x" }, "anon_x")), GET_APP_EVENTS.map((e) => ({ kind: e })));
  check("an unknown event is refused", measureRow({ event: "getapp_whatever" }, "anon_x"), null);
  const sql = src("docs/sql/2026-11-22_s41-get-app-counts.sql");
  check("the migration allows exactly these kinds and forbids a device id on them", GET_APP_EVENTS.every((e) => sql.includes(`'${e}'`)) && sql.includes("measure_events_getapp_no_device"), true);
  const now = Date.parse("2026-11-24T15:00:00Z");
  const mrows = ["getapp_open", "getapp_open", "install_accepted", "getapp_got_it", "home_ask_shown", "home_ask_x", "card_open_app"].map((k) => ({ kind: k, lane: null, origin: null, category: null, picks: null, ms: null, client_id: null, created_at: "2026-11-23T18:00:00Z" }));
  const b3 = readout.computeBlock3(mrows, [], { since: "2026-11-10", now, exclude: new Set() });
  const wk = b3[readout.weekOf("2026-11-23T18:00:00Z")];
  check("stats Block 3 counts them by week", [wk.getapp_open, wk.install_accepted, wk.getapp_got_it, wk.home_ask_shown, wk.home_ask_x, wk.card_open_app, wk.home_ask_how], [2, 1, 1, 1, 1, 1, 0]);
  const b3o = readout.computeBlock3(mrows, [], { since: "2026-11-10", now, exclude: new Set(["anon_house"]) });
  check("…no 'outside the house' view (they hold no device)", b3o[readout.weekOf("2026-11-23T18:00:00Z")].getapp_open, null);
  check("…labeled on the page", readout.BLOCK3_LABELS.map((l) => l[0]).filter((k) => GET_APP_EVENTS.includes(k)).length, 8);
  check("home-screen launches stay counted as before", src("app/api/stats/route.ts").includes('["installs", "Installs (home-screen launches)"]') && pg.includes('kind: "standalone_launch"'), true);

  out("\n6. H3 — Open Rekomendr in the app (source)");
  const open = pg.slice(pg.indexOf("const openCardFromLink"), pg.indexOf("// S4b — arrival:"));
  check("starts Compare to off and a fresh set", [open.includes("startCompareOff();"), open.includes("clearMlt();")], [true, true]);
  check("a movie/show opens as a More like this set (seed = the title, unchecked)", /const seed: MltSeed \| null = anchor\.media\s*\?/.test(open) && open.includes("setMltSeed(seed);"), true);
  check("its picks are the standalone More like this five", open.includes("fetchTypedReks(anchor.media, null, true)"), true);
  check("a bottle opens as the wine anchor (Compare to checked by the typed-bottle default)", open.includes('resolveTypedAnchor(name, "Wine")') && open.includes("shown = { ...anchor, wine: typed.wine, results: typed.results };"), true);
  check("Recent gets 'More like [Title]'", open.includes('draftOf("mlt", `More like ${name}`)') && open.includes("rememberSet("), true);
  check("the ask after the picks: browser only (getAppAskDue), only with picks", open.includes("if (shownList(shown).length > 0 && getAppAskDue()) setCardAskFor(askOn);"), true);
  check("'From [Name]' rides from /api/card/open to the anchor", [src("app/api/card/open/route.ts").includes("from: card.sender_name ?? null,"), src("src/components/RekSnapResults.tsx").includes("fromLine={result.from ? fromLabel(result.from) : undefined}")], [true, true]);
  check("the after-picks line: approved wording", [src("src/components/GetAppLine.tsx").includes('"Like it? Put Rekomendr on your home screen."'), src("src/components/GetAppLine.tsx").includes('"Get the app"')], [true, true]);
  check("nothing new is recorded about the person on open", src("app/api/card/open/route.ts").includes("recordCardEvent"), false);

  out("\n7. Wine Compare to: same color first");
  const rowsW = [{ name: "Kim Crawford Sauvignon Blanc" }, { name: "Josh Cellars Cabernet Sauvignon" }, { name: "Mystery Bottle 2021" }, { name: "Whispering Angel Rosé" }, { name: "Meiomi Pinot Noir" }, { name: "La Marca Prosecco" }];
  const g = wine.sortByColor(rowsW, "red");
  check("red result: reds and unknowns first (their order kept), the rest after", [g.first.map((r) => r.name), g.other.map((r) => r.name)], [["Josh Cellars Cabernet Sauvignon", "Mystery Bottle 2021", "Meiomi Pinot Noir"], ["Kim Crawford Sauvignon Blanc", "Whispering Angel Rosé", "La Marca Prosecco"]]);
  check("colors read from the label words", ["Caymus Cabernet", "Santa Margherita Pinot Grigio", "Chandon Brut Rosé", "Taylor Fladgate 10 Year Tawny Port", "Miraval Rosé", "Bonanza"].map((n) => wine.wineColorOf(n)), ["red", "white", "sparkling", "dessert", "rose", "red"]);
  check("unknown result color: nothing moves", wine.sortByColor(rowsW, null).other.length, 0);
  check("the result's color reads its category, then name, then description", wine.wineColorOf("Mystery Bottle", "red wine", "pairs with a white fish"), "red");
  const sheetSrc = src("src/components/WineCompareSheet.tsx");
  check("'Other styles' label before the rest, on every tab", [wine.OTHER_STYLES, sheetSrc.includes("const grouped = sortByColor(tabRows, color);"), sheetSrc.includes("{OTHER_STYLES}")], ["Other styles", true, true]);
  check("nothing is blocked: other-style rows stay pickable", /\{i === otherAt && \([\s\S]*?<\/li>\s*\)\}\s*<li>/.test(sheetSrc) && !/otherAt[^\n]*disabled/.test(sheetSrc), true);

  out(`\n${pass} passed, ${fail} failed.`);
  fs.rmSync(OUT, { recursive: true, force: true });
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => {
  process.stdout.write(`HARNESS CRASH: ${err?.stack ?? err}\n`);
  process.exit(1);
});
