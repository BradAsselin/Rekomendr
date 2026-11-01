#!/usr/bin/env node
/* S31 — Compare to on More like this results (Brad, 2026-10-31).
 * For a More like this set (a Saved-page row, or "+ More like this" on a
 * search card): the Compare to row names the tapped title, unchecked; the
 * cards carry no "vs." lines; checking adds "vs. [Title]:" to each card
 * (no re-ranking); unchecking takes them away; "+" opens the sheet; a new
 * search drops the choice. Wine: off by default, blue dot only until checked.
 * Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s31-mlt.cjs [baseUrl]
 *   A Vercel preview needs VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend, no writes: every model route and every write is stubbed.
 * The Movies anchor itself is the real /api/anchor "open" (TMDb only). */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "s26b-wine.json"), "utf8"));

let passed = 0;
let failed = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
}

// Brad's named phrasings: no card text may carry them.
const COMPARING = [/^\s*same\b/i, /\btrad(e|es|ing)\b[^.!?]*\bfor\b/i, /\bswaps?\b[^.!?]*\bfor\b/i, /\binstead of\b/i, /\brather than\b/i, /\b\w+er than\b/i];
const compares = (t) => COMPARING.some((re) => re.test(t));

const now = new Date().toISOString();
const SEED = `
  try {
    localStorage.setItem("rekomendr.go_tos", JSON.stringify([
      { category: "movies", name: "Arrival", year: 2016, tmdbKind: "movie", tmdbId: 329865, genreIds: [878], at: "${now}" },
      { category: "books", name: "Piranesi", year: 2020, tmdbKind: null, tmdbId: null, genreIds: [], at: "${now}" },
    ]));
    localStorage.setItem("rekomendr.recent", JSON.stringify([
      { category: "Movies", title: "Heat", year: 1995, tmdbId: 949, posterPath: null, seasons: null, at: "${now}" },
    ]));
    localStorage.setItem("rekomendr.wine_favorite", JSON.stringify({ name: "Kendall-Jackson Vintner's Reserve Chardonnay", description: null, dry: 3, body: 4 }));
    // A stored Compare to set from an earlier search: More like this must not use it.
    localStorage.setItem("rekomendr.compare_to", JSON.stringify({ category: "Movies", refs: [{ category: "Movies", name: "Lioness", year: 2023, tmdbKind: "tv", tmdbId: null, posterPath: null, at: "${now}" }] }));
  } catch {}
`;

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(SEED);
  const page = await ctx.newPage();
  const log = { reks: [], lines: [], prompts: [], wine: [] };
  let round = 0;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (req.method() !== "POST") return route.continue();
    const body = JSON.parse(req.postData() || "{}");
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/api/anchor" && (body.action === "open" || body.action === "resolve")) return route.continue(); // TMDb, no model
    if (p === "/api/anchor" && body.action === "reks") {
      log.reks.push(body);
      return json({
        reks: ["Contact", "Annihilation", "Interstellar", "Moon", "Sunshine"].map((n, i) => ({
          name: n, description: `${n} follows a scientist who hears something in the static.`, long: `${n} overview.`, year: 1997 + i, category: "movies", rank: i + 1,
        })),
      });
    }
    if (p === "/api/slots" && body.action === "lines") {
      log.lines.push(body);
      return json({ ok: true, lines: body.items.map((i) => ({ title: i.title, short: `The vs. line for ${i.title}.`, vsGoTo: body.refs[0].name })) });
    }
    if (p === "/api/openai") {
      log.prompts.push(body.prompt);
      round++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(["The Library", "The Archive", "The Lantern", "The Ferry", "The Atlas", "The Orchard"].map((t) => ({
          title: `${t} ${round}`, year: 2019, short: `A keeper finds a door in ${t}. The door is warm. You'll read the last page twice.`, long: "A slow read. One for a quiet Sunday.", genre: "Fiction", vibeTags: [],
        }))),
      });
    }
    if (p === "/api/reksnap" && body.typed) {
      log.wine.push(body);
      return json(FX.singleFinal);
    }
    return json({ ok: false });
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page, log };
}

