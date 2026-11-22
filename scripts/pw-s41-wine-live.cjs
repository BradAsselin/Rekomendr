#!/usr/bin/env node
/* S41 — a real wine card opened in the app ("Open Rekomendr"), live: one
 * typed-bottle model call on the preview. Checks it lands as the wine
 * anchor with "From [Name]", Compare to checked, and a Recent entry
 * (the color sort is covered by validate-s41-get-app). Client id is
 * agent-tagged (excluded from stats).
 * Run: node scripts/pw-s41-wine-live.cjs <baseUrl> <wineCardId>
 */
const { chromium } = require("playwright");
const BASE = (process.argv[2] || "").replace(/\/$/, "");
const CARD = process.argv[3] || "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
let passed = 0;
let failed = 0;
const check = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
};
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(() => {
    if (!localStorage.getItem("rekomendr.client_id")) localStorage.setItem("rekomendr.client_id", "anon_agent_s41_wine_live");
  });
  const page = await ctx.newPage();
  // Counts are not written from this check.
  await page.route("**/api/signals", (r) => r.fulfill({ json: { ok: true } }));
  const t0 = Date.now();
  await page.goto(`${BASE}/?card=${CARD}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="from-line"]', { timeout: 30000 });
  check("'From [Name]' over the wine anchor", /^From \S/.test((await page.textContent('[data-testid="from-line"]')).trim()), true);
  await page.waitForSelector('[data-testid="wine-compare-row"]', { timeout: 120000 }).catch(() => {});
  console.log(`  (picks after ${Math.round((Date.now() - t0) / 1000)} s)`);
  check("the wine Compare to row", await page.isVisible('[data-testid="wine-compare-row"]'), true);
  const row = (await page.textContent('[data-testid="wine-compare-row"]').catch(() => "")) || "";
  console.log(`  row: ${row.trim()}`);
  check("Compare to starts checked (vs. lines on the picks)", (await page.locator("[data-vs-line]").count()) > 0, true);
  const recent = await page.evaluate(() => JSON.parse(localStorage.getItem("rekomendr.recent_searches") || "[]").map((e) => e.label));
  console.log(`  recent: ${recent[0]}`);
  check("a Recent entry 'More like …'", /^More like /.test(recent[0] || ""), true);
  await page.screenshot({ path: "test_s41_wine_live.png", fullPage: true });
  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
