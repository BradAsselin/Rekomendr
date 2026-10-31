#!/usr/bin/env node
/* S30 — the lists' hint line and row chevrons (Brad, 2026-10-31):
 * Favorites · Watched · Recent · Saved each open on "Tap any title for more
 * like it, or to share it.", every row ends in a small gray ›, the row
 * still opens the card, and Favorites rows lost "+ More like this".
 * Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s30-list-hints.cjs [baseUrl]
 *   A Vercel preview needs VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend, no writes: /api/saved is stubbed and every other API POST is answered by a stub. */

const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const HINT = "Tap any title for more like it, or to share it.";

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

const now = new Date().toISOString();
const SEED = (lists) => `
  try {
    if (${lists}) {
      localStorage.setItem("rekomendr.go_tos", JSON.stringify([
        { category: "movies", name: "Arrival", year: 2016, tmdbKind: "movie", tmdbId: 329865, genreIds: [878], at: "${now}" },
        { category: "books", name: "Piranesi", year: 2020, tmdbKind: null, tmdbId: null, genreIds: [], at: "${now}" },
      ]));
      localStorage.setItem("rekomendr.recent", JSON.stringify([
        { category: "TV Shows", title: "Severance", year: 2022, tmdbId: 95396, posterPath: null, seasons: null, at: "${now}" },
        { category: "Movies", title: "Heat", year: 1995, tmdbId: 949, posterPath: null, seasons: null, at: "${now}" },
      ]));
    }
  } catch {}
  window.__opened = [];
  window.addEventListener("rekomendr:open-saved-item", (e) => window.__opened.push(e.detail));
`;

const savedRows = (cat, title, year) => ({ category: cat, title, year, created_at: now });

async function newPage(browser, { lists }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(SEED(lists));
  const page = await ctx.newPage();
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/saved") {
      const body = lists
        ? {
            ok: true,
            saved: [{ category: "Movies", title: "Alien", year: 1979, at: now, rawCategories: ["movies"] }],
            watched: [{ category: "Books", title: "Dune", year: 1965, at: now, rawCategories: ["books"] }],
            savedWatched: [],
          }
        : { ok: true, saved: [], watched: [], savedWatched: [] };
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    // Every other API call is answered here: nothing reaches a model or the database.
    if (req.method() === "POST") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, mapped: false, closest: [] }) });
    }
    return route.continue();
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

const openTab = async (page, t) => {
  if (await page.getByTestId("saved-page").count()) {
    await page.getByTestId("saved-page").locator(`button:has-text("${t}")`).first().click();
  } else {
    await page.getByTestId(`topbar-${t}`).click();
  }
  await page.waitForTimeout(300);
};

(async () => {
  void savedRows;
  const browser = await chromium.launch();

  console.log("\nWith items in every list");
  {
    const { ctx, page } = await newPage(browser, { lists: true });
    for (const t of ["Favorites", "Watched", "Recent", "Saved"]) {
      await openTab(page, t);
      const sheet = page.getByTestId("saved-page");
      const hint = sheet.getByTestId("saved-hint");
      check(`${t}: one hint line, the approved wording`, [await hint.count(), await hint.count() ? await hint.innerText() : null], [1, HINT]);
      const style = await hint.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).color]);
      check(`${t}: small gray`, style, ["13px", "rgb(107, 114, 128)"]);
      const hintBox = await hint.boundingBox();
      const items = sheet.getByTestId("saved-item");
      const n = await items.count();
      const firstItem = await items.first().boundingBox();
      check(`${t}: hint at the top, above the rows`, n > 0 && hintBox.y < firstItem.y, true);
      const chevrons = sheet.getByTestId("saved-chevron");
      check(`${t}: a › on every row (${n} rows)`, await chevrons.count(), n);
      const rowsEndInChevron = await sheet.locator("li").evaluateAll((lis) =>
        lis.map((li) => {
          const c = li.querySelector("[data-testid=saved-chevron]");
          if (!c) return false;
          const cr = c.getBoundingClientRect();
          return [...li.querySelectorAll("*")].every((el) => el === c || c.contains(el) || el.contains(c) || el.getBoundingClientRect().right <= cr.right + 0.5);
        })
      );
      check(`${t}: the › is at the right end of each row`, rowsEndInChevron.every(Boolean) && rowsEndInChevron.length === n, true);
      check(`${t}: › small and gray`, await chevrons.first().evaluate((e) => [Math.round(e.querySelector("svg").getBoundingClientRect().width), getComputedStyle(e).color]), [16, "rgb(156, 163, 175)"]);
    }
    await openTab(page, "Favorites");
    check("Favorites: no + More like this", await page.getByTestId("saved-page").getByText("More like this").count(), 0);
    check("Favorites: the star control stays", await page.getByTestId("saved-page").locator("li").first().locator("button[aria-pressed=true], button[aria-label]").count() > 0, true);

    // The title opens the card, as before (counted: false).
    await page.getByTestId("saved-page").getByTestId("saved-item").first().click();
    await page.waitForTimeout(300);
    check("tapping the title closes the sheet and opens the card", [await page.getByTestId("saved-page").count(), await page.evaluate(() => window.__opened.map((d) => [d.target.name, d.counted]))], [0, [["Arrival", false]]]);

    // The › opens the same card.
    await openTab(page, "Favorites");
    await page.getByTestId("saved-page").getByTestId("saved-chevron").first().click();
    await page.waitForTimeout(300);
    check("tapping the › opens the same card", [await page.getByTestId("saved-page").count(), await page.evaluate(() => window.__opened.slice(1).map((d) => [d.target.name, d.counted]))], [0, [["Arrival", false]]]);

    // Recent: the whole row (title, category, ›) is one button.
    await openTab(page, "Recent");
    check("Recent: the › sits inside the row's button", await page.getByTestId("saved-page").locator("[data-testid=recent-list] button [data-testid=saved-chevron]").count(), 2);
    await page.getByTestId("saved-page").getByTestId("saved-chevron").first().click();
    await page.waitForTimeout(300);
    check("Recent: tapping the › opens the card", await page.evaluate(() => window.__opened.slice(2).map((d) => d.target.name)), ["Severance"]);
    await ctx.close();
  }

  console.log("\nEmpty lists");
  {
    const { ctx, page } = await newPage(browser, { lists: false });
    for (const t of ["Favorites", "Watched", "Recent", "Saved"]) {
      await openTab(page, t);
      check(`${t}: no hint over an empty list`, await page.getByTestId("saved-page").getByTestId("saved-hint").count(), 0);
    }
    await openTab(page, "Favorites");
    check("Favorites' empty line unchanged", await page.getByTestId("saved-empty").innerText(), "No favorites yet. Tap ☆ on a card you love.");
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
