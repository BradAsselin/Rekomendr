#!/usr/bin/env node
/* S28c — home balance fix (docs/S28_HOME_BALANCE_FIX.md): Say it / Snap it
 * are back and fill the rest of the screen, ⋯ alone top-right, the logo
 * centered and larger.
 * Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s28c-home.cjs [baseUrl]
 *   baseUrl defaults to http://localhost:3000. A Vercel preview needs
 *   VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend: nothing here searches. */

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

// The cause of the bug: a snap earlier in the session (sessionStorage) hid
// the pair on every later load. Seeded on every page here.
const PRIOR_SNAP = `try { sessionStorage.setItem("rekomendr.snap_count", "1"); } catch {}`;

async function newPage(browser, viewport, { priorSnap }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  if (priorSnap) await ctx.addInitScript(PRIOR_SNAP);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

const pickCategory = async (page, c) => {
  await page.locator("form button").first().click();
  await page.locator(`button:text-is("${c}")`).click();
  await page.waitForTimeout(250);
};

const MIN = { 844: 150, 667: 120 };

(async () => {
  const browser = await chromium.launch();

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 375, height: 667 },
  ]) {
    for (const priorSnap of [false, true]) {
      const { ctx, page } = await newPage(browser, viewport, { priorSnap });
      console.log(`\n${viewport.width}×${viewport.height}${priorSnap ? ", after a snap this session" : ""}`);
      for (const c of ["Movies", "TV Shows", "Books", "Wine"]) {
        if (c !== "Movies") await pickCategory(page, c);
        for (const id of ["say-it", "snap-it"]) {
          const el = page.getByTestId(id);
          const vis = (await el.count()) === 1 && (await el.isVisible());
          const bb = vis ? await el.boundingBox() : null;
          check(`${c}: ${id} visible`, vis, true);
          check(`${c}: ${id} inside the viewport`, !!bb && bb.y >= 0 && bb.y + bb.height <= viewport.height && bb.x >= 0 && bb.x + bb.width <= viewport.width, true);
          check(`${c}: ${id} at least ${MIN[viewport.height]}px tall (${bb && Math.round(bb.height)})`, !!bb && bb.height >= MIN[viewport.height], true);
        }
        const logo = await page.getByTestId("home-wordmark").boundingBox();
        const mid = logo.x + logo.width / 2;
        check(`${c}: logo centered ±4px (center ${mid.toFixed(1)})`, Math.abs(mid - viewport.width / 2) <= 4, true);
        const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
        check(`${c}: no page scroll (${m.sh} ≤ ${m.ih})`, m.sh <= m.ih, true);
        const powered = await page.getByText("powered by Reks Ray™").boundingBox();
        check(`${c}: powered by Reks Ray™ at the bottom, on screen`, !!powered && powered.y + powered.height <= viewport.height && powered.y > (await page.getByTestId("say-it").boundingBox()).y, true);
      }
      await ctx.close();
    }
  }

  console.log("\nOrder and spacing (390×844)");
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, { priorSnap: false });
    const more = await page.getByTestId("more-menu").boundingBox();
    const logo = await page.getByTestId("home-wordmark").boundingBox();
    const tiles = await page.getByTestId("topbar-tiles").boundingBox();
    const form = await page.locator("form").first().boundingBox();
    const chips = await page.getByTestId("genre-row").boundingBox();
    const say = await page.getByTestId("say-it").boundingBox();
    const snap = await page.getByTestId("snap-it").boundingBox();
    check("⋯ alone top-right, labeled More options", [more.x > 300, more.y < 20, await page.getByTestId("more-menu").getAttribute("aria-label")], [true, true, "More options"]);
    check("logo on its own row under ⋯", logo.y >= more.y + more.height - 2, true);
    check("logo about 34px", await page.getByTestId("home-wordmark").evaluate((e) => getComputedStyle(e).fontSize), "34px");
    check("logo blue and bold as the original", await page.getByTestId("home-wordmark").evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).fontWeight]), ["rgb(45, 90, 181)", "700"]);
    check(`room under the logo ~20–24px (${Math.round(tiles.y - (logo.y + logo.height))})`, tiles.y - (logo.y + logo.height) >= 16 && tiles.y - (logo.y + logo.height) <= 28, true);
    // Measured from the tiles' own edges (the grid box carries 8px padding).
    const tileBottom = await page.locator("[data-testid=topbar-tiles] > button").first().evaluate((e) => e.getBoundingClientRect().bottom);
    check(`gap tiles → search ~24px (${Math.round(form.y - tileBottom)})`, Math.abs(form.y - tileBottom - 24) <= 4, true);
    check("order: tiles, search, chips, Say it / Snap it", tiles.y < form.y && form.y + form.height <= chips.y && chips.y + chips.height <= say.y, true);
    check("Say it / Snap it side by side, same size", [Math.abs(say.y - snap.y) < 1, say.x + say.width <= snap.x, Math.abs(say.height - snap.height) < 1], [true, true, true]);
    await ctx.close();
  }

  console.log("\nShort screen shrink (375×667)");
  {
    const { ctx, page } = await newPage(browser, { width: 375, height: 667 }, { priorSnap: false });
    check("logo about 26px", await page.getByTestId("home-wordmark").evaluate((e) => getComputedStyle(e).fontSize), "26px");
    await ctx.close();
  }

  console.log("\nHome after a snap, coming back by the logo (390×844)");
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, { priorSnap: true });
    await page.getByTestId("home-wordmark").click();
    await page.waitForTimeout(400);
    check("still on home with Say it / Snap it", [new URL(page.url()).pathname, await page.getByTestId("say-it").isVisible(), await page.getByTestId("snap-it").isVisible()], ["/", true, true]);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
