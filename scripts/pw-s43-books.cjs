#!/usr/bin/env node
/* S43 — Brad's S42 follow-ups, in the browser: a snapped book's cards use
 * the typed-book card; Share on a typed book card mints the card's own line
 * through /api/anchor "book-card"; the empty Read list's line in Books.
 * No AI spend and no writes: every API is answered here and recorded.
 * Run: node scripts/pw-s43-books.cjs [baseUrl]
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
const now = new Date().toISOString();
const TOKEN = { sig: "x".repeat(43), issued_at: Date.now() };

async function open(browser, { watched = [], saved = [] } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS, "x-vercel-set-bypass-cookie": "true" } : {},
  });
  await ctx.addInitScript(`
    if (!sessionStorage.getItem("s43.seeded")) {
      sessionStorage.setItem("s43.seeded", "1");
      localStorage.setItem("rekomendr.client_id", "anon_agent_s43_pw");
      localStorage.setItem("rekomendr.sender_name_asked", "1");
      localStorage.setItem("rekomendr.go_tos", JSON.stringify([
        { category: "books", name: "Piranesi", year: 2020, tmdbKind: null, tmdbId: null, genreIds: [], at: "${now}" },
      ]));
    }
  `);
  const page = await ctx.newPage();
  const log = { covers: [], facts: [], bookCard: [], save: [], share: [] };
  await page.route("**/covers.openlibrary.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (req.method() !== "POST") return route.continue();
    const body = JSON.parse(req.postData() || "{}");
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/api/openai") {
      return json(["Magpie Murders", "The Maid", "Arsenic and Adobo", "The Guest List", "Dial A for Aunties", "Rebecca"].map((t, i) => ({ title: t, year: 2015 + i, short: `The line for ${t}.`, long: "A slow read.", genre: "Mystery", vibeTags: [] })));
    }
    if (p === "/api/covers") {
      log.covers.push(body);
      return json({ ok: true, covers: body.items.map((it) => ({ title: it.title, coverUrl: `https://covers.openlibrary.org/b/id/${it.title.length}-M.jpg`, author: `Author of ${it.title}` })) });
    }
    if (p === "/api/facts") {
      log.facts.push(body);
      return json({ ok: true, facts: [] });
    }
    if (p === "/api/screen") return json({ screen: null });
    if (p === "/api/reksnap") {
      return json({
        detected_item: { name: "Rebecca", description: "A shy companion marries a widower.", category: "books", year: 1938 },
        mode: "similar",
        results: {
          similar: ["Jane Eyre", "The Thirteenth Tale", "My Cousin Rachel", "The Little Stranger", "Wide Sargasso Sea"].map((n, i) => ({ name: n, description: `${n}, a gothic read.`, category: "books", rank: i + 1, year: 1900 + i, token: TOKEN })),
          uses: [],
          alternatives: [],
        },
      });
    }
    if (p === "/api/anchor" && body.action === "book-card") {
      log.bookCard.push(body);
      return json({ ok: true, item: { name: body.title, category: "Books", short: body.short }, token: TOKEN });
    }
    if (p === "/api/save") {
      log.save.push(body);
      return json({ ok: true, id: "11111111-2222-4333-8444-555555555555" });
    }
    if (p === "/api/share") {
      log.share.push(body);
      return json({ ok: true, id: body.id, needsCompletion: false });
    }
    if (p === "/api/saved") return json({ ok: true, saved, savedWatched: [], watched });
    if (p === "/api/signals" || p === "/api/signals/watched") return json({ ok: true });
    return json({ ok: false });
  });
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(600);
  return { ctx, page, log };
}
const cardOf = (page, text) => page.locator("div.rounded-2xl", { has: page.getByText(text, { exact: true }) }).last();

