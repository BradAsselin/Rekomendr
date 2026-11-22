#!/usr/bin/env node
/* S42 — Books get the Movies/TV card (docs/2026-11-22_books_card_launch.md).
 * Browser check, no AI spend and no writes: the model, the cover lookup,
 * the lists and every signal are answered here, and their bodies recorded.
 * Run: node scripts/pw-s42-books.cjs [baseUrl]
 */
const { chromium } = require("playwright");

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
let passed = 0;
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? passed++ : failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  (got ${JSON.stringify(got)}, expected ${JSON.stringify(want)})`}`);
};
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const BOOKS = ["Magpie Murders", "No Cover Here", "The Maid", "Arsenic and Adobo", "The Guest List", "Dial A for Aunties"];
const now = new Date().toISOString();

async function open(browser, viewport = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(`
    if (!sessionStorage.getItem("s42.seeded")) {
      sessionStorage.setItem("s42.seeded", "1");
      localStorage.setItem("rekomendr.client_id", "anon_agent_s42_pw");
      localStorage.setItem("rekomendr.go_tos", JSON.stringify([
        { category: "books", name: "Piranesi", year: 2020, tmdbKind: null, tmdbId: null, genreIds: [], at: "${now}" },
      ]));
    }
  `);
  const page = await ctx.newPage();
  const log = { covers: [], watched: [], signals: [], prompts: 0 };
  await page.route("**/covers.openlibrary.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (req.method() !== "POST") return route.continue();
    const body = JSON.parse(req.postData() || "{}");
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/api/openai") {
      log.prompts++;
      return json(BOOKS.map((t, i) => ({ title: t, year: 2015 + i, short: `A keeper finds a door in ${t}. The door is warm. You'll read the last page twice.`, long: "A slow read.", genre: "Mystery • Cozy", vibeTags: ["Cozy"] })));
    }
    if (p === "/api/covers") {
      log.covers.push(body);
      return json({ ok: true, covers: body.items.map((it) => ({ title: it.title, coverUrl: it.title === "No Cover Here" ? null : `https://covers.openlibrary.org/b/id/${it.title.length}-M.jpg`, author: it.title === "No Cover Here" ? null : `Author of ${it.title}` })) });
    }
    if (p === "/api/signals/watched") {
      log.watched.push(body);
      return json({ ok: true });
    }
    if (p === "/api/signals") {
      log.signals.push(body);
      return json({ ok: true });
    }
    if (p === "/api/saved") {
      return json({ ok: true, saved: [], savedWatched: [], watched: [{ category: "Books", title: "Rebecca", year: 1938, rawCategories: ["Books"] }, { category: "Movies", title: "Heat", year: 1995, rawCategories: ["Movies"] }] });
    }
    return json({ ok: false });
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(600);
  return { ctx, page, log };
}

