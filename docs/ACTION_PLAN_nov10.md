# Rekomendr: where we are and the next builds (Nov 10, 2026)

Written by Claude (Fable 5.2) after re-reading the thread, the session log (through Session 37) and the live health check.

## Verdict: stable and usable, for two people

**What I checked today**
- The live site answers and reports healthy: database, TMDb and card minting all OK, every model step on Claude as designed.
- Nothing has been built since Nov 1 (Session 37). All 58+ test suites and the browser checks passed at that point.
- The one-shot results are real: The Intouchables, Beetlejuice and Coherence, two of them found by Katrina on her own.

**What I could not check**
- Whether Sessions 36 and 37 (Recent searches, the compare defaults) are promoted to production. Open the promote link; if it says "nothing to compare", they are live.
- A real shelf photo in a real aisle. Every shelf test so far used a stored sample.
- The numbers for THE TEST (below).

**The honest read**
The flow work is done well enough. The app's open question is no longer "does the flow feel right?" It is "does it work for someone who isn't Brad or Katrina?" On Oct 31 the database showed two active phones. THE TEST we set on Oct 12 (do people who receive a card send one of their own?) started Oct 16 and has not been looked at since; the last three weeks went to polish. The next round should measure, then put the app in more hands, before adding features.

## How far it has come (Oct 12 to Nov 1)
- Share cards became the product; cards are permanent (charter §2.13).
- Wine shelf: snap a shelf, taste bars, price bands, a top card, compare to a bottle from the shelf.
- All AI moved from OpenAI to Claude (Oct 24). Voice input added.
- Movies and TV went mood-first: chips, voice, posters, Watched, Saved, Favorites, Recent.
- Home settled: centered logo, four list tiles, search with Go, one split Say it / Snap it square.
- Compare became one rule everywhere (charter §2.14): one control, visible, one tap, off by default except wine with a bottle in hand.
- Recent remembers every search with its five picks.
- A failed AI reply is retried once, silently, on every path.
- Database permissions tightened ahead of Supabase's Oct 30 change.

## The next builds, in order

### Build 1: Housekeeping (no visible change, short)
Why: the instructions the builder reads every session have drifted from reality, and that causes wrong stops and wasted effort.
1. **Charter truth-up.** Three invariants are out of date and need Brad's OK on new wording:
   - §2.10 still says the model is gpt-4o-mini and the Anthropic key is dev-only. Reality: all Claude since Oct 24.
   - §2.3 and §3.9 say voice prompts never change outside a joint session. Reality: Brad approves single-instruction changes in chat. Write that down as the rule.
   - §2.8 says sessions never push to main. Reality: self-merge to main when green, never release/v2.
2. **Shrink what the builder reads.** The session log is 3,600 lines; the builder ran out of working memory several times. Move everything before Session 26 to an archive file and add a one-page CURRENT_STATE.md that each session updates.
3. **One numbering rule.** Launch docs are named by topic and date, not by session number; the builder assigns the number. (S25 was built as S26, S35 as S36, and a test file was overwritten by a name clash.)
4. **Clean test leftovers.** Preview and production share one database, so the builder's test rows sit beside real ones. Delete the agent's test rows (after a backup) and tag future ones so stats can exclude them.

### Build 2: Measure (small)
Why: we cannot tell if it is working beyond anecdotes.
1. **THE TEST readout,** on the private stats page: cards shared, cards opened by someone else, and receivers who went on to make their own card, by week since Oct 16, excluding Brad's and the builder's devices.
2. **Quality counters,** same page: how often a result set comes back with fewer than five picks (the comparison backstop can drop cards), how often the silent retry fires, how often a search times out, and median time to results.
3. **Use counters:** active devices per week, searches by type (voice, typed, chips, snap), and how often Compare to is switched on. If nobody ever checks it, that tells us something.

### Build 3: Ready for strangers (medium)
Why: everything so far was tuned on two people who know the app.
1. **Cold start.** Walk the app as a brand-new person with no favorites, no history and no explanation. Fix whatever needs explaining. The rotating nudge is the only teacher today.
2. **The receiver's path.** Someone opens a shared card in a text. How many taps until they have made their own? That path is THE TEST, so it should be the smoothest in the app.
3. **Keeping your stuff.** Favorites and history hang on an anonymous ID in the phone's browser storage; Recent is on the device only. Confirm sign-in works end to end (the email sender setup was still open in the charter) and that signing in on a new phone brings Favorites, Watched and Saved back.
4. **A plain privacy line.** Voice searches are stored on the server word for word. §0 says we know only what people choose to tell us, so say so in one sentence in the ⋯ menu, and decide how long to keep them.
Then: hand it to 10 to 20 people and watch the Build 2 numbers for two weeks.

### Build 4: Small polish batch (short; can ride along with any build)
- A wine search reopened from Recent should remember whether Compare to was checked.
- "Compare to Josh" is too short to recognize; use maker plus grape ("Josh Cabernet").
- Whiskey and other product snaps get the blue "opened" dot in Recent.
- Watch only: the odd comparison without "than" slipping into a description.

### Build 5: Remove the OpenAI leftovers (deadline: before Jan 14, 2027)
GPT-4o retires Jan 14. Generation is already on Claude, but the old code paths and one unused route mode remain. Remove them, keep moderation, and confirm the moderation model is not on the retirement list. Do this in December, not January.

## Parked (not now)
- Restaurant wine-list mode.
- Music category.
- Per-card Compare (§2.14 probably made it unnecessary).
- "Everything I watched and how I found it" across services.
- The joint voice round.

## Field tests only Brad and Katrina can do (no building needed)
1. Snap a real shelf in a store. Is the top card the bottle you would call best known? Pick a bottle you know from This shelf and read the vs. lines.
2. Hand the phone to a friend, say nothing, and watch where they hesitate.
3. Text a card to three people who have never seen the app. Do any of them send one back?
