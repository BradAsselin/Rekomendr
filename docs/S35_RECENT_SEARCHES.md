# S35: Recent remembers your searches

Written Nov 1, 2026 (Claude, with Brad). Not started. This is first on the list for the next build round.

## Why
- On Oct 31 Brad did a voice search ("For a thought-provoking engaging hour and a half movie"), watched the first pick, and loved it.
- The next morning he couldn't remember the title. He hadn't tapped the card, so it wasn't in Recent, Watched or Saved, and there was nothing to star or save.
- The production database had it (voice_moods + voice_events: Coherence, Ex Machina, The Big Short, Primer, The Man from Earth), but no ordinary person could get it back.
- Netflix and Prime keep a viewing history, but it's buried, and no service keeps one across all your services. Rekomendr can be the place where you see what you found and how you found it.

§0: the person keeps their own path; it is stored on their device only, the same as Recent today.

## Standing rules (unchanged)
- Self-merge to main when green. Never touch release/v2, never deploy --prod, never set Production env vars. Brad promotes.
- VOICE: only the strings quoted here are pre-approved. Anything else goes in the report as "your call".
- Never send Brad's email or other personal info to outside services.

## Build
1. **Every search makes a Recent entry**, on the device only, newest first, capped at 50 entries. Search types:
   - voice
   - typed
   - chip taps (genre and vibe)
   - snap
   - More like this
   - Compare to re-ranks do not make an entry
2. **What an entry shows:**
   - What started it:
     - for voice and typed searches: the words, in quotes
     - for chip taps: the chips, as "Comedy · Feel-good"
     - for a snap: "Snapped: [what was read]"
     - for More like this: "More like [Title]"
   - The category icon, and when it happened ("Last night 10:22 PM", "Oct 28")
   - The five picks as a row of small posters, or as names for wine
3. **Tapping a pick opens its card**, with star, save, Watched it and share, just like any other card.
4. **Tapping the entry itself reopens that result set** exactly as it was, from the stored entry, with no new model call.
5. **Titles you opened stay in Recent as they do now.** Within an entry, mark a pick you opened with a small dot.
6. **"Clear recent" clears both.**
7. **The Recent tab's hint line stays** "Tap any title for more like it, or to share it."

## Also in this round: typing a title follows the S31 rule
Added Nov 1. Brad typed "Coherence". The anchor card was right, but the five picks below it used comparison lines ("Same entangled-parallel-self dread, but…"), and there was no Compare to row to turn them off. Starting from a list (S31) and chaining from a card (S32/S33) already work the S31 way. A typed or spoken title search should work the same:
- Below the anchor card, show "Compare to [Title] ☐", unchecked.
- The five picks stay seeded on that title, but each line is standalone: the same instruction swap and the same comparison backstop as S31–S33.
- Checking the box adds the "vs. [Title]:" lines, without re-ranking. Unchecking removes them.
- Wine is unchanged: a typed bottle still compares automatically.
- Approved: change only the instruction that makes the typed-title lines comparative.
- Test: a typed title gives an anchor card, standalone lines and an unchecked Compare to row; checking it adds the vs. lines.

## Tests
- A voice search, a typed search, a chip search, a snap and More like this each create one entry with the right label and five picks.
- Reopening an entry makes no network call.
- The 51st entry drops the oldest.
- Clear recent empties everything.
- Nothing new is sent to the server.

## Phone checklist
1. Say "a thought-provoking hour and a half movie" and don't tap anything. Go home and open Recent. The entry is there, with your words and five posters.
2. Tap the first poster: its card opens and you can star it.
3. Tap the entry: the same five come back instantly.
