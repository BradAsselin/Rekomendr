#!/usr/bin/env node
/* S26b — wine Compare to (Brad's S25 brief, items 4–7): off by default,
 * the shelf's top card, the This shelf tab, picking a shelf bottle, and
 * the single-bottle exception. Browser check, not a harness: it needs a
 * running app.
 * Run: node scripts/pw-s26b-shelf.cjs [baseUrl]
 *   baseUrl defaults to http://localhost:3000. A Vercel preview needs
 *   VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend: /api/reksnap answers from scripts/fixtures/s26b-wine.json
 * (a stored shelf snap, streamed as the route streams it). */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "s26b-wine.json"), "utf8"));
FX.shelfFinal.wine.shelf = FX.shelf.map((b) => ({ ...b, talkerPoints: null, talkerSource: null, staffPick: false }));

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

// In-page fetch stub for /api/reksnap: a photo snap streams the fixture's
// shelf line, waits, then the final line; a wine re-run answers with the
// compare fixture. Every request body is kept for the checks.
const STUB = (fx) => `
  window.__fx = ${JSON.stringify(fx)};
  window.__snapCalls = [];
  window.__wineCalls = [];
  window.__snapKind = "shelf";
  window.__hold = 1200;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("/api/reksnap")) return realFetch(input, init);
    const body = JSON.parse((init && init.body) || "{}");
    const fx = window.__fx;
    if (body.wine) {
      window.__wineCalls.push(body.wine);
      await new Promise((r) => setTimeout(r, 300));
      return new Response(JSON.stringify(fx.compare), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (body.backfill || body.chain || body.anchorDetail) {
      return new Response(JSON.stringify({ error: "stub" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    window.__snapCalls.push(body);
    const enc = new TextEncoder();
    const single = window.__snapKind === "single";
    const hold = window.__hold;
    const stream = new ReadableStream({
      async start(c) {
        await new Promise((r) => setTimeout(r, hold));
        if (!single) {
          c.enqueue(enc.encode(JSON.stringify({ type: "shelf", scene: "shelf", bottles: fx.shelf }) + "\\n"));
          await new Promise((r) => setTimeout(r, hold));
        }
        c.enqueue(enc.encode(JSON.stringify({ type: "final", status: 200, body: single ? fx.singleFinal : fx.shelfFinal }) + "\\n"));
        c.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } });
  };
  // Brad's case: one starred favorite, a sweet Riesling.
  try {
    localStorage.setItem("rekomendr.wine_favorite", JSON.stringify({ name: "Dr. Loosen Dr. L Riesling", description: null, dry: 4, body: 2 }));
  } catch {}
`;

// A 1×1 PNG: the stub never looks at it.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");

// SHOTS=<dir> saves a screenshot at each stage.
const SHOTS = process.env.SHOTS || "";
const shot = async (page, name) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `s26b-${name}.png`), fullPage: true });
};

