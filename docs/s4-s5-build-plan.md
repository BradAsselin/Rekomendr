# S4 + S5 build plan — the card is the product, then mood chips up front

Written to disk 2026-10-15 from Brad's launch instruction. The S4 and S5 specs below are verbatim. This file is the spec for those sessions (§3.3); where it and an older doc disagree, this one wins, and the charter (§2 invariants, §10, §11, §12) still governs both.

---

## The test (strategy context, Brad, Oct 14 2026)

Rekomendr's wedge is now snap → share → done. The shared card lives in a text thread; people scroll back and tap it again weeks later. The card is the product. The receiver needs no app. Discovery (search, chips, reks) is how people branch out later. We are running a 4–6 week test; the primary metric is receivers who go on to send a card of their own.

**Test definition**
- **Length:** 4–6 weeks from the day S4 reaches production.
- **Primary metric:** receiver → sender conversion — receivers (anon ids that opened a shared card they did not send) who go on to send a card of their own, attributed to the card that brought them in.
- **Supporting readout:** cards sent · unique receivers · reopen rate (opens more than 2 days after send) · receiver → sender conversion · saves · installs (standalone launches).
- **Logged events:** card sent (sender anon id, card id) · each open (receiver anon id, first vs reopen, time since send) · Watch / Trailer / Buy taps · saves · standalone launches · a former receiver's first own share (attributed to the card that brought them in).
- **Readout surfaces:** `docs/sql/test-readout.sql`, plus a simple `/api/stats` or admin-only page.
- **Privacy:** no personal data beyond anon ids and the optional sender name.

---

## S4 — The card is the product (in this order)

Permanent links. Shared cards never expire and are never cleaned up, by policy. Audit anchor_snapshots retention, the token design and any TTL. A card found months later in a text thread must open. Document the policy in the charter's invariants, prepared as a proposed §2 amendment for my approval (do not edit §2 yourself).
Recognizable in the thread. Rework the link preview (og:image, og:title, og:description) so it's unmistakable in iMessage and Android Messages: poster or label art, title, and "from <name>" when a name exists. Check the rendered og image on a preview and include it in the batch.
Sender name. The first time someone taps Share, ask once (one field, skippable): "Your name, so friends know it's from you." Remember it (anon id; local storage plus server). It travels with every card: "from Katrina" on the preview and "Katrina's pick" on the card. Add a way to change it later (small link near Share).
Live where-to-watch. Keep the synopsis fixed in the snapshot. Refresh providers (TMDb watch/providers, US) when the card is opened, with a short cache (about 6–24 h), so a card reopened months later shows where it streams today. If the refresh fails, fall back to the stored providers. Wine: where to buy, if we have it; otherwise unchanged.
One tap to do the thing. A prominent Watch (provider link) / Trailer / Buy action on the card, above the fold on an iPhone.
Save (the bridge). One-tap Save on the card, no sign-in, under the anonymous id. After saving: open the app with that title as the anchor and reks loading.
Add to home screen, after Save only (never on page open): iPhone shows a dismissible coach sheet (Share → Add to Home Screen → Add; note that on newer iOS the Share button can sit behind "⋯"), with an arrow toward the control. Android uses the real install prompt (beforeinstallprompt). Never show it when already running standalone.
iOS separate-storage catch: Safari and the home-screen web app do not share storage. Carry the saved item(s), or a short-lived signed claim token tied to the anon id, in the URL the installed app opens with, and import them on first standalone launch so the saved item is already there. Verify with WebKit and note it for my real-iPhone check.
Test instrumentation + readout. Log: card sent (sender anon id, card id), each open (receiver anon id, first vs reopen, time since send), Watch/Trailer/Buy taps, saves, standalone launches, and a former receiver's first own share (attributed to the card that brought them in). Add docs/sql/test-readout.sql, plus a simple /api/stats or admin-only page, showing: cards sent, unique receivers, reopen rate (opens >2 days after send), receiver→sender conversion, saves, installs. No personal data beyond anon ids and the optional sender name. Migrations per §11.2 (backup first).
Optional: a quiet "Snap your own →" line at the bottom of the card.

Acceptance (on preview, WebKit at iPhone size): share → name prompt once → link preview shows title + art + "from <name>" → open signed-out in a fresh context → providers present and refreshed (log shows the fetch) → Watch/Trailer visible above the fold → Save → app opens with the anchor → the standalone launch with the claim URL shows the saved item → the readout counts every step correctly. An old snapshot (the Lioness one, 99a1a2a4-…) still opens and gains the live providers.

## S5 — Mood chips up front (discovery)

First, check git history for when and why the original chips under the search box were removed (Brad's first MVP had them). Report the reason; if it still applies, design around it rather than undoing it.

Row 1 is always visible under the search box: Comedy · Drama · Thriller · Crime · Action · Romance · Sci-Fi · Surprise me (horizontal bubble scroll, same style as the shortlist chips). It is category-aware: TV gets its own set, and Wine gets styles such as Bold Red · Crisp White · Bubbles · Rosé · Surprise me.
The first tap shows results immediately. No GO.
Row 2 appears after the first tap: refiners Feel-good · Dark · Smart · Classic · New. They're optional, and tapping one re-runs the search.
Typed title and snap are unchanged.
Remove the + dropdown, "Pick a lane first," and the "Lane:" row. The sticky Share pill must sit cleanly below the status-bar strip. Acceptance: from a cold open, one tap on Comedy gives five comedy reks with no other step; the refiner row appears and re-runs; a typed title and a snap still land the anchor; nothing remains of the old lane UI.

---

## Rules for this run

- §12: best practice decides; fewer steps; feel is Brad's; proportionate effort (don't chase rare cases).
- No VOICE changes. Any wording changes are prepare-only.
- Never touch release/v2, Production env vars, or --prod (§11.6).
- Chain per §10 and §11; maximum three sessions.
- End with the §10.6 combined validation batch (what Brad taps on his phone, what it should feel like, what to screenshot) and the §11.8 promotion checklist.