const openRow = async (page, tab, title) => {
  await page.getByTestId(`topbar-${tab}`).click();
  await page.waitForTimeout(300);
  await page.getByTestId("saved-page").getByTestId("saved-item").filter({ hasText: title }).first().click();
};
const leads = (page) => page.locator("[data-vs-line] span").allTextContents();
const cardTexts = (page) => page.locator("[data-vs-line], p.leading-relaxed").allTextContents();

(async () => {
  const browser = await chromium.launch();

  console.log("\nMovies — Favorites row → Arrival");
  {
    const { ctx, page, log } = await newPage(browser);
    await openRow(page, "Favorites", "Arrival");
    await page.getByText(/follows a scientist/).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    check("the five are asked for as More like this (standalone lines)", log.reks.map((b) => b.mlt), [true]);
    const row = page.getByTestId("mlt-compare-row");
    check("Compare to row names the title, unchecked", [await row.getByTestId("compare-open").innerText(), await row.getByTestId("compare-open").getAttribute("aria-pressed")], ["Compare to Arrival", "false"]);
    check("no vs. lines by default (the stored Lioness set doesn't apply)", [await page.locator("[data-vs-line]").count(), log.lines.length], [0, 0]);
    check("descriptions carry no comparison phrasing", (await page.getByText(/follows a scientist/).allTextContents()).filter(compares), []);
    const order = await page.getByText(/follows a scientist/).allTextContents();
    await row.getByTestId("compare-open").click();
    await page.waitForTimeout(800);
    check("checking asks for lines against the tapped title only", log.lines.map((b) => [b.category, b.refs.map((r) => r.name)]), [["Movies", ["Arrival"]]]);
    check("each card gets the vs. line naming it", (await leads(page)).length >= 5 && (await leads(page)).every((l) => /^vs\. (your )?Arrival:$/.test(l.trim())), true);
    check("…no re-ranking: no new five were asked for", log.reks.length, 1);
    check("the row shows the chip and +", [await row.getByTestId("compare-chip").innerText(), await row.getByTestId("compare-add").count()], ["vs. Arrival", 1]);
    await row.getByTestId("compare-remove").click();
    await page.waitForTimeout(300);
    check("unchecking removes the lines; the five are as they were", [await page.locator("[data-vs-line]").count(), await page.getByText(/follows a scientist/).allTextContents()], [0, order]);
    check("…and the row is back to Compare to Arrival", await row.getByTestId("compare-open").innerText(), "Compare to Arrival");
    await row.getByTestId("compare-open").click();
    await page.waitForTimeout(300);
    await row.getByTestId("compare-add").click();
    await page.waitForTimeout(400);
    check("+ opens the Compare to sheet, as it does now", await page.getByTestId("compare-sheet").count(), 1);
    await ctx.close();
  }

  console.log("\nMovies — Recent row → Heat (not a favorite)");
  {
    const { ctx, page, log } = await newPage(browser);
    await openRow(page, "Recent", "Heat");
    await page.getByText(/follows a scientist/).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(400);
    await page.getByTestId("mlt-compare-row").getByTestId("compare-open").click();
    await page.waitForTimeout(800);
    check("lines read vs. Heat:", [...new Set((await leads(page)).map((l) => l.trim()))], ["vs. Heat:"]);
    check("…asked once, mlt set", [log.lines.length, log.reks[0].mlt], [1, true]);
    // A new search drops the choice.
    await page.getByTestId("home-wordmark").click();
    await page.waitForTimeout(400);
    await page.locator("form input").fill("Contact");
    await page.locator("form input").press("Enter");
    const asked = log.reks.length;
    await page.waitForFunction(() => document.body.innerText.includes("follows a scientist"), null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // S36 (charter §2.14) — a typed title now follows S31's rule itself:
    // standalone lines, its own unchecked "Compare to [Title]", the old
    // set's choice dropped.
    check("a new search (a typed title) asks for its own standalone five", [log.reks.length > asked, log.reks.at(-1)?.mlt], [true, true]);
    check("…and its row names the typed title, unchecked", [await page.getByTestId("mlt-compare-row").getByTestId("compare-open").innerText(), await page.getByTestId("mlt-compare-row").getByTestId("compare-open").getAttribute("aria-pressed")], ["Compare to Contact", "false"]);
    await ctx.close();
  }

  console.log("\nBooks — Favorites row → Piranesi, then + More like this on a card");
  {
    const { ctx, page, log } = await newPage(browser);
    await openRow(page, "Favorites", "Piranesi");
    await page.getByText(/^The Library \d+/).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1500);
    const btn = page.getByTestId("compare-open");
    check("Compare to Piranesi, unchecked", [await btn.innerText(), await btn.getAttribute("aria-pressed")], ["Compare to Piranesi", "false"]);
    check("no vs. lines by default", await page.locator("[data-vs-line]").count(), 0);
    const promptsBefore = log.prompts.length;
    await btn.click();
    await page.waitForTimeout(800);
    check("checking: lines against Piranesi for Books", log.lines.map((b) => [b.category, b.refs.map((r) => r.name)]), [["Books", ["Piranesi"]]]);
    check("each card leads vs. your Piranesi:", (await leads(page)).length >= 5 && (await leads(page)).every((l) => l.trim() === "vs. your Piranesi:"), true);
    check("…no new search ran", log.prompts.length, promptsBefore);
    await page.getByTestId("compare-remove").click();
    await page.waitForTimeout(300);
    check("unchecking removes them", await page.locator("[data-vs-line]").count(), 0);

    // "+ More like this" on the first card.
    // The first frontier card's title ("The Library 1 (2019)" → "The Library 1").
    const first = (await page.getByText(/^The (Library|Archive|Lantern|Ferry|Atlas|Orchard) \d+ \(2019\)$/).first().innerText()).trim().replace(/ \(2019\)$/, "");
    const beforeMlt = log.prompts.length;
    await page.getByRole("button", { name: /More like this/ }).first().click();
    await page.waitForTimeout(3000);
    const prompt = log.prompts.at(-1);
    check("the card's set is seeded on it", prompt.includes(`Seed title:\n${first}`), true);
    check("…with no placement instruction", [prompt.includes("THE PLACEMENT"), prompt.includes("Comparative referent")], [false, false]);
    check("its row names the tapped card, unchecked", [await page.getByTestId("compare-open").innerText(), await page.getByTestId("compare-open").getAttribute("aria-pressed")], [`Compare to ${first}`, "false"]);
    check("descriptions carry no comparison phrasing", (await page.getByText(/A keeper finds a door/).allTextContents()).filter(compares), []);
    await page.getByTestId("compare-open").click();
    await page.waitForTimeout(800);
    check("checking: vs. lines naming the card", [...new Set((await leads(page)).map((l) => l.trim()))], [`vs. ${first}:`]);
    await ctx.close();
  }

  console.log("\nWine — Favorites row → the go-to bottle");
  {
    const { ctx, page, log } = await newPage(browser);
    await openRow(page, "Favorites", "Kendall-Jackson");
    await page.getByText("La Crema Sonoma Coast Chardonnay").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    const row = page.getByTestId("wine-compare-row");
    check("the typed bottle ran", log.wine.length, 1);
    const open = row.getByTestId("compare-open");
    check("Compare to [Bottle], unchecked", [(await open.innerText()).startsWith("Compare to Kendall"), await open.getAttribute("aria-pressed")], [true, "false"]);
    check("off by default: no vs. lines, no orange rings (blue dot only)", [await page.locator("[data-vs-line]").count(), await page.getByTestId("taste-ring").count()], [0, 0]);
    await open.click();
    await page.waitForTimeout(400);
    check("checking: vs. lines and orange rings, no re-run", [await page.locator("[data-vs-line]").count() >= 3, await page.getByTestId("taste-ring").count() > 0, log.wine.length], [true, true, 1]);
    await row.getByTestId("compare-remove").click();
    await page.waitForTimeout(400);
    check("unchecking: back to blue dots only", [await page.locator("[data-vs-line]").count(), await page.getByTestId("taste-ring").count()], [0, 0]);

    // A typed bottle that isn't More like this keeps S26b's auto-compare.
    await page.getByTestId("home-wordmark").click();
    await page.waitForTimeout(400);
    await page.locator("form input").fill("Kendall-Jackson Chardonnay");
    await page.locator("form input").press("Enter");
    await page.getByText("La Crema Sonoma Coast Chardonnay").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(500);
    check("a typed bottle (not More like this) still compares to itself", await page.locator("[data-vs-line]").count() >= 3, true);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