const ringLefts = (page) =>
  page.locator("[data-testid=taste-ring]").evaluateAll((els) => els.map((e) => e.style.left));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(STUB(FX));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.locator("form button").first().click();
  await page.locator('button:text-is("Wine")').click();
  await page.waitForTimeout(300);

  console.log("1. Shelf snap: reading");
  await page.locator('input[type="file"]').setInputFiles({ name: "shelf.png", mimeType: "image/png", buffer: PNG });
  await page.waitForTimeout(500);
  check('"Reading the shelf…" while the shelf is read', (await page.getByTestId("shelf-status").textContent()).trim(), "Reading the shelf…");
  await page.waitForTimeout(1200);
  check('"Reading the shelf… 14 bottles found" once counted', (await page.getByTestId("shelf-status").textContent()).trim(), "Reading the shelf… 14 bottles found");
  check("no pile of bottle pills", await page.getByTestId("shelf-preview").count(), 0);
  check("no bottle names painted while reading", await page.getByText("Monkey Bay Sauvignon Blanc").count(), 0);
  await page.getByTestId("shelf-anchor-card").waitFor({ timeout: 10000 });

  console.log("\n2. The shelf's top card, Compare to off");
  const snapBody = await page.evaluate(() => window.__snapCalls[0]);
  check("the snap sends no comparison reference", snapBody.wineVisit.favorite ?? null, null);
  check("…and the go-to by name only", snapBody.wineVisit.goTo, "Dr. Loosen Dr. L Riesling");
  const anchor = page.getByTestId("shelf-anchor-card");
  check('label "This shelf · most popular"', (await anchor.locator("div").first().textContent()).trim(), "This shelf · most popular");
  check("bottle name and price", [await anchor.getByText("Kim Crawford Sauvignon Blanc").count() > 0, /\$14\.99/.test(await anchor.textContent())], [true, true]);
  check("one short line about the shelf", await anchor.locator("p").first().textContent(), "Dry and zesty — grapefruit and cut grass with a sharp, mouthwatering finish.");
  check("no star, save or thumb buttons on it", await anchor.locator("button").count(), 0);
  check("taste bars: this wine's dot, no orange ring", [await anchor.locator(".bg-\\[\\#1E3A8A\\]").count() >= 2, await anchor.getByTestId("taste-ring").count()], [true, 0]);
  check('"Your 5 from this shelf" row', await page.getByText("Your 5 from this shelf").isVisible(), true);
  check('"Compare to ☐" unchecked', [await page.getByTestId("compare-open").isVisible(), await page.getByTestId("compare-chip").count()], [true, 0]);
  check("five picks, no vs. lines", [await page.locator("[data-rek-title], .space-y-3 > div").count() >= 5, await page.locator("[data-vs-line]").count()], [true, 0]);
  check("no orange rings anywhere (the Riesling is not compared)", await page.getByTestId("taste-ring").count(), 0);
  check('no "your" legend line', await page.getByText(/your Dr\. Loosen/).count(), 0);
  const startFive = await page.locator(".space-y-3 > div span.font-semibold, .space-y-3 > div a.font-semibold").allTextContents();

  await shot(page, "1-shelf-start");
  console.log("\n3. This shelf tab");
  await page.getByTestId("compare-open").click();
  const sheet = page.getByTestId("compare-sheet");
  await sheet.waitFor();
  check('first tab "This shelf 14", selected', [((await page.getByTestId("compare-tab-Shelf").textContent()) || "").replace(/\s+/g, " ").trim(), await page.getByTestId("compare-tab-Shelf").getAttribute("aria-selected")], ["This shelf 14", "true"]);
  check("then Favorites · Recent · Saved", await sheet.locator("[role=tab]").evaluateAll((els) => els.slice(1).map((e) => e.textContent.trim())), ["Favorites", "Recent", "Saved"]);
  check("helper line", await page.getByTestId("shelf-help").textContent(), "Every bottle we read in your shelf photo. Pick one you know.");
  const rowNames = await sheet.locator("[data-testid=compare-row] span.font-medium").allTextContents();
  check("every bottle read, in shelf order", rowNames, FX.shelf.map((b) => b.name));
  check("each with its tag price", (await sheet.locator("[data-testid=compare-row]").nth(1).textContent()).includes("$12.99"), true);
  check("check circles, none checked", await sheet.locator("[data-testid=compare-row][aria-checked=true]").count(), 0);

  await shot(page, "2-this-shelf-tab");
  console.log("\n4. Picking a shelf bottle");
  await sheet.locator("[data-testid=compare-row]", { hasText: "Oyster Bay Sauvignon Blanc" }).click();
  await page.getByTestId("compare-done").click();
  await page.getByTestId("wine-compare-card").waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const call = await page.evaluate(() => window.__wineCalls[window.__wineCalls.length - 1]);
  check("re-runs the five against the picked bottle", [call.kind, call.favorite && call.favorite.name], ["set", "Oyster Bay Sauvignon Blanc"]);
  check("the five on screen may come back (not in the no-repeat list)", startFive.some((n) => call.seen.includes(n)), false);
  const card = page.getByTestId("wine-compare-card");
  check('top card: "Comparing to · from this shelf"', (await card.locator("div").first().textContent()).trim(), "Comparing to · from this shelf");
  check("…the picked bottle, amber outline, ×", [await card.getByText("Oyster Bay Sauvignon Blanc").count() > 0, /border-amber-500/.test(await card.getAttribute("class")), await page.getByTestId("wine-compare-clear").isVisible()], [true, true, true]);
  check("the most-popular card is gone", await page.getByTestId("shelf-anchor-card").count(), 0);
  check('chip "vs. Oyster Bay ×" and "+"', [((await page.getByTestId("compare-chip").textContent()) || "").trim(), await page.getByTestId("compare-add").isVisible()], ["vs. Oyster Bay", true]);
  const vs = await page.locator("[data-vs-line] span").allTextContents();
  check("each of the five gets a vs. line", [vs.length, vs.every((t) => t.startsWith("vs. Oyster Bay:"))], [5, true]);
  const lefts = await ringLefts(page);
  check("orange rings on every pick's bars", lefts.length >= 10, true);
  check("…at the picked bottle's position (3 of 5 → 50%)", lefts.every((l) => l === "50%"), true);

  await shot(page, "3-comparing");
  console.log("\n5. × restores the start state");
  await page.getByTestId("wine-compare-clear").click();
  await page.waitForTimeout(500);
  check("the most-popular card is back", await page.getByTestId("shelf-anchor-card").isVisible(), true);
  check("vs. lines and orange rings removed", [await page.locator("[data-vs-line]").count(), await page.getByTestId("taste-ring").count()], [0, 0]);
  check("the five from before", await page.locator(".space-y-3 > div span.font-semibold, .space-y-3 > div a.font-semibold").allTextContents(), startFive);
  check('"Compare to ☐" again', await page.getByTestId("compare-open").isVisible(), true);
  await page.getByTestId("compare-open").click();
  check("the bottle is still in the This shelf list", await page.getByTestId("compare-sheet").locator("[data-testid=compare-row]", { hasText: "Oyster Bay Sauvignon Blanc" }).count(), 1);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  console.log("\n6. Single-bottle snap auto-references");
  await page.evaluate(() => {
    window.__snapKind = "single";
    window.__hold = 300;
  });
  await page.locator('input[type="file"]').setInputFiles({ name: "bottle.png", mimeType: "image/png", buffer: PNG });
  await page.waitForFunction(() => document.body.innerText.includes("La Crema Sonoma Coast Chardonnay"), null, { timeout: 10000 });
  await page.waitForTimeout(300);
  check("no shelf card on a single bottle", await page.getByTestId("shelf-anchor-card").count(), 0);
  check('the snapped bottle is the reference: chip "vs. Kendall-Jackson Vintner\'s ×"', ((await page.getByTestId("compare-chip").textContent()) || "").trim(), "vs. Kendall-Jackson Vintner's");
  const svs = await page.locator("[data-vs-line] span").allTextContents();
  check("each pick reads vs. the snapped bottle", [svs.length, svs.every((t) => t.startsWith("vs. Kendall-Jackson Vintner's:"))], [3, true]);
  check("orange rings at the snapped bottle's position", (await ringLefts(page)).length >= 6, true);
  await shot(page, "4-single-bottle");
  await page.getByTestId("compare-remove").click();
  await page.waitForTimeout(300);
  check("× undoes it: no lines, no rings", [await page.locator("[data-vs-line]").count(), await page.getByTestId("taste-ring").count()], [0, 0]);
  check("no page errors", errors, []);

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
