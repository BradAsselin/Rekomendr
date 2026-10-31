#!/usr/bin/env node
/* S33 — the re-roll ("+ More like this" on the typed title itself) follows
 * the same rule for Movies/TV/Books: standalone lines, "Compare to [Title]"
 * unchecked, checking adds "vs. [Title]:" with no re-run. Built on S32's
 * harness (below). S32 — "+ More like this" on a card under a snapped or typed title follows
 * S31's More like this rule (Brad, 2026-10-31): the new five are pursued
 * from the tapped card with standalone lines, the Compare to row names
 * that card, unchecked; checking adds "vs. [Title]:" (no re-ranking),
 * unchecking takes the lines away; a second chain names the new card.
 * Browser check, not a harness: it needs a running app.
 * Run: node scripts/pw-s33-reroll.cjs [baseUrl]
 *   A Vercel preview needs VERCEL_AUTOMATION_BYPASS_SECRET in the environment.
 * No AI spend, no writes: every model route and every write is stubbed.
 * The typed anchor itself is the real /api/anchor "open" (TMDb only). */

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

const COMPARING = [/^\s*same\b/i, /\btrad(e|es|ing)\b[^.!?]*\bfor\b/i, /\bswaps?\b[^.!?]*\bfor\b/i, /\binstead of\b/i, /\brather than\b/i, /\b\w+er than\b/i];
const compares = (t) => COMPARING.some((re) => re.test(t));

const now = new Date().toISOString();
const SEED = `
  try {
    localStorage.setItem("rekomendr.go_tos", JSON.stringify([
      { category: "movies", name: "Heat", year: 1995, tmdbKind: "movie", tmdbId: 949, genreIds: [80], at: "${now}" },
    ]));
    localStorage.setItem("rekomendr.recent", JSON.stringify([
      { category: "Movies", title: "Heat", year: 1995, tmdbId: 949, posterPath: null, seasons: null, at: "${now}" },
    ]));
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
  const log = { reks: [], lines: [], chains: [] };
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
        reks: ["Ronin", "Collateral", "Thief", "Sicario", "Drive"].map((n, i) => ({
          name: n, description: `${n} follows a crew planning one last job.`, long: `${n} overview.`, year: 1981 + i, category: "movies", rank: i + 1,
        })),
      });
    }
    if (p === "/api/reksnap" && body.chain) {
      log.chains.push(body.chain);
      const k = log.chains.length;
      return json({
        reks: ["Blue Ruin", "Wind River", "Hell or High Water", "The Town", "Mud"].map((n) => ({
          name: `${n} ${k}`, description: `A drifter takes a job driving cash across the county ${k}. The money is marked. Played cold and patient.`, category: "movies",
        })),
      });
    }
    if (p === "/api/slots" && body.action === "lines") {
      log.lines.push(body);
      return json({ ok: true, lines: body.items.map((i) => ({ title: i.title, short: `The vs. line for ${i.title}.`, vsGoTo: body.refs[0].name })) });
    }
    return json({ ok: false });
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  return { ctx, page, log };
}

const leads = (page) => page.locator("[data-vs-line] span").allTextContents();
const chainBtn = (page) => page.getByRole("button", { name: "+ More like this" });
const drifter = /A drifter takes a job/;

const chainAndCheck = async (page, log, label) => {
  const before = log.chains.length;
  await chainBtn(page).first().click();
  await page.getByText(drifter).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  const c = log.chains[before];
  check(`${label}: the chain asks for standalone lines`, [log.chains.length, c && c.kind, c && c.standalone], [before + 1, "steer", true]);
  return c;
};

(async () => {
  const browser = await chromium.launch();

  console.log("\nTyped title (a starred go-to) → + More like this on the title itself");
  {
    const { ctx, page, log } = await newPage(browser);
    await page.locator("form input").fill("Heat");
    await page.locator("form input").press("Enter");
    await page.getByText(/follows a crew/).first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(800);
    check("a typed title is not More like this: no row", await page.getByTestId("mlt-compare-row").count(), 0);
    // The anchor's button renders first (above the cards).
    await chainBtn(page).first().click();
    await page.getByText(drifter).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const c = log.chains[0];
    check("the re-roll asks for standalone lines", [log.chains.length, c && c.kind, c && c.standalone], [1, "reroll", true]);
    const row = page.getByTestId("mlt-compare-row");
    check("the row names the title, unchecked", [await row.getByTestId("compare-open").innerText(), await row.getByTestId("compare-open").getAttribute("aria-pressed")], ["Compare to Heat", "false"]);
    check("no vs. lines by default", [await page.locator("[data-vs-line]").count(), log.lines.length], [0, 0]);
    check("descriptions carry no comparison phrasing", (await page.getByText(drifter).allTextContents()).filter(compares), []);
    const order = await page.getByText(drifter).allTextContents();
    await row.getByTestId("compare-open").click();
    await page.waitForTimeout(800);
    check("checking asks for lines against the title", log.lines.map((b) => [b.category, b.refs.map((r) => r.name)]), [["Movies", ["Heat"]]]);
    const L = await leads(page);
    check('each card gets "vs. your Heat:" (a starred go-to)', L.length >= 5 && L.every((l) => l.trim() === "vs. your Heat:"), true);
    check("…no re-ranking: no new re-roll", log.chains.length, 1);
    await row.getByTestId("compare-remove").click();
    await page.waitForTimeout(300);
    check("unchecking removes the lines; the five are as they were", [await page.locator("[data-vs-line]").count(), await page.getByText(drifter).allTextContents()], [0, order]);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
