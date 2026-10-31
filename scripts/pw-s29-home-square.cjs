#!/usr/bin/env node
/* S29 — home's Say it / Snap it square and the rotating nudge (Brad,
 * 2026-10-31). Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s29-home-square.cjs [baseUrl]
 *   baseUrl defaults to http://localhost:3000. A Vercel preview needs
 *   VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend: the mic is faked and nothing is searched. */

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

const NUDGES = [
  "Try saying ‘a cozy mystery for tonight’",
  "Snap a wine shelf and we’ll pick the best bottle on it",
  "Snap the TV screen to find what’s like it",
  "Say a movie you loved, and we’ll find its cousins",
];

const FAKE_SPEECH = `
  window.__micStarted = 0;
  window.webkitSpeechRecognition = class {
    start() { window.__micStarted++; }
    stop() {}
    abort() {}
  };
  window.SpeechRecognition = window.webkitSpeechRecognition;
`;

async function newPage(browser, viewport, { clock = false } = {}) {
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
  if (clock) await page.clock.install();
  await page.goto(BASE + "/", { waitUntil: clock ? "load" : "networkidle", timeout: 120000 });
  if (clock) await page.getByTestId("say-snap-square").waitFor({ timeout: 60000 });
  else await page.waitForTimeout(800);
  return { ctx, page };
}

const pickCategory = async (page, c) => {
  await page.locator("form button").first().click();
  await page.locator(`button:text-is("${c}")`).click();
  await page.waitForTimeout(250);
};

const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

(async () => {
  const browser = await chromium.launch();

  for (const [viewport, side] of [
    [{ width: 390, height: 844 }, 260],
    [{ width: 375, height: 667 }, 200],
  ]) {
    const { ctx, page } = await newPage(browser, viewport);
    console.log(`\n${viewport.width}×${viewport.height}`);
    for (const c of ["Movies", "TV Shows", "Books", "Wine"]) {
      if (c !== "Movies") await pickCategory(page, c);
      const sq = await page.getByTestId("say-snap-square").boundingBox();
      check(`${c}: square ${side}px (${Math.round(sq.width)}×${Math.round(sq.height)})`, near(sq.width, side) && near(sq.height, side), true);
      check(`${c}: square centered`, near(sq.x + sq.width / 2, viewport.width / 2, 2), true);
      const gap = await page.evaluate(() => {
        const chip = document.querySelector("[data-testid=genre-row] button").getBoundingClientRect().bottom;
        return document.querySelector("[data-testid=say-snap-square]").getBoundingClientRect().top - chip;
      });
      check(`${c}: 48px under the chip row (${Math.round(gap)})`, near(gap, 48), true);
      const m = await page.evaluate(() => ({ sh: document.documentElement.scrollHeight, ih: window.innerHeight }));
      check(`${c}: no page scroll (${m.sh} ≤ ${m.ih})`, m.sh <= m.ih, true);
      const nudge = await page.getByTestId("home-nudge").boundingBox();
      const dots = await page.getByTestId("home-nudge-dots").boundingBox();
      const powered = await page.getByText("powered by Reks Ray™").boundingBox();
      check(`${c}: nudge under the square, dots under it, Reks Ray line last, all on screen`, nudge.y >= sq.y + sq.height && dots.y >= nudge.y + nudge.height && powered.y >= dots.y + dots.height && powered.y + powered.height <= viewport.height, true);
    }
    await ctx.close();
  }

  console.log("\nThe square (390×844)");
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 });
    const style = await page.getByTestId("say-snap-square").evaluate((e) => {
      const s = getComputedStyle(e);
      return { r: s.borderTopLeftRadius, bg: s.backgroundColor, shadow: s.boxShadow !== "none" };
    });
    check("34px corners, the blue, a shadow", style, { r: "34px", bg: "rgb(45, 90, 181)", shadow: true });
    const div = await page.getByTestId("say-snap-divider").evaluate((e) => {
      const r = e.getBoundingClientRect();
      const p = e.parentElement.getBoundingClientRect();
      return { w: r.width, color: getComputedStyle(e).backgroundColor, top: r.top - p.top, bottom: p.bottom - r.bottom, mid: r.left + r.width / 2 - (p.left + p.width / 2) };
    });
    check("divider 1px, white at 35%", [div.w, div.color], [1, "rgba(255, 255, 255, 0.35)"]);
    check("divider inset from top and bottom, in the middle", div.top > 10 && div.bottom > 10 && Math.abs(div.mid) < 1, true);
    const say = await page.getByTestId("say-it").boundingBox();
    const snap = await page.getByTestId("snap-it").boundingBox();
    check("two halves, each a button", [await page.getByTestId("say-it").evaluate((e) => e.tagName), await page.getByTestId("snap-it").evaluate((e) => e.tagName), near(say.width, 130), near(snap.width, 130), say.x < snap.x], ["BUTTON", "BUTTON", true, true, true]);
    check("Say it: mic + label; Snap it: camera + label", [await page.getByTestId("say-it").innerText(), await page.getByTestId("snap-it").innerText(), await page.locator("[data-testid=say-it] svg.lucide-mic").count(), await page.locator("[data-testid=snap-it] svg.lucide-camera").count()], ["Say it", "Snap it", 1, 1]);
    check("the old hint lines are gone", [await page.getByText("Something fun and funny").count(), await page.getByText("A poster, a shelf, the TV").count()], [0, 0]);
    await page.getByTestId("say-it").click();
    await page.waitForTimeout(300);
    check("Say it starts the mic", await page.evaluate(() => window.__micStarted), 1);
    await page.getByTestId("home-wordmark").click();
    await page.waitForTimeout(400);
    const [chooser] = await Promise.all([page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null), page.getByTestId("snap-it").click()]);
    check("Snap it opens the camera picker", !!chooser, true);
    await ctx.close();
  }

  console.log("\nThe nudge (fake clock)");
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, { clock: true });
    const lit = () => page.locator("[data-testid=home-nudge-dots] span").evaluateAll((els) => els.map((e) => e.className.includes("bg-gray-300")));
    const nudge = page.getByTestId("home-nudge");
    check("starts on the first line, first dot lit", [await nudge.innerText(), await lit()], [NUDGES[0], [true, false, false, false]]);
    check("14px gray", await nudge.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).color]), ["14px", "rgb(156, 163, 175)"]);
    await page.clock.runFor(4900);
    check("still the first line at 4.9s", await nudge.innerText(), NUDGES[0]);
    const seen = [];
    for (let i = 1; i <= 4; i++) {
      await page.clock.runFor(i === 1 ? 100 : 5000);
      seen.push([await nudge.innerText(), (await lit()).indexOf(true)]);
    }
    check("rotates every 5s through all four, dot follows, then wraps", seen, [[NUDGES[1], 1], [NUDGES[2], 2], [NUDGES[3], 3], [NUDGES[0], 0]]);
    await ctx.close();
  }

  console.log("\nHeader unchanged (390×844)");
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 });
    const box = async (id) => {
      const b = await page.getByTestId(id).boundingBox();
      return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
    };
    // S28c's measured positions.
    check("⋯, logo and tiles where S28c put them", [await box("more-menu"), await box("home-wordmark"), await box("topbar-tiles")], [[342, 8, 40, 40], [88, 58, 215, 43], [16, 121, 358, 59]]);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
