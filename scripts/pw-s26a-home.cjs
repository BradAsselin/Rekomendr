#!/usr/bin/env node
/* S26a — home fits one screen, the top bar's two rows, Go (Brad's S25
 * brief "Home fits one screen, Go button", items 1–3 and 8).
 * Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s26a-home.cjs [baseUrl]
 *   baseUrl defaults to http://localhost:3000. A Vercel preview needs
 *   VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend: every /api/mood and search POST is answered by a stub. */

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

// A speech recognizer that streams words and never ends by itself: Go
// must not wait for the pause.
const FAKE_SPEECH = `
  window.__micStarted = 0;
  window.webkitSpeechRecognition = class {
    constructor() { this.onresult = null; this.onerror = null; this.onend = null; }
    start() {
      window.__micStarted++;
      setTimeout(() => this.onresult && this.onresult({ results: [[{ transcript: "something" }]] }), 150);
      setTimeout(() => this.onresult && this.onresult({ results: [[{ transcript: "something fun and funny" }]] }), 300);
    }
    stop() { window.__micStopped = (window.__micStopped || 0) + 1; }
    abort() {}
  };
  window.SpeechRecognition = window.webkitSpeechRecognition;
`;

async function newPage(browser, viewport) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(FAKE_SPEECH);
  const page = await ctx.newPage();
  const posts = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (req.method() === "POST" && /\/api\/(mood|recs|openai|slots|anchor|reksnap)/.test(path)) {
      posts.push({ path, body: req.postData() || "" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mapped: false, closest: [] }) });
    }
    return route.continue();
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page, posts };
}

const pickCategory = async (page, c) => {
  await page.locator("form button").first().click();
  await page.locator(`button:text-is("${c}")`).click();
  await page.waitForTimeout(250);
};

(async () => {
  const browser = await chromium.launch();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    const { ctx, page } = await newPage(browser, viewport);
    console.log(`\n${viewport.width}×${viewport.height}`);
    for (const c of ["Movies", "TV Shows", "Books", "Wine"]) {
      if (c !== "Movies") await pickCategory(page, c);
      const m = await page.evaluate(() => ({
        sh: document.documentElement.scrollHeight,
        ih: window.innerHeight,
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
      }));
      check(`${c}: home does not scroll (scroll height ${m.sh} ≤ ${m.ih})`, m.sh <= m.ih, true);
      check(`${c}: no sideways page scroll`, m.sw <= m.iw, true);
    }
    await ctx.close();
  }

  console.log("\nTop bar and home (390×844)");
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 });
    const logo = await page.getByTestId("home-wordmark").boundingBox();
    const more = await page.getByTestId("more-menu").boundingBox();
    const tiles = await page.getByTestId("topbar-tiles").boundingBox();
    const form = await page.locator("form").first().boundingBox();
    const chips = await page.getByTestId("genre-row").boundingBox();
    // S28c — ⋯ alone on row 1, the wordmark centered under it.
    check("row 1: ⋯ alone on the right", more.x > 300, true);
    check("wordmark centered under ⋯", [Math.abs(logo.x + logo.width / 2 - 195) <= 4, logo.y >= more.y + more.height - 2], [true, true]);
    check("⋯ is labeled More options", await page.getByTestId("more-menu").getAttribute("aria-label"), "More options");
    check("row 2: the four tiles under the wordmark", tiles.y >= logo.y + logo.height - 2, true);
    check("tiles in order", await page.locator("[data-testid^=topbar-]:not([data-testid=topbar-tiles])").evaluateAll((els) => els.map((e) => e.textContent.replace(/\d+/g, "").trim())), ["Favorites", "Watched", "Recent", "Saved"]);
    check("tile icon colors amber · green · gray · blue", await page.locator("[data-testid=topbar-tiles] svg").evaluateAll((els) => els.map((e) => e.getAttribute("class").match(/text-(amber|emerald|gray|sky)/)?.[1])), ["amber", "emerald", "gray", "sky"]);
    check("row 3: search bar under the tiles", form.y >= tiles.y + tiles.height, true);
    check("row 4: chips under the search bar", chips.y >= form.y + form.height, true);
    check("no big centered wordmark on the page", await page.locator("main").getByText("Rekomendr", { exact: false }).count(), 0);
    check("Say it / Snap it and powered by Reks Ray™", [await page.getByTestId("say-it").isVisible(), await page.getByTestId("snap-it").isVisible(), await page.getByText("powered by Reks Ray™").isVisible()], [true, true, true]);
    check("snap tips gone", await page.getByText("Snap a movie poster").count(), 0);
    const rowH = await page.getByTestId("genre-row").evaluate((el) => ({ clip: el.parentElement.getBoundingClientRect().height, row: el.getBoundingClientRect().height }));
    check("chip row's indicator area is clipped", rowH.clip < rowH.row, true);
    await page.getByTestId("home-wordmark").click();
    check("wordmark tap stays home", new URL(page.url()).pathname, "/");
    await ctx.close();
  }

  console.log("\nGo (390×844)");
  {
    const { ctx, page, posts } = await newPage(browser, { width: 390, height: 844 });
    const go = page.getByTestId("search-go");
    const box = page.locator("form input");
    check("no Go on an empty box", await go.count(), 0);
    await box.fill("cozy");
    check("Go appears with text", await go.isVisible(), true);
    const goBox = await go.boundingBox();
    const formBox = await page.locator("form").first().boundingBox();
    check("Go sits inside the field, right side", goBox.x > formBox.x + formBox.width / 2 && goBox.x + goBox.width <= formBox.x + formBox.width, true);
    await box.fill("");
    check("Go disappears when cleared", await go.count(), 0);
    await box.fill("something clever");
    const before = posts.length;
    await go.click();
    await page.waitForTimeout(600);
    check("tapping Go runs the search", posts.length > before, true);
    check("…the typed words", posts.slice(before).some((p) => p.body.includes("something clever")), true);

    await page.getByTestId("home-wordmark").click();
    await page.waitForTimeout(400);
    await box.fill("thrilling");
    const b2 = posts.length;
    await box.press("Enter");
    await page.waitForTimeout(600);
    check("Enter still runs the search", posts.length > b2 && posts.slice(b2).some((p) => p.body.includes("thrilling")), true);

    await page.getByTestId("home-wordmark").click();
    await page.waitForTimeout(400);
    await page.getByTestId("voice-mic").click();
    await page.waitForTimeout(450);
    check("spoken words stream into the box", await box.inputValue(), "something fun and funny");
    check("Go is tappable while listening", await go.isVisible(), true);
    const b3 = posts.length;
    await go.click();
    await page.waitForTimeout(600);
    check("Go stops listening", await page.evaluate(() => window.__micStopped || 0), 1);
    check("…and runs the spoken mood without waiting", posts.slice(b3).some((p) => p.path === "/api/mood" && p.body.includes("something fun and funny")), true);
    check("mic no longer pressed", await page.getByTestId("voice-mic").getAttribute("aria-pressed"), "false");
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