(async () => {
  const browser = await chromium.launch();
  try {
    console.log("\nA snapped book — the typed-book card");
    {
      // A saved MOVIE named like a pick must not light the book card; a saved book does.
      const { ctx, page, log } = await open(browser, { saved: [{ category: "Movies", title: "Jane Eyre", year: 2011, rawCategories: ["Movies"] }, { category: "Books", title: "My Cousin Rachel", year: 1951, rawCategories: ["Books"] }] });
      await page.locator('input[type="file"]').setInputFiles({ name: "book.png", mimeType: "image/png", buffer: PNG });
      await page.getByText("Jane Eyre (1900)").first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(1200);
      const anchor = cardOf(page, "Rebecca (1938)");
      const rek = cardOf(page, "Jane Eyre (1900)");
      check("covers asked of /api/covers (title, year), none of /api/facts", [log.covers.length > 0, log.covers.flatMap((b) => b.items.map((i) => Object.keys(i).sort().join(","))).every((k) => k === "title,year"), log.facts.length], [true, true, 0]);
      check("the anchor: cover, author, ☆ · Save (no ×), Read it, no thumbs", [
        await anchor.locator("img[data-poster]").count(),
        (await anchor.innerText()).includes("Author of Rebecca"),
        await anchor.getByRole("button", { name: "Save", exact: true }).count(),
        await anchor.getByRole("button", { name: "Not for me" }).count(),
        (await anchor.getByTestId("watched").innerText()).trim(),
      ], [1, true, 1, 0, "Read it"]);
      check("a pick: cover 76×114, author, ☆ · Save · ×, Read it", [
        await rek.locator("img[data-poster]").evaluate((i) => [Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height)]),
        (await rek.innerText()).includes("Author of Jane Eyre"),
        await rek.getByRole("button", { name: "Make this my go-to" }).count(),
        await rek.getByRole("button", { name: "Save", exact: true }).count(),
        await rek.getByRole("button", { name: "Not for me" }).count(),
        (await rek.getByTestId("watched").innerText()).trim(),
      ], [[76, 114], true, 1, 1, 1, "Read it"]);
      check("no thumbs anywhere", await page.getByRole("button", { name: /Thumbs (up|down)/ }).count(), 0);
      check("marks: a saved film 'Jane Eyre' doesn't light the book; the saved book does", [
        await rek.getByRole("button", { name: /^Saved?$/ }).getAttribute("aria-pressed"),
        await cardOf(page, "My Cousin Rachel (1902)").getByRole("button", { name: /^Saved?$/ }).getAttribute("aria-pressed"),
      ], ["false", "true"]);
      await rek.getByTestId("watched").click();
      await page.waitForTimeout(300);
      check("Read it → Read · Undo", (await page.getByTestId("undo-toast").innerText()).replace(/\s+/g, " ").trim(), "Read · Undo");
      await page.screenshot({ path: "test_s43_snap.png" });
      await ctx.close();
    }

    console.log("\nShare on a typed book card");
    {
      const { ctx, page, log } = await open(browser);
      await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
      await page.getByTestId("topbar-Favorites").click();
      await page.waitForTimeout(300);
      await page.getByTestId("saved-page").getByTestId("saved-item").filter({ hasText: "Piranesi" }).first().click();
      await page.getByText("Magpie Murders (2015)").first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(1000);
      const card = cardOf(page, "Magpie Murders (2015)");
      check("the book card has Share", await card.getByRole("button", { name: "Share", exact: true }).count(), 1);
      await card.getByRole("button", { name: "Share", exact: true }).click();
      await page.waitForTimeout(1500);
      check("the mint asks for the card's own line, title and year", log.bookCard.map((b) => [b.title, b.short, b.year, b.clientId]), [["Magpie Murders", "The line for Magpie Murders.", 2015, "anon_agent_s43_pw"]]);
      check("…then saves exactly what was signed, as Books", log.save.map((b) => [b.payload.name, b.payload.category, b.payload.short, b.payload.long]), [["Magpie Murders", "Books", "The line for Magpie Murders.", null]]);
      check("…then the share flip", log.share.map((b) => b.action), ["share"]);
      await ctx.close();
    }

    console.log("\nThe empty Read list");
    {
      const { ctx, page } = await open(browser);
      await page.locator("form button").filter({ hasText: /^(Movies|TV Shows|Books|Wine)$/ }).first().click();
      await page.getByRole("button", { name: "Books", exact: true }).last().click();
      await page.waitForTimeout(300);
      await page.getByTestId("topbar-Watched").click();
      await page.waitForTimeout(600);
      check("Books: 'Nothing marked read yet.'", (await page.getByTestId("saved-empty").innerText()).trim(), "Nothing marked read yet.");
      await page.getByTestId("saved-page").getByRole("button", { name: "Close" }).click();
      await page.locator("form button").filter({ hasText: /^(Movies|TV Shows|Books|Wine)$/ }).first().click();
      await page.getByRole("button", { name: "Movies", exact: true }).last().click();
      await page.waitForTimeout(300);
      await page.getByTestId("topbar-Watched").click();
      await page.waitForTimeout(600);
      check("Movies: unchanged", (await page.getByTestId("saved-empty").innerText()).trim(), "Nothing marked watched yet.");
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
