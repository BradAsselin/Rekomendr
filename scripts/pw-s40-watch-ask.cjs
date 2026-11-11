#!/usr/bin/env node
/* S40 — "Did you watch one of these?" on home (docs/2026-11-10_measure_launch.md B).
 * Browser check: it needs a running app.
 * Run: node scripts/pw-s40-watch-ask.cjs [baseUrl]   (default http://localhost:3000)
 * No AI spend and no real writes: /api/saved, /api/signals and
 * /api/signals/watched are answered here and every body is recorded. */

const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const CID = "anon_agent_s40_pw";

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const TITLES = ["Arrival", "Coherence", "Primer", "Moon", "Ex Machina"];

const entry = (id, ageHours, category = "Movies") => ({
  id,
  kind: "voice",
  label: "“something smart”",
  category,
  at: new Date(Date.now() - ageHours * 3600_000).toISOString(),
  picks: TITLES.map((t, i) => ({ title: t, year: 2010 + i, tmdbId: 100 + i, posterPath: `/p${i}.jpg`, category })),
  restore: { lane: "search", reks: [], header: null, mltSeed: null, screen: null, last: null, slot: null },
  facts: {},
});

async function open(browser, viewport, { entries, watched = [] }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  const page = await ctx.newPage();
  const rec = { measure: [], watched: [], saved: 0 };
  await page.route("**/image.tmdb.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/api/saved", (r) => {
    rec.saved++;
    r.fulfill({ json: { ok: true, saved: [], savedWatched: [], watched: watched.map((t) => ({ title: t, category: "Movies" })) } });
  });
  await page.route("**/api/signals/watched", (r) => {
    rec.watched.push({ method: r.request().method(), body: r.request().postDataJSON() });
    r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/signals", (r) => {
    const b = r.request().postDataJSON();
    if (b?.kind === "measure") rec.measure.push(b);
    r.fulfill({ json: { ok: true } });
  });
  // The device's storage is set once, before the app's first script runs
  // (a reload later in a check keeps what the app wrote).
  await ctx.addInitScript(
    ([cid, list]) => {
      if (sessionStorage.getItem("s40.seeded")) return;
      sessionStorage.setItem("s40.seeded", "1");
      localStorage.setItem("rekomendr.client_id", cid);
      localStorage.setItem("rekomendr.recent_searches", JSON.stringify(list));
      localStorage.removeItem("rekomendr.watch_ask");
    },
    [CID, entries]
  );
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.getByTestId("say-snap-square").waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
  return { ctx, page, rec };
}

const noScroll = (page) => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);

(async () => {
  const browser = await chromium.launch();

  for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
    console.log(`\n${viewport.width}×${viewport.height} — a Movies search 4 hours old, nothing watched`);
    const { ctx, page, rec } = await open(browser, viewport, { entries: [entry("e4", 4)] });
    const ask = page.getByTestId("watch-ask");
    check("the line shows, in place of the tips", [await ask.count(), await page.getByTestId("home-nudge").count(), await page.getByTestId("home-nudge-dots").count()], [1, 0, 0]);
    check("approved wording", [await ask.locator("p").innerText(), await page.getByTestId("watch-ask-not-yet").innerText()], ["Did you watch one of these?", "Not yet"]);
    check("five posters, each named for a screen reader", await page.getByTestId("watch-ask-poster").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label"))), TITLES);
    check("home does not scroll", await noScroll(page), true);
    const sq = await page.getByTestId("say-snap-square").boundingBox();
    const box = await ask.boundingBox();
    const powered = await page.getByText("powered by Reks Ray™").boundingBox();
    check("under the square, Reks Ray line last and on screen", box.y >= sq.y + sq.height && powered.y >= box.y + box.height && powered.y + powered.height <= viewport.height, true);
    check("asked counted once, nothing else sent", rec.measure, [{ clientId: CID, kind: "measure", event: "nudge_asked" }]);
    await ctx.close();
  }

  console.log("\nA poster tap (390×844)");
  {
    const { ctx, page, rec } = await open(browser, { width: 390, height: 844 }, { entries: [entry("e5", 5)] });
    await page.getByTestId("watch-ask-poster").nth(1).click();
    await page.waitForTimeout(600);
    check("one Watched mark, for that title", rec.watched.map((w) => [w.method, w.body.title, w.body.category]), [["POST", "Coherence", "Movies"]]);
    check("the usual toast with Undo", (await page.getByTestId("watched-toast").innerText()).replace(/\s+/g, " "), "Watched · Undo");
    check("the line goes back to the tips", [await page.getByTestId("watch-ask").count(), await page.getByTestId("home-nudge").count()], [0, 1]);
    check("counts: asked, then poster", rec.measure.map((m) => m.event), ["nudge_asked", "nudge_poster"]);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    check("never twice for the same search", [await page.getByTestId("watch-ask").count(), rec.measure.length], [0, 2]);
    await ctx.close();
  }

  console.log("\n\"Not yet\" (375×667)");
  {
    const { ctx, page, rec } = await open(browser, { width: 375, height: 667 }, { entries: [entry("e6", 30)] });
    await page.getByTestId("watch-ask-not-yet").click();
    await page.waitForTimeout(500);
    check("nothing sent beyond the count", rec.measure.slice(1), [{ clientId: CID, kind: "measure", event: "nudge_not_yet" }]);
    check("no Watched mark", rec.watched.length, 0);
    check("the tips come back", await page.getByTestId("home-nudge").count(), 1);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    check("never twice", await page.getByTestId("watch-ask").count(), 0);
    await ctx.close();
  }

  console.log("\nOutside the window, or already watched");
  for (const [name, opts] of [
    ["2 hours old → not asked", { entries: [entry("a", 2)] }],
    ["8 days old → not asked", { entries: [entry("b", 24 * 8)] }],
    ["one of the five already Watched → not asked", { entries: [entry("c", 6)], watched: ["Primer"] }],
    ["a Wine search → not asked", { entries: [entry("d", 6, "Wine")] }],
  ]) {
    const { ctx, page, rec } = await open(browser, { width: 390, height: 844 }, opts);
    check(name, [await page.getByTestId("watch-ask").count(), await page.getByTestId("home-nudge").count(), rec.measure.length], [0, 1, 0]);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