const pickCategory = async (page, c) => {
  await page.locator("form button").filter({ hasText: /^(Movies|TV Shows|Books|Wine)$/ }).first().click();
  await page.getByRole("button", { name: c, exact: true }).last().click();
  await page.waitForTimeout(250);
};

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("\nA Books result — the Movies/TV card");
    const { ctx, page, log } = await open(browser);
    await page.getByTestId("topbar-Favorites").click();
    await page.waitForTimeout(300);
    await page.getByTestId("saved-page").getByTestId("saved-item").filter({ hasText: "Piranesi" }).first().click();
    await page.getByText("Magpie Murders (2015)").first().waitFor({ timeout: 60000 });
    await page.waitForTimeout(1200);
    const cards = page.locator("[data-rek-title]");
    check("six cards' worth of titles came back (five shown)", (await cards.count()) >= 5, true);
    const first = page.locator("div.rounded-2xl", { has: page.getByText("Magpie Murders (2015)") }).last();
    check("the cover sits on the left, poster size (76×114, rounded)", await first.locator("img[data-poster]").evaluate((img) => { const b = img.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height), img.src.startsWith("https://covers.openlibrary.org/b/id/"), img.referrerPolicy]; }), [76, 114, true, "no-referrer"]);
    check("the author in the meta line", (await first.innerText()).includes("Author of Magpie Murders"), true);
    check("top right: ☆, Save, ×", [await first.getByRole("button", { name: "Make this my go-to" }).count(), await first.getByRole("button", { name: "Save", exact: true }).count(), await first.getByRole("button", { name: "Not for me" }).count()], [1, 1, 1]);
    check("no thumbs on any book card", await page.getByRole("button", { name: /Thumbs (up|down)/ }).count(), 0);
    check("no tag line above the title (Movies/TV have none)", await page.getByText("Mystery • Cozy").count(), 0);
    check("+ More like this and Show details on the card", [await first.getByText("+ More like this").count(), await first.getByText("Show details").count()], [1, 1]);
    check("the pill reads Read it, labeled Mark as read", [(await first.getByTestId("watched").innerText()).trim(), await first.getByTestId("watched").getAttribute("aria-label")], ["Read it", "Mark as read"]);
    check("the cover lookup sent each book's title (and year, kept on the server) only", log.covers.flatMap((b) => b.items.map((i) => Object.keys(i).sort().join(","))).every((k) => k === "title,year"), true);
    const noCover = page.locator("div.rounded-2xl", { has: page.getByText("No Cover Here (2016)") }).last();
    check("a miss keeps the poster placeholder (no image, same box)", [await noCover.locator("img[data-poster]").count(), await noCover.locator("div.h-\\[114px\\]").count()], [0, 1]);
    await page.screenshot({ path: "test_s42_books.png" });

    console.log("\nRead it");
    check("the top tile reads Read in Books", (await page.getByTestId("topbar-Watched").innerText()).replace(/\d/g, "").trim(), "Read");
    await first.getByTestId("watched").click();
    await page.waitForTimeout(400);
    check("one mark written, the same Watched mark (category Books)", log.watched.map((b) => [b.category, b.title]), [["Books", "Magpie Murders"]]);
    check("the toast reads Read · Undo", (await page.getByTestId("undo-toast").innerText()).replace(/\s+/g, " ").trim(), "Read · Undo");
    await page.screenshot({ path: "test_s42_read.png" });
    await page.getByTestId("undo-toast").getByRole("button", { name: "Undo" }).click();
    await page.waitForTimeout(600);
    check("Undo brings the card back", await page.getByText("Magpie Murders (2015)").count() > 0, true);

    console.log("\n× and Save on a book");
    const second = page.locator("div.rounded-2xl", { has: page.getByText("The Maid (2017)") }).last();
    await second.getByRole("button", { name: "Not for me" }).click();
    await page.waitForTimeout(500);
    check("× records 'not for me' (dislike), as on Movies/TV", log.signals.filter((s) => s.kind !== "measure").map((s) => [s.action ?? s.kind, s.title]).filter((x) => x[1] === "The Maid")[0]?.[0], "dislike");
    const third = page.locator("div.rounded-2xl", { has: page.getByText("Arsenic and Adobo (2018)") }).last();
    await third.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForTimeout(500);
    check("Save records a save", log.signals.some((s) => s.action === "save" && s.title === "Arsenic and Adobo"), true);

    console.log("\nThe Watched list in Books, then Movies");
    await page.getByTestId("topbar-Watched").click();
    await page.waitForTimeout(400);
    check("the tab reads Read", await page.getByTestId("saved-page").getByRole("tab", { selected: true }).innerText().then((t) => t.replace(/\d/g, "").trim()), "Read");
    const rows = await page.getByTestId("saved-page").getByTestId("watched").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    check("book rows say Read; a movie row still says Watched", rows, ["Watched", "Read"]);
    await page.getByTestId("saved-page").getByRole("button", { name: "Close" }).click();
    await pickCategory(page, "Movies");
    check("switching to Movies: the tile reads Watched", (await page.getByTestId("topbar-Watched").innerText()).replace(/\d/g, "").trim(), "Watched");
    await pickCategory(page, "Books");
    check("…and back in Books: Read", (await page.getByTestId("topbar-Watched").innerText()).replace(/\d/g, "").trim(), "Read");
    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
