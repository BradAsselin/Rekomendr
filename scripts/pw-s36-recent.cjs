#!/usr/bin/env node
/* S36 — Recent remembers your searches (docs/S35_RECENT_SEARCHES.md), and a
 * typed title follows the S31 rule (charter §2.14).
 * Each search — voice, typed, chips, snap, More like this — leaves one
 * entry in Recent with its label, time and five picks; tapping the entry
 * reopens that set with no request at all; tapping a pick opens its card;
 * an opened pick gets a dot; Clear recent clears both; nothing new is sent.
 * Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s36-recent.cjs [baseUrl]
 *   A Vercel preview needs VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend, no writes: every model route and every write is stubbed. */

const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const VOICE_WORDS = "a drama movie";
const FAKE_SPEECH = `
  window.webkitSpeechRecognition = class {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
    start() {
      setTimeout(() => this.onresult && this.onresult({ results: [[{ transcript: ${JSON.stringify(VOICE_WORDS)} }]] }), 150);
      setTimeout(() => this.onend && this.onend(), 400);
    }
    stop() { this.onend && this.onend(); }
    abort() {}
  };
  window.SpeechRecognition = window.webkitSpeechRecognition;
  try {
    localStorage.setItem("rekomendr.recent", JSON.stringify([
      { category: "Movies", title: "Heat", year: 1995, tmdbId: 949, posterPath: null, seasons: null, at: "2026-10-01T12:00:00.000Z" },
    ]));
  } catch {}
`;

const MOVIES = ["Coherence", "Ex Machina", "The Big Short", "Primer", "The Man from Earth"];
const slotCards = (names, base) =>
  names.map((t, i) => ({
    title: t, year: 2010 + i, tmdbId: base + i, kind: "movie", genreIds: [18], genre: "Drama", slot: i ? "neighbor" : "popular",
    short: `${t}: a small group faces one long night.`, long: `${t} overview.`, vsGoTo: null,
    facts: ["1h 29m", "on Prime Video"], posterPath: `/p${base + i}.jpg`,
  }));
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  const log = { api: [], slots: [], lines: [], reks: [], voice: [] };
  let bookRound = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const raw = req.postData() || "";
    log.api.push({ p, raw });
    if (req.method() !== "POST") return route.continue();
    const body = JSON.parse(raw || "{}");
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/api/mood" && /Arrival/.test(body.transcript || "")) {
      return json({
        ok: true, moodId: null, transcript: body.transcript, category: "Movies",
        mapped: true, lane: { label: "Drama", lane: "Drama" }, refiner: null, keywords: [],
        goTo: { name: "Arrival", starred: false, tmdbKind: "movie", tmdbId: 329865 }, price: null, closest: [],
      });
    }
    if (p === "/api/mood") {
      return json({
        ok: true, moodId: "00000000-0000-4000-8000-000000000001", transcript: body.transcript, category: "Movies",
        mapped: true, lane: { label: "Drama", lane: "Drama" }, refiner: null, keywords: [], goTo: null, price: null, closest: [],
      });
    }
    if (p === "/api/voice") {
      log.voice.push(body);
      return route.fulfill({ status: 204, body: "" });
    }
    if (p === "/api/slots" && body.action === "lines") {
      log.lines.push(body);
      return json({ ok: true, lines: body.items.map((i) => ({ title: i.title, short: `The vs. line for ${i.title}.`, vsGoTo: body.refs[0].name })) });
    }
    if (p === "/api/slots") {
      log.slots.push(body);
      const names = body.lane === "Comedy" ? ["Game Night", "Booksmart", "Palm Springs", "The Nice Guys", "Hot Fuzz"] : MOVIES;
      return json({ ok: true, recipe: "none", steer: null, order: [], reks: slotCards(names, body.lane === "Comedy" ? 500 : 100) });
    }
    if (p === "/api/anchor" && (body.action === "resolve" || body.action === "open")) {
      const name = body.action === "resolve" ? body.text : body.name;
      if (body.action === "resolve" && !/^(Coherence|Heat)$/i.test(name)) return json({ anchor: null });
      return json({
        anchor: {
          detected_item: { name: /heat/i.test(name) ? "Heat" : "Coherence", description: "A dinner party, a comet.", category: "movies", year: 2013 },
          mode: "similar", results: { similar: [], uses: [], alternatives: [] },
          media: { kind: "movie", id: /heat/i.test(name) ? 949 : 220289, trailerUrl: null, watch: null },
        },
      });
    }
    if (p === "/api/anchor" && body.action === "reks") {
      log.reks.push(body);
      return json({
        reks: ["Primer", "Timecrimes", "Triangle", "Predestination", "The One I Love"].map((n, i) => ({
          name: n, description: `${n} follows a few friends through one strange night.`, long: `${n} overview.`, year: 2004 + i, category: "movies", rank: i + 1,
        })),
      });
    }
    if (p === "/api/facts") {
      return json({ facts: (body.items || []).map((it, i) => ({ ...(it.id ? { id: it.id } : { title: it.title }), facts: ["1h 30m"], posterPath: `/f${i}.jpg` })) });
    }
    if (p === "/api/screen") return json({ screen: null });
    if (p === "/api/reksnap") {
      return json({
        detected_item: { name: "Lagavulin 16", description: "An Islay single malt.", category: "whiskey" },
        mode: "similar",
        results: { similar: ["Laphroaig 10", "Ardbeg 10", "Talisker 10", "Caol Ila 12", "Bowmore 12"].map((n, i) => ({ name: n, description: `${n}, smoky.`, category: "whiskey", rank: i + 1 })), uses: [], alternatives: [] },
      });
    }
    if (p === "/api/openai") {
      bookRound++;
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(["The Library", "The Archive", "The Lantern", "The Ferry", "The Atlas", "The Orchard"].map((t) => ({
          title: `${t} ${bookRound}`, year: 2019, short: `A keeper finds a door in ${t}.`, long: "A slow read.", genre: "Fiction", vibeTags: [],
        }))),
      });
    }
    return json({ ok: false });
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page, log };
}

