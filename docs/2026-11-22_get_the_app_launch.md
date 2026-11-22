# Get the app: from a shared card to the home screen (plus wine compare by color)

Written Nov 22, 2026 (Claude, with Brad). Design: canvas row H (boards H1SharedCard, H2GetAppSheet, H3OpenedInApp, H4HomeAsk), approved by Brad. The written spec below is complete on its own.

## Why
Friends love the app, but the stumble is getting it onto their phone. People hear "app" and look for it in the App Store. Rekomendr is a web app that lives on the home screen, and nothing on a shared card says so or helps them do it. Opening a shared card in the app is also how a receiver becomes a user, which is the card test (Build 2's Block 1).

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- Never send Brad's email or other personal info to outside services.
- Shared cards are permanent (§2.13): `/a/<id>` keeps working and its snapshot text never changes; this build only changes the page around it.
- Compare to follows §2.14.
- **Pre-approved wording (Brad, by launching this doc):** "Open Rekomendr", "Get the app", "Free · no App Store needed · find more like this one", "Brad sent you a pick" (the sender's name as on the card today), "Save it for later", "Find more like this →", "Put Rekomendr on your home screen", "Free. No App Store needed.", "It opens like any app, from its own icon.", "Got it", "From [Name]", "Like it? Put Rekomendr on your home screen.", "How", "Add to Home Screen" (⋯ menu). The three install steps follow what Safari actually shows (see item 2). Anything else new goes in the report as "your call".

## 1. The shared card page (board H1)
- Replace the "Rekomendr" title bar with a header:
  - The Rekomendr.AI logo on the left, and "[Name] sent you a pick" on the right in small gray.
  - Two buttons side by side: **Open Rekomendr** (primary, filled) and **Get the app** (outlined, with a small add-to-home icon).
  - Under them, one small centered line: "Free · no App Store needed · find more like this one".
- On the card: the Save button reads **Save it for later**. Everything else on the card stays as it is (poster, name's pick label, Watch, Trailer, synopsis, where to stream).
- "Snap your own →" at the bottom becomes **Find more like this →** and does the same as Open Rekomendr.
- When the page is already running from the home-screen icon (standalone display mode), hide **Get the app** and its line, and let Open Rekomendr fill the row.
- Health cards stay unshareable, as now.

## 2. Get the app (board H2)
- **iPhone (Safari):** a sheet with the app icon, "Put Rekomendr on your home screen", "Free. No App Store needed.", "It opens like any app, from its own icon." Then three numbered steps, each with a picture of the real button, and an arrow pointing at the Safari control the first step uses. Then **Got it**.
  - **The steps must match current iOS Safari.** Brad's screenshot (Nov 22) shows the newer compact layout, with a menu icon (≡) at the bottom left of the address bar. The draft steps are: tap the menu at the bottom of Safari; tap Share; tap Add to Home Screen, then Add. Verify against current iOS Safari before shipping. If the layout differs (for example, the older Share button at the bottom), detect it where you can, or show the steps for the layout Brad confirms, and list it under "your call".
  - If the page is open inside another app's browser (an in-app web view where Add to Home Screen isn't available), the sheet says to open the page in Safari first, with a one-tap copy of the link. That wording is "your call".
- **Android (Chrome):** **Get the app** uses the browser's own install prompt (`beforeinstallprompt`) when it is available, so it's one tap. If it isn't available, show the menu steps in the same sheet style.
- **Already installed:** never show the sheet or any ask.
- **Home-screen start:** an icon added from a shared card must open the app's home page, not that card. Check the web manifest's `start_url` and `scope`, and test it on iPhone and Android.
- Check the icon, name and splash screen a person sees when they add it; fix them if they look wrong.

## 3. Open Rekomendr (board H3)
- Opens the app with the shared item as the anchor at the top, labeled **From [Name]**, with its own star and save, and its picks below in the normal More like this layout. That means the "More like this" row with "Compare to [Short title] ☐" unchecked (§2.14), standalone descriptions, and Recent getting an entry ("More like [Title]").
- Wine cards open the same way, as the wine anchor, with Compare to checked per §2.14.
- After the picks, if the app is not running from the home screen and hasn't asked recently, one quiet line: "Like it? Put Rekomendr on your home screen." with **Get the app** (opens item 2) and an ×.
- Opening the app this way counts as a receiver opening the card, as Build 2 already measures; nothing new is recorded about the person.

## 4. Home page, asked once (board H4)
- Only when the app is running in the browser, never from the home-screen icon.
- Only after the person's first search that showed results.
- It takes the nudge line's place under the Say it / Snap it square for that visit: "Put Rekomendr on your home screen" with **How** (opens item 2) and ×.
- After ×, or after the sheet's **Got it**, don't ask again for 14 days. After three dismissals, never again. Store this on the device only.
- The "Did you watch one of these?" line wins if both are due; this ask waits for the next visit.
- Home must still fit one screen at 390×844 and 375×667.
- **Add to Home Screen** is a permanent item in the ⋯ menu (opens item 2); hide it when already installed.

## 5. Counts (Build 2's measure_events, counts only, no device id)
Count: Get the app opened; Android prompt accepted or dismissed; Got it; home ask shown, How, ×; Open Rekomendr tapped from a shared card. Use new `kind` values, and add them to the table's allowed list in a small migration (backup first, §11.2; §11.2a grants are unchanged). If the migration is blocked, save it as a script for Brad to run, as in Sessions 39 and 40. Show the counts in Block 3 of the stats page. An app opened from the home-screen icon (standalone) is already counted as "home-screen launches"; keep that.

## 6. Wine: Compare to sorts by color
Brad compared a red shelf to his favorite white; it worked, but the comparison wasn't useful.
- In the Compare to sheet for a wine result, list bottles of the same color as the result first (red, white, rosé, sparkling, dessert/fortified), then the rest under a small label "Other styles". This applies on every tab (This shelf, Favorites, Watched/Bought, Recent, Saved).
- Nothing is blocked: a person can still pick a white for a red shelf.
- If a bottle's color is unknown, it goes in the first group.
- Approved wording: "Other styles".

## Tests
- H1: the header shows both buttons; the old title bar is gone; Save reads "Save it for later"; in standalone mode Get the app is hidden; `/a/<id>` for an existing real shared card still loads, and its snapshot text is byte-identical.
- H2: iPhone sheet steps render; the Android path calls the stored install prompt; never shown when installed.
- H3: Open Rekomendr lands on the anchor with "From [Name]", standalone lines, Compare to unchecked (checked for wine); a Recent entry is made; the ask shows after the picks only in the browser.
- H4: shown only after a first search, only in the browser; 14-day and three-dismissal rules; yields to "Did you watch one of these?"; home doesn't scroll at either size.
- Manifest: start_url opens home, not the card.
- Wine sheet: same color first, "Other styles" after, unknown color in the first group.
- Counts carry only their kind (assert the payload).
- All suites, tsc, lint and build pass; check H1–H4 on the preview at 390×844.

## Report back
Merge SHAs; the iOS Safari steps as built and how you verified them; anything under "your call"; migration status.

## Brad's check (after promotion)
1. Text yourself a card. Open it: the header shows Open Rekomendr and Get the app.
2. Tap Get the app on your iPhone and follow the steps. The new icon opens Rekomendr's home, not the card.
3. Open the card again in Safari and tap Open Rekomendr: the movie is on top, "From Brad", with picks below.
4. Hand your phone to a friend's card link, or ask Katrina to open one on hers, and watch whether the steps make sense without help.
5. Wine: snap or type a red, open Compare to, and check that reds come first and your white is under "Other styles".
