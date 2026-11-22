#!/usr/bin/env node
/* S41 — Get the app (docs/2026-11-22_get_the_app_launch.md), boards H1–H4.
 * Browser check: it needs a running app with the database configured
 * (the shared card page reads one real card, read-only).
 * Run: node scripts/pw-s41-get-app.cjs [baseUrl] [cardId] [prodBase]
 *   cardId   — an existing real shared card (its page is only read)
 *   prodBase — optional: compare the card's text against that host's page
 * No AI spend and no writes: /api/card/open, /api/anchor, /api/signals,
 * /api/card/event, /api/saved are answered here and every body is recorded.
 */

const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const CARD = process.argv[3] || "";
const PROD = (process.argv[4] || "").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const CID = "anon_agent_s41_pw";

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const SAFARI27 = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1";
const FAKE_CARD = "11111111-2222-4333-8444-555555555555";
const PICKS = ["Arrival", "Coherence", "Primer", "Moon", "Ex Machina"].map((t, i) => ({ name: t, description: `${t} stands on its own.`, category: "Movies", rank: i + 1, year: 2010 + i }));

async function context(browser, viewport, { standalone = false, storage = {} } = {}) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: SAFARI27,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(
    ([cid, st, sa]) => {
      if (sa) {
        const mm = window.matchMedia.bind(window);
        window.matchMedia = (q) => (q.includes("standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
      }
      if (sessionStorage.getItem("s41.seeded")) return;
      sessionStorage.setItem("s41.seeded", "1");
      localStorage.setItem("rekomendr.client_id", cid);
      for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
    },
    [CID, storage, standalone]
  );
  const page = await ctx.newPage();
  const rec = { measure: [], cardEvents: [], anchor: [] };
  await page.route("**/image.tmdb.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/api/signals", (r) => {
    const b = r.request().postDataJSON?.() ?? JSON.parse(r.request().postData() || "{}");
    if (b?.kind === "measure") rec.measure.push(b);
    r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/card/event", (r) => {
    rec.cardEvents.push(JSON.parse(r.request().postData() || "{}"));
    r.fulfill({ status: 204, body: "" });
  });
  await page.route("**/api/saved", (r) => r.fulfill({ json: { ok: true, saved: [], savedWatched: [], watched: [] } }));
  await page.route("**/api/card/open", (r) =>
    r.fulfill({
      json: {
        anchor: {
          detected_item: { name: "Lioness", description: "Cruz Manuelos is recruited to the CIA.", category: "TV Shows" },
          from: "Brad",
          mode: "similar",
          results: { similar: [], uses: [], alternatives: [] },
          media: { kind: "tv", id: 113962, trailerUrl: null, watch: null, availability: null },
        },
      },
    })
  );
  await page.route("**/api/anchor", (r) => {
    rec.anchor.push(r.request().postDataJSON());
    r.fulfill({ json: { reks: PICKS } });
  });
  return { ctx, page, rec };
}

const noScroll = (page) => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1);