const home = async (page) => {
  await page.getByTestId("home-wordmark").click();
  await page.waitForTimeout(400);
};
const openRecent = async (page) => {
  await page.getByTestId("topbar-Recent").click();
  await page.waitForTimeout(400);
};
const closeSheet = async (page) => {
  await page.getByTestId("saved-page").getByRole("button", { name: "Close" }).click();
  await page.waitForTimeout(300);
};
const entries = (page) =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("rekomendr.recent_searches") || "[]");
    } catch {
      return null;
    }
  });
const pickCategory = async (page, c) => {
  await page.locator("form button").first().click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: c, exact: true }).first().click();
  await page.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch();
  const { ctx, page, log } = await newPage(browser);

  console.log("\nVoice: say it, tap nothing");
  await page.getByTestId("voice-mic").click();
  await page.getByText("Coherence: a small group").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  let list = await entries(page);
  check("one entry, the words in quotes, five picks", [list.length, list[0]?.kind, list[0]?.label, list[0]?.picks.map((p) => p.title)], [1, "voice", `“${VOICE_WORDS}”`, MOVIES]);
  check("…its posters kept with it", list[0]?.picks.every((p) => /^\/p\d+\.jpg$/.test(p.posterPath)), true);
  check("…the voice set was counted as before (shown x5)", log.voice.flatMap((v) => v.events).filter((e) => e.kind === "shown").length, 5);
  await home(page);
  await openRecent(page);
  const row = page.getByTestId("recent-search").first();
  check("Recent shows it first: words, time, five posters", [
    await row.getByTestId("recent-search-label").innerText(),
    /^\d{1,2}:\d{2}\s?(AM|PM)$/.test((await row.getByTestId("recent-search-when").innerText()).trim()),
    await row.getByTestId("recent-pick").count(),
    await row.locator("img").count(),
  ], [`“${VOICE_WORDS}”`, true, 5, 5]);
  check("…the hint line stays", await page.getByTestId("saved-hint").innerText(), "Tap any title for more like it, or to share it.");
  check("…the old title rows are still there", (await page.getByTestId("saved-item").allTextContents()).some((t) => t.includes("Heat")), true);

  console.log("\nTap the entry: the same five, instantly, no request");
  const before = log.api.length;
  await row.getByTestId("recent-search-open").click();
  await page.waitForTimeout(1500);
  const after = log.api.slice(before);
  check("no request of any kind to the app", after.map((a) => a.p), []);
  check("the same five, under the words", [
    await page.getByTestId("results-header").innerText(),
    MOVIES.every(async () => true) && (await page.getByText(/: a small group faces one long night\./).count()) >= 5,
  ], [`“${VOICE_WORDS}”`, true]);
  check("…no second voice 'shown'", log.voice.flatMap((v) => v.events).filter((e) => e.kind === "shown").length, 5);
  check("…and no new entry", (await entries(page)).length, 1);

  console.log("\nOpen a pick in the set: it gets the dot");
  // Show details opens it (a media title itself links out to Google);
  // Ex Machina is the second card.
  await page.getByRole("button", { name: /Show details/ }).nth(1).click();
  await page.waitForTimeout(500);
  await home(page);
  await openRecent(page);
  const dots = await page.getByTestId("recent-search").first().getByTestId("recent-pick").evaluateAll((els) => els.map((e) => !!e.querySelector('[data-testid="recent-pick-opened"]')));
  check("only the opened pick is marked", dots, [false, true, false, false, false]);

  console.log("\nTap the first poster: its card opens");
  await page.getByTestId("recent-search").first().getByTestId("recent-pick").first().click();
  await page.getByText(/follows a few friends/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  check("its card opened (TMDb anchor) and More like this ran", [log.api.some((a) => a.p === "/api/anchor" && a.raw.includes('"action":"open"') && a.raw.includes("Coherence")), log.reks.at(-1)?.mlt], [true, true]);
  check("…the card has its star", await page.locator('[aria-label*="go-to" i], [aria-label*="favorite" i]').count() > 0, true);
  list = await entries(page);
  check("…and that is a search too: \"More like Coherence\"", [list.length, list[0].kind, list[0].label, list[0].picks.length], [2, "mlt", "More like Coherence", 5]);

  console.log("\nTyped title: S31's rule (charter §2.14)");
  await home(page);
  await page.locator("form input").fill("Coherence");
  await page.locator("form input").press("Enter");
  await page.getByText(/follows a few friends/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  check("its five are asked for standalone", log.reks.at(-1)?.mlt, true);
  const mrow = page.getByTestId("mlt-compare-row");
  check("Compare to Coherence ☐ below the anchor, unchecked", [await mrow.getByTestId("compare-open").innerText(), await mrow.getByTestId("compare-open").getAttribute("aria-pressed")], ["Compare to Coherence", "false"]);
  check("no vs. lines by default", await page.locator("[data-vs-line]").count(), 0);
  const order = await page.getByText(/follows a few friends/).allTextContents();
  const reksAsked = log.reks.length;
  await mrow.getByTestId("compare-open").click();
  await page.waitForTimeout(900);
  const leads = await page.locator("[data-vs-line] span").allTextContents();
  check("checking adds vs. Coherence: lines", leads.length >= 5 && leads.every((l) => /^vs\. (your )?Coherence:$/.test(l.trim())), true);
  check("…without re-ranking: no new five asked for", log.reks.length, reksAsked);
  await mrow.getByTestId("compare-remove").click();
  await page.waitForTimeout(300);
  check("unchecking removes them; the five are as they were", [await page.locator("[data-vs-line]").count(), await page.getByText(/follows a few friends/).allTextContents()], [0, order]);
  list = await entries(page);
  check("the typed search is an entry: “Coherence” with five", [list[0].kind, list[0].label, list[0].picks.map((p) => p.title)], ["typed", "“Coherence”", ["Primer", "Timecrimes", "Triangle", "Predestination", "The One I Love"]]);

  console.log("\nA title named in the words (charter §2.14)");
  await home(page);
  const slotsBefore = log.slots.length;
  await page.locator("form input").fill("a drama like Arrival");
  await page.locator("form input").press("Enter");
  await page.getByText("Coherence: a small group").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  const asked = log.slots.slice(slotsBefore).at(-1);
  check("the five are still steered by it, with no line writer", [asked?.steer, asked?.refs?.map((r) => r.name), asked?.lines], ["Arrival", ["Arrival"], false]);
  // The search lane's header row (no snap-lane wrapper).
  const nopen = page.getByTestId("compare-open");
  check("Compare to Arrival ☐, unchecked; no vs. lines", [await nopen.innerText(), await nopen.getAttribute("aria-pressed"), await page.locator("[data-vs-line]").count()], ["Compare to Arrival", "false", 0]);
  const linesBefore = log.lines.length;
  await nopen.click();
  await page.waitForTimeout(900);
  check("checking adds vs. Arrival: lines, no new search", [log.lines.slice(linesBefore).map((b) => b.refs.map((r) => r.name)), log.slots.length - slotsBefore], [[["Arrival"]], 1]);
  list = await entries(page);
  check("…and it is a typed entry", [list[0].kind, list[0].label], ["typed", "“a drama like Arrival”"]);

  console.log("\nChips: a genre, then a vibe");
  await home(page);
  await page.getByTestId("genre-row").getByRole("button", { name: "Comedy", exact: true }).click();
  await page.getByText("Game Night: a small group").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  const vibe = (await page.getByTestId("vibe-row").getByRole("button").first().innerText()).trim();
  await page.getByTestId("vibe-row").getByRole("button").first().click();
  await page.waitForTimeout(1500);
  list = await entries(page);
  check("one chips entry, refined in place: \"Comedy · [vibe]\"", [list.filter((e) => e.kind === "chips").length, list[0].label, list[0].picks.length], [1, `Comedy · ${vibe}`, 5]);

  console.log("\nSnap");
  await home(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "shelf.png", mimeType: "image/png", buffer: PNG });
  await page.getByText("Laphroaig 10").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(600);
  list = await entries(page);
  check("\"Snapped: Lagavulin 16\" with its five", [list[0].kind, list[0].label, list[0].picks.map((p) => p.title)], ["snap", "Snapped: Lagavulin 16", ["Laphroaig 10", "Ardbeg 10", "Talisker 10", "Caol Ila 12", "Bowmore 12"]]);
  await home(page);
  await openRecent(page);
  const snapRow = page.getByTestId("recent-search").first();
  check("…shown as names, with the camera icon's row", [await snapRow.locator("img").count(), await snapRow.getByTestId("recent-pick").count()], [0, 5]);
  const b2 = log.api.length;
  await snapRow.getByTestId("recent-search-open").click();
  await page.waitForTimeout(1200);
  check("reopening the snap: same anchor and five, no request", [await page.getByText("Lagavulin 16").count() > 0, await page.getByText("Talisker 10").count() > 0, log.api.slice(b2).map((a) => a.p)], [true, true, []]);

  console.log("\nReopen the typed title (snap lane, facts kept)");
  await openRecent(page);
  const typedRow = page.getByTestId("recent-search").filter({ hasText: "“Coherence”" }).first();
  const b3 = log.api.length;
  await typedRow.getByTestId("recent-search-open").click();
  await page.waitForTimeout(1500);
  // The one read a Movies/TV card set always makes: this person's own
  // Saved/Watched marks (useServerMarks), so the icons are current.
  // Nothing about the search, no model, not even facts.
  check("same anchor and five; no search, model or facts request", [await page.getByText(/follows a few friends/).count() >= 5, log.api.slice(b3).map((a) => a.p).filter((p) => p !== "/api/saved")], [true, []]);
  check("…only the existing marks read", log.api.slice(b3).every((a) => a.p === "/api/saved" && !/Coherence|Primer/.test(a.raw)), true);
  check("…its Compare to row back, unchecked", await page.getByTestId("mlt-compare-row").getByTestId("compare-open").getAttribute("aria-pressed"), "false");

  console.log("\nMore like this on a card (Books)");
  await home(page);
  await pickCategory(page, "Books");
  await page.locator("form input").fill("a quiet book");
  await page.locator("form input").press("Enter");
  await page.getByText(/^The Library \d+/).first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(1200);
  const first = (await page.getByText(/^The (Library|Archive|Lantern|Ferry|Atlas|Orchard) \d+ \(2019\)$/).first().innerText()).trim().replace(/ \(2019\)$/, "");
  await page.getByRole("button", { name: /More like this/ }).first().click();
  await page.waitForTimeout(3000);
  list = await entries(page);
  check("\"More like [Title]\" with five", [list[0].kind, list[0].label, list[0].picks.length], ["mlt", `More like ${first}`, 5]);
  check("…after its own typed entry", list[1].label, "“a quiet book”");

  console.log("\nNothing new is sent");
  const sent = log.api.filter((a) => /recent_searches|recent-search|“a drama|Snapped:|More like /.test(a.raw));
  check("no request carries an entry, a label or the store", sent.map((a) => a.p), []);

  console.log("\nClear recent clears both");
  await openRecent(page);
  await page.getByTestId("recent-clear").click();
  await page.waitForTimeout(400);
  check("the tab is empty", [await page.getByTestId("recent-search").count(), await page.getByTestId("saved-item").count()], [0, 0]);
  check("…and so is storage", await page.evaluate(() => [localStorage.getItem("rekomendr.recent_searches"), localStorage.getItem("rekomendr.recent")]), [null, null]);
  await closeSheet(page);

  await ctx.close();
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
