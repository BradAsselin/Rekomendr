# Measure: the card test, quality counters, use counters

Written Nov 10, 2026 (Claude, with Brad). Build 2 of docs/ACTION_PLAN_nov10.md. No change to what people see in the app; the private stats page gains a readout.

## Why
The app is stable for two people. Before it goes to more, we need numbers instead of anecdotes: is the card loop working (THE TEST, set Oct 12), are results arriving whole and fast, and which parts of the app get used.

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- Back up before any migration (§11.2); new tables follow §11.2a (RLS on, explicit grants, prove the grant).
- Never send Brad's email or other personal info to outside services.
- §0: count events, never content. No titles, words, photos or names in any new record. Nothing new leaves the device except a count of what happened.

## Step 0: plan first, in the PR description, before building
List, for every number below, whether it can be computed today from existing tables (`anchor_snapshots`, `card_events`, `api_usage`, `voice_moods`, `voice_events`, `goto_events`, `go_tos`, `user_likes`, `reksnap_signals`, `wine_marks`) or needs a new record. If more than two numbers need new client-side records, say so and build the server-side ones first.

## The readout (on the existing private stats page, behind the existing key)
One page, plain labels, a table per block, by week (Monday start, America/New_York), newest first.

### Block 1: THE TEST (cards), from 2026-10-16
- Cards shared.
- Shared cards opened by a device other than the one that shared them.
- **Receivers who made their own:** distinct devices whose first recorded event is opening someone else's card and who later shared a card of their own. This is the primary number. Show it as a count and as a share of receiving devices.
- Show every number twice: everyone, and "outside the house" (see House devices).

### Block 2: Quality, from 2026-11-10
- Result sets returned, and how many came back with fewer than five picks (the comparison backstop and the real-title guard can drop cards). By lane: search, snap, wine.
- Silent retries fired, and how many still failed after the retry.
- Searches the client gave up on (the 90-second abort) and server errors shown to the person.
- Median and slowest-tenth time from request to results, by lane.
Most of this exists only in Vercel logs, which are kept briefly. Record each as a small server-side counter row at the moment it happens (lane, kind, milliseconds, day). No client id is needed for Block 2.

### Block 3: Use, from 2026-11-10
- Active devices per week (any search or snap).
- Searches by how they started: voice, typed, chips, snap, More like this.
- Categories: Movies, TV, Books, Wine.
- **Compare to switched on** (count of times, and distinct devices). This needs one new client event sent through the existing signals route: the event kind and the category only, no title. Brad approves this one new event by launching this doc. If it cannot be done without sending anything else, leave it out and say so.

## Added Nov 10 evening, after Brad read the live readout
The stats page already has a "Test readout" (cards sent, receivers, opens, voice counts, and more). Keep every number it shows today and add the three blocks to it; do not rebuild it.

What the readout showed, and what it changes:
- 14 spoken searches showed 61 cards; 1 was tapped and 57 are labeled "ignored" (93.4%). That label is wrong. Brad's Coherence night is in there: he read the card, watched the film on TV, and loved it, without tapping anything. The app's success happens off the phone, so taps cannot see it. "How was it?" has 0 answers.
- Watched is the most-used mark (44). People will tell the app what they watched if it is one tap.

So this build also does two things:

**A. Rename, don't judge.** On the stats page, "Voice: cards ignored" becomes "Voice: cards with no tap", and "ignored (%)" becomes "no tap (%)".

**B. Ask once, the next time they open the app.** When the person opens home and their most recent search (any kind, Movies or TV) is between 3 hours and 7 days old, and none of its five picks is marked Watched:
- The nudge line under the Say it / Snap it square shows, in place of the rotating tips for that visit: "Did you watch one of these?" followed by the five small posters from that search, and a "Not yet" link.
- Tapping a poster marks it Watched (the same mark as the Watched it button, with the usual Undo toast) and the line goes back to the rotating tips.
- "Not yet" or any poster tap ends it for that search for good. It never shows twice for the same search, and never for a search older than 7 days.
- Home must still fit one screen at 390×844 and 375×667 (reuse the nudge line's space; shrink the posters if needed).
- It uses the search already stored in Recent on the device. Nothing new is sent except the Watched mark the person chooses to make.
- Approved wording (Brad, by launching this doc): "Did you watch one of these?" and "Not yet". Nothing else new.
- Count on the stats page, in Block 3: times asked, answered with a poster, answered "Not yet".
- §0 check to state in the report: it asks once, takes one tap, and can be waved off; it exists to learn what the person chose, not to pull them back in.
- Tests: shows only inside the 3-hour to 7-day window; never twice; a tap writes one Watched mark; home does not scroll with it showing; nothing is sent on "Not yet" beyond the count.

## House devices
- Brad's and Katrina's phones must be separable so "outside the house" means something. Keep a short server-side list of house device ids (a small table, server-only, no client policies). Seed it with the two most active real devices and show Brad the two ids' first eight characters and activity so he can confirm they are his and Katrina's; do not guess silently.
- Builder test ids (`anon_agent_`) stay excluded everywhere, as now.
- Put a note on the page: device counts before 2026-11-10 are overstated, because early browser tests used real-format ids (Session 38).

## Tests
- Each number checked against a hand count on fixture rows.
- With no data in a week, the page shows zeros, not an error.
- Wrong or missing key still returns "not found".
- The new Compare to event carries only kind and category (assert the payload).
- All suites, tsc, lint and build pass; new-table grants read back and proven through the server path.

## Report back
Merge SHAs; the Step 0 table (what existed, what was added); migrations run and backup filename; the first real readout, pasted as numbers; anything that could not be measured and why.

## Brad's check (after promotion)
1. Open the production stats page with your key (do not paste the key into chat). The three blocks are there.
2. Confirm the two house devices are yours and Katrina's.
3. Share a card to a friend's phone. Within a minute Block 1 shows one more card shared, and one more open once they tap it.
4. Turn Compare to on once. Block 3's count goes up by one.