(async () => {
  const browser = await chromium.launch();
  try {
    if (CARD) {
      console.log("\nH1 — a real shared card, at 390×844");
      const { ctx, page, rec } = await context(browser, { width: 390, height: 844 });
      const res = await page.goto(`${BASE}/a/${CARD}`, { waitUntil: "networkidle" });
      check("an existing shared card still loads", res.status(), 200);
      check("header: logo, Open Rekomendr, Get the app, the free line", await page.evaluate(() => [!!document.querySelector("header .logo"), document.querySelector("header .hb.primary")?.textContent, document.querySelector("header .getapp")?.textContent, document.querySelector("header .free")?.textContent]), [true, "Open Rekomendr", "Get the app", "Free · no App Store needed · find more like this one"]);
      check("the two buttons sit side by side", await page.evaluate(() => { const a = document.querySelector(".hb.primary").getBoundingClientRect(); const b = document.querySelector(".getapp").getBoundingClientRect(); return Math.abs(a.top - b.top) < 2 && a.right <= b.left; }), true);
      check("Save reads 'Save it for later'", (await page.textContent("a.save")).trim(), "Save it for later");
      check("no horizontal scroll at 390", await page.evaluate(() => document.documentElement.scrollWidth <= 390), true);
      await page.screenshot({ path: "test_s41_h1.png" });
      await page.click("[data-get-app]");
      await page.waitForTimeout(200);
      check("H2: Get the app opens the sheet with Safari 27's steps", await page.evaluate(() => { const s = document.querySelector("[data-ga]"); const ol = s.querySelector('[data-ga-v="ios27"]'); return [s.hasAttribute("hidden"), s.getAttribute("data-variant"), getComputedStyle(ol).display, ol.querySelectorAll("li").length]; }), [false, "ios27", "block", 3]);
      check("…the sheet fits the screen", await page.evaluate(() => document.querySelector(".ga-panel").getBoundingClientRect().top >= 0), true);
      await page.screenshot({ path: "test_s41_h2.png" });
      await page.click(".ga-got");
      check("Got it closes it", await page.evaluate(() => document.querySelector("[data-ga]").hasAttribute("hidden")), true);
      check("counts carry only their kind (getapp_open, getapp_got_it)", rec.measure.map((m) => [m.event, Object.keys(m).sort().join(",")]), [["getapp_open", "clientId,event,kind"], ["getapp_got_it", "clientId,event,kind"]]);
      const text = await page.evaluate(() => [document.querySelector("h1").textContent, ...[...document.querySelectorAll("article p")].map((p) => p.textContent)]);
      if (PROD) {
        const prodPage = await ctx.newPage();
        await prodPage.goto(`${PROD}/a/${CARD}`, { waitUntil: "domcontentloaded" });
        const prodText = await prodPage.evaluate(() => [document.querySelector("h1").textContent, ...[...document.querySelectorAll("article p")].map((p) => p.textContent)]);
        check("the card's text is identical to production's page", text, prodText);
      }
      await ctx.close();

      const sa = await context(browser, { width: 390, height: 844 }, { standalone: false });
      await sa.page.emulateMedia({});
      await sa.ctx.close();
    }

    console.log("\nH1 — standalone hides Get the app");
    if (CARD) {
      const { ctx, page } = await context(browser, { width: 390, height: 844 }, { standalone: true });
      await page.goto(`${BASE}/a/${CARD}`, { waitUntil: "networkidle" });
      check("standalone: Get the app and its line hidden, Open Rekomendr fills the row", await page.evaluate(() => [getComputedStyle(document.querySelector(".getapp")).display, getComputedStyle(document.querySelector(".free")).display, Math.round(document.querySelector(".hb.primary").getBoundingClientRect().width) >= 340]), ["none", "none", true]);
      await ctx.close();
    }

    console.log("\nH3 — Open Rekomendr lands on the anchor");
    {
      const { ctx, page, rec } = await context(browser, { width: 390, height: 844 });
      await page.goto(`${BASE}/?card=${FAKE_CARD}`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="from-line"]', { timeout: 15000 });
      check("'From Brad' over the anchor", (await page.textContent('[data-testid="from-line"]')).trim(), "From Brad");
      await page.waitForSelector('[data-testid="mlt-compare-row"]', { timeout: 15000 });
      check("Compare to [Title] ☐ — unchecked", await page.evaluate(() => { const r = document.querySelector('[data-testid="mlt-compare-row"]'); return [r.textContent.includes("Lioness"), !r.querySelector('[data-vs-line]')]; }), [true, true]);
      check("the picks asked for standalone (mlt) lines", rec.anchor.some((b) => b.action === "reks" && b.mlt === true), true);
      check("no vs. lines on the picks", await page.evaluate(() => document.querySelectorAll("[data-vs-line]").length), 0);
      const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("rekomendr.recent_searches") || "[]").map((e) => e.label));
      check("a Recent entry 'More like Lioness'", recent[0], "More like Lioness");
      check("the card left the address bar", await page.evaluate(() => location.search), "");
      await page.waitForSelector('[data-testid="card-get-app"]', { timeout: 5000 }).catch(() => {});
      check("in the browser: the ask after the picks", await page.isVisible('[data-testid="card-get-app"]'), true);
      check("…and its line reads as approved", (await page.textContent('[data-testid="card-get-app"] span')).trim(), "Like it? Put Rekomendr on your home screen.");
      await page.screenshot({ path: "test_s41_h3.png", fullPage: true });
      await page.click('[data-testid="card-get-app-go"]');
      await page.waitForSelector('[data-testid="get-app-sheet"] .ga-panel');
      check("Get the app on the line opens the sheet", await page.isVisible('[data-testid="get-app-sheet"] .ga-panel'), true);
      await page.click('[data-testid="get-app-sheet"] .ga-got');
      check("opening the card counted nothing new about the person", rec.cardEvents.length, 0);
      await ctx.close();
    }
    {
      const { ctx, page } = await context(browser, { width: 390, height: 844 }, { standalone: true });
      await page.goto(`${BASE}/?card=${FAKE_CARD}`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-testid="mlt-compare-row"]', { timeout: 15000 });
      await page.waitForTimeout(500);
      check("from the home-screen icon: no ask after the picks", await page.isVisible('[data-testid="card-get-app"]'), false);
      await page.click('[data-testid="more-menu"]');
      check("…and no 'Add to Home Screen' in ⋯", await page.isVisible('[data-testid="menu-add-home"]'), false);
      await ctx.close();
    }
    {
      const { ctx, page } = await context(browser, { width: 390, height: 844 }, { standalone: true });
      await page.goto(`${BASE}/?claim=abc.def`, { waitUntil: "networkidle" });
      await page.waitForTimeout(500);
      check("an icon start (standalone + claim) opens home", [await page.isVisible('[data-testid="say-snap-square"]'), await page.evaluate(() => location.search)], [true, ""]);
      await ctx.close();
    }

    console.log("\nH4 — home, asked once");
    const RESULTS = { "rekomendr.had_results": "1" };
    for (const vp of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
      const { ctx, page, rec } = await context(browser, vp, { storage: RESULTS });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      check(`${vp.width}×${vp.height}: the ask in the nudge's place`, [await page.isVisible('[data-testid="home-get-app"]'), await page.isVisible('[data-testid="home-nudge"]')], [true, false]);
      check(`${vp.width}×${vp.height}: home doesn't scroll`, await noScroll(page), true);
      if (vp.height === 844) {
        await page.screenshot({ path: "test_s41_h4.png" });
        check("…counted as shown", rec.measure.map((m) => m.event), ["home_ask_shown"]);
        await page.click('[data-testid="home-get-app-x"]');
        const st = await page.evaluate(() => JSON.parse(localStorage.getItem("rekomendr.get_app_ask")));
        check("× is remembered (one dismissal)", st.n, 1);
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForTimeout(300);
        check("…and the next visit doesn't ask (14 days)", await page.isVisible('[data-testid="home-get-app"]'), false);
        await page.click('[data-testid="more-menu"]');
        check("⋯ has 'Add to Home Screen' in the browser", await page.isVisible('[data-testid="menu-add-home"]'), true);
        await page.click('[data-testid="menu-add-home"]');
        await page.waitForSelector('[data-testid="get-app-sheet"] .ga-panel', { timeout: 5000 }).catch(() => {});
        check("…which opens the sheet", await page.isVisible('[data-testid="get-app-sheet"] .ga-panel'), true);
      }
      await ctx.close();
    }
    {
      const { ctx, page } = await context(browser, { width: 390, height: 844 });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      check("no search with results yet: no ask", await page.isVisible('[data-testid="home-get-app"]'), false);
      await ctx.close();
    }
    {
      const { ctx, page } = await context(browser, { width: 390, height: 844 }, { storage: { ...RESULTS, "rekomendr.get_app_ask": JSON.stringify({ n: 3, at: 0 }) } });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      check("three dismissals: never again", await page.isVisible('[data-testid="home-get-app"]'), false);
      await ctx.close();
    }
    {
      const { ctx, page } = await context(browser, { width: 390, height: 844 }, { standalone: true, storage: RESULTS });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);
      check("from the home-screen icon: never asked", await page.isVisible('[data-testid="home-get-app"]'), false);
      await ctx.close();
    }
    {
      const entry = {
        id: "s41-watch",
        kind: "voice",
        label: "“x”",
        category: "Movies",
        at: new Date(Date.now() - 5 * 3600_000).toISOString(),
        picks: ["A", "B", "C", "D", "E"].map((t, i) => ({ title: t, year: 2000 + i, tmdbId: i, posterPath: `/p${i}.jpg`, category: "Movies" })),
        restore: { lane: "search", reks: [], header: null, mltSeed: null, screen: null, last: null, slot: null },
        facts: {},
      };
      const { ctx, page } = await context(browser, { width: 390, height: 844 }, { storage: { ...RESULTS, "rekomendr.recent_searches": JSON.stringify([entry]) } });
      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      check("'Did you watch one of these?' wins; the ask waits", [await page.isVisible('[data-testid="watch-ask"]'), await page.isVisible('[data-testid="home-get-app"]')], [true, false]);
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
