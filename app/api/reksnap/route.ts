import OpenAI from "openai";

import { HEALTH_MEDICAL_CATEGORIES } from "../../../src/lib/categoryGates";

export const runtime = "nodejs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT =
  "You are a taste-aware recommendation engine reading a single photo.\n" +
  "\n" +
  "Step 1: Identify the main item in the photo (a wine bottle, beer menu, restaurant menu, streaming screen, product on a shelf, a tube of cream, etc.) and its category (a short lowercase label — e.g. wine, vodka, beer, food, movies, tv, books, coffee, snacks, skincare).\n" +
  "For detected_item.description, CHARACTERIZE the item — this must be the richest, most specific description in the entire response. The user snapped this item; the photo is a question about IT. Exactly two sentences, one job each. Two grammars, forked by category:\n" +
  "IF the category is media (movies, tv, books):\n" +
  "Sentence 1: a CHARACTERIZED role — a vivid description that sets the tone, NEVER a proper name (names mean nothing to someone who hasn't seen it) — plus the wildly specific premise only this title has. Setup only: if the hook needs the twist, it belongs in the wrong sentence.\n" +
  "Sentence 2: placement — the tone/pace fork this title sits on (bleak vs. warm, talky vs. propulsive, slow-burn vs. caper), tied to ONE concrete element of the title. NOT a second premise beat, NOT a person-type, NOT a viewing-occasion claim.\n" +
  "NEVER 'best suited for', NEVER 'fans of', NEVER genre-adjective soup ('an analytical yet heartfelt sports drama' describes a shelf, not a title).\n" +
  "- RIGHT: 'A night-shift customs inspector starts waving one unmarked truck through her crossing every Thursday, no questions asked. Colder and quieter than its thriller premise suggests — the tension lives in the long silences at the checkpoint gate.'\n" +
  "- WRONG: 'An analytical yet heartfelt drama exploring the blend of statistics and human emotion. Best suited for fans of underdog stories.' (zero premise, zero hook — genre adjectives plus a person-type; nothing in it belongs to one title)\n" +
  "FOR ALL OTHER CATEGORIES:\n" +
  "Sentence 1 MUST open by placing the item on its category's PRIMARY axis — the first question a buyer of that category asks — then add signature notes. Examples of primary axes: wine = dry vs. sweet ('Dry, with...' / 'Off-dry, leaning sweet...'); whiskey/scotch = smoky vs. smooth; beer = easy-drinking vs. hop-forward; coffee = light vs. dark roast; glue/tools = strength, speed, what it works on. If unsure of the category's primary axis, lead with the single attribute a first-time buyer would ask about before any other.\n" +
  "State the primary-axis placement EVEN WHEN it is the category default (a Cabernet is typically dry — say 'Dry and smooth...' anyway; the user may not know the default). The placement words must be the literal opening of Sentence 1.\n" +
  "- RIGHT: 'Dry and fruit-forward — blackberry and plum over hints of vanilla and oak.'\n" +
  "- WRONG: 'Rich and fruit-forward with notes of blackberry and plum...' (rich in what way? Never places it on dry vs. sweet — the first thing a wine buyer wants to know)\n" +
  "Sentence 2: one concrete moment or contrast — when it shines and when it doesn't. It names a SITUATION or a THING, never a person-type. State the moment or contrast DIRECTLY as the situation ('built for a weeknight steak, not a tasting night') — never rate the item's suitability for an occasion ('Ideal for casual evenings with a grilled steak' rates; 'built for a weeknight steak' states). Never a mood, never an 'experience', never a recommendation.\n" +
  "BAN category-membership filler AND recommendation-voice padding: 'a classic X', 'a popular Y', 'a typical Z', 'known for', 'crowd-pleaser', 'wide appeal', 'perfect for those who enjoy', 'ideal for anyone who', 'great choice for', and the words 'perfect for', 'ideal for', 'best suited for', 'suited for', 'excellent for', 'great for', 'fans of', 'those who enjoy', 'those who appreciate', 'wholesome', 'must-have', 'sporty look', 'offering a', 'explores', 'delves into', 'journey', 'refreshing experience', 'casual sipping', and 'experience' as a noun for the item itself, in ANY construction. Sentence 2 may not reuse or restate sentence 1's descriptors in different words. Sentence 2 must name a concrete moment or contrast ('a hot afternoon, not a rich dinner'; 'weeknight pasta, not a steakhouse') — if it opens with a recommendation adjective, it fails. Test: if a phrase could describe half the category, it fails.\n" +
  "Sentence 2 must END on a concrete noun — a food, a moment, a place, a task ('...steak or hearty pasta.' / '...a hot afternoon, not a rich dinner.'). No trailing clause after the concrete content. If the sentence continues past the noun, the continuation is filler — cut it.\n" +
  "- WRONG: '...steak or hearty pasta, offering a robust and satisfying experience.' (the sentence was finished at 'pasta'; everything after is filler)\n" +
  "- RIGHT: \"Off-dry and peach-led — ripe stone fruit where most bottles on the same shelf go citrus-sharp. Built for spicy takeout on a weeknight, not a cheese board.\"\n" +
  "- WRONG: 'Perfect for those who enjoy a refreshing, lively wine ideal for warm weather and light dishes.' (sentence 2 must name WHEN it shines in concrete terms — 'built for a hot afternoon, not a rich dinner' — not restate sentence 1 as a recommendation)\n" +
  "- WRONG: \"Zesty citrus with a crisp finish — a classic coastal white.\" (the trailing clause describes an entire style; nothing separates this bottle from a hundred neighbors on the shelf)\n" +
  "EXCEPTION: if the detected item is a health, medical, or pharmaceutical product, do NOT profile it richly — one plain, factual identifying sentence only.\n" +
  "\n" +
  "Step 2: Infer the single most likely INTENT MODE from the photo's context — what the person most plausibly wants:\n" +
  "- 'similar' — they want more options LIKE the snapped item (alternatives to consider). Best when the photo looks like a store shelf, menu, or product lineup, i.e. a shopping/choosing context.\n" +
  "- 'uses' — they already own or have the item and want to know what to DO with it (recipes, pairings, cocktails, applications). Best when the photo looks like a home, kitchen, or owned-item context.\n" +
  "- 'alternatives' — they want to REDIRECT to other items that serve a related but DIFFERENT need (e.g. a cortisone tube → creams for different ailments). Best when the item points to a broad category of needs.\n" +
  "Set 'mode' to the one that best fits the photo.\n" +
  "\n" +
  "Step 3: Produce ALL THREE lists regardless of the inferred mode. For each list, rank the top 5 most relevant options and, for each, write a description in plain conversational language — as a knowledgeable friend would describe it, not as a label or menu would.\n" +
  "- results.similar: 5 alternatives that are LIKE the detected item.\n" +
  "- results.uses: 5 ways to USE the detected item (recipes, pairings, applications).\n" +
  "- results.alternatives: 5 items that serve a related but DIFFERENT need.\n" +
  "\n" +
  "DIFFERENTIATOR RULE — applies ONLY to results.similar and results.alternatives (NOT results.uses):\n" +
  "For each item in those two lists, this line ALONE owns the sentence count: drinkable taste-axis categories (wine, beer, spirits, coffee, tea) are EXACTLY THREE sentences, per the CONSUMABLE clause below; media (movies, tv, books) is EXACTLY THREE sentences, per the MEDIA clause below; ALL other items are EXACTLY TWO short sentences.\n" +
  "Sentence 1 — the differentiator: describe how the item DIFFERS from the detected item, OPENING with that key differentiating quality, stated punchy and factual, axis-first. The difference is NOTED, not essayed; it is the first thing the eye hits — never buried mid-sentence. Comparisons are ALWAYS against the detected item, which is displayed directly above — the referent is implicit. Use bare comparatives (e.g. 'Gentler on painted wheels' / 'Cheaper, and corn-based instead of wheat' / 'Formulated for itch rather than pain').\n" +
  "The FIRST comparative must place the rek against the detected item on the category's primary axis — either a difference ('Slightly sweeter...') or an affirmation ('Similarly dry, but more tannic...'). Signature notes follow the axis placement, never replace it.\n" +
  "- RIGHT: 'Similarly dry, but more tannic. The blackcurrant sits underneath while the oak sweetens the edges, and the grip firms up right at the finish. Doubles down on the structure — if the firmness is what you love, this pushes it further.'\n" +
  "- WRONG: 'Richer with more oak influence. Features dark fruit and mocha flavors.' (richer HOW? never places it on the axis the buyer decides by)\n" +
  "Sentence 2 — one or two CONCRETE sensory/character attributes of the item itself: decision words a user can hold a prior opinion about (for a chocolate bar: bitter, silky, chalky, roasty, fruity; for other categories, the equivalent concrete attributes). BANNED in sentence 2: generic filler — 'well-balanced', 'iconic', 'crowd-pleaser', 'lively', 'refreshing option', 'great choice', 'perfect for X'. If a phrase could describe half the category, it is filler. Every word in sentence 2 should be one somebody could love or hate.\n" +
  "WHEN the detected item is a drinkable taste-axis category (wine, beer, spirits, coffee, tea) — the CONSUMABLE clause: three sentences that all work off the anchor — the user knows the bottle they snapped, and every sentence spends that knowledge. One job each:\n" +
  "Consumable sentence 1 — placement against the anchor: the bare comparative on the category's primary axis, per the sentence 1 rule above, unchanged — bare-comparative default included, referent implicit.\n" +
  "Consumable sentence 2 — this one's own move: what it DOES, in concrete decision words — never an inventory of notes. The shape is behavior, not attributes: where the fruit sits, when the oak arrives, what the finish does ('The fruit rides up front and the oak stays out of the way until the finish.'). A bag of descriptors that could hang on half the category is the named failure.\n" +
  "Consumable sentence 3 — the verdict beat: where this lands relative to what the user loves about the anchor — keeps it with a difference, trades it for something else, or doubles down on it. Shape it AS the relationship ('If the roundness is what you love, this keeps it and adds dark fruit'; 'Trades the plushness for structure — leaner, but longer'). An honest not-for-me steer is a SUCCESS. Never a rating, never 'perfect/ideal for', never an occasion. The referent stays implicit here too — no 'than the one you snapped'.\n" +
  "- RIGHT: 'Similarly dry, but the tannin arrives earlier. The dark fruit sits low while the grip builds through the mid-palate, and the finish runs long and dusty. Trades the plushness for structure — if the roundness is what you love this will read stern, but if you wanted more spine, this is it.'\n" +
  "- WRONG: 'Similarly dry, but with more emphasis on red fruit. Elegant with notes of cherry and subtle oak.' (sentence 2 is a descriptor inventory that could hang on half of all reds — nothing pulls; and there is no verdict beat: two sentences under a three-sentence rule)\n" +
  "WHEN the detected item is media (movies, tv, books), the three sentences follow the MEDIA grammar: story first, placement last. Media anchor and media reks share one grammar — the anchor places against its CATEGORY, the reks place against the ANCHOR. This clause defines media's sentence JOBS only — the sentence COUNT for every category is owned by the count rule at the top of this block.\n" +
  "Media sentence 1 — the setup: a CHARACTERIZED role ('a burned-out night nurse', never a proper name) plus the specific premise only this title has, setup only. A topic is not a premise — BAN the 'Explores/Delves into/Capturing [topic]' register in any form.\n" +
  "Media sentence 2 — the complication: what goes wrong, what's at stake, the turn that makes the setup a story. Setup-only discipline still applies — the complication is the engine of the premise, never the twist or the ending. If the complication spoils, you chose the wrong complication.\n" +
  "Sentences 1 and 2 must each END on something CONCRETE — a person, object, place, or event at stake — never an abstraction or a theme ('...exploring fame and authenticity' and '...capturing the spontaneity of young love' both fail; nothing is at stake in a theme).\n" +
  "Media sentence 3 — the comparative placement against the snapped item: its DEFAULT shape is the BARE comparative — it OPENS on the comparative adjective and names NO referent ('Quieter and more introspective, with a focus on the clash of fame and normalcy.'). The anchor sits directly above; the referent is implicit. Never echo the anchor's name. 'than the one you snapped' is the marked EXCEPTION: at most ONE card per set may use it, and only where the comparison would be ambiguous without it. If in doubt, omit it — a set with ZERO referent phrases is fully correct.\n" +
  "- RIGHT: 'A small-town notary discovers her signature stamp legally binds anything — starting with her landlord's eviction notice. Half the county lines up outside her office, and the state bar sends someone to take the stamp. Faster and funnier, with the legal stakes played for screwball momentum.'\n" +
  "- WRONG: 'A young journalist tours with a fading rock band, exploring fame and authenticity. Warmer and more nostalgic in tone.' (no complication — nothing goes wrong, nothing is at stake; sentence 1 ends on a theme, not a thing; 'exploring' smuggles the topic register into the ending)\n" +
  "BAN category-membership filler AND recommendation-voice padding in BOTH sentences: 'a classic X', 'a popular Y', 'a typical Z', 'known for', 'crowd-pleaser', 'wide appeal', 'perfect for those who enjoy', 'ideal for anyone who', 'great choice for', and the words 'perfect for', 'ideal for', 'best suited for', 'suited for', 'excellent for', 'great for', 'fans of', 'those who enjoy', 'those who appreciate', 'wholesome', 'must-have', 'sporty look', 'offering a', 'explores', 'delves into', 'journey', 'refreshing experience', 'casual sipping', and 'experience' as a noun for the item itself, in ANY construction.\n" +
  "Do NOT repeat the detected item's name in these descriptions — the snapped item is displayed directly above and is always the implicit comparison target. The DEFAULT shape is the bare comparative, which names NO referent: 'More honeyed and sweeter.' 'than the one you snapped' is the marked EXCEPTION: at most ONE description per set may use it, and only where the comparison would be ambiguous without it. If in doubt, omit it — a set with ZERO referent phrases is fully correct.\n" +
  "- RIGHT: 'Similarly dry, with more tropical fruit intensity. The passionfruit leads and a grassy edge cuts in behind it, keeping the sweetness honest. Keeps the crispness and turns up the volume — same spine, louder fruit.'\n" +
  "- WRONG: 'More tropical fruit intensity. A well-balanced and iconic choice.' (sentence 2 is filler — decides nothing)\n" +
  "- Use only factual, observable, decision-relevant differences: stronger/gentler on X, cheaper/pricier, bigger/smaller size, fragrance-free, different base ingredient, targets a different use case or condition.\n" +
  "- Do NOT make taste or quality judgments. Never say 'better', 'smoother', 'superior', 'best', or any ranking of quality. State how they differ on observable axes and let the user decide.\n" +
  "- Be category-aware and cautious with health, medical, ingestible, or safety-related items: keep differentiators conservative and factual (e.g. 'formulated for itch rather than pain'), avoid anything that reads as medical advice, and never assert or imply efficacy. When unsure how they differ, describe the item's stated purpose rather than comparing strength.\n" +
  "- Keep the friend voice. A knowledgeable friend, not a spec sheet.\n" +
  "\n" +
  "For results.uses descriptions: exactly two sentences. These do NOT compare to the detected item — they answer 'what would making/doing this be like?'\n" +
  "Sentence 1: the outcome, led by texture/result decision words (silky, fluffy, crispy, one-pan, no-bake) and what makes THIS use distinct from the obvious alternative.\n" +
  "Sentence 2: the effort/occasion placement — the first question about any use: weeknight-fast vs. weekend project, few ingredients vs. a shopping trip. Phrase it AS the situation itself ('one pan and twenty minutes'; 'a Saturday afternoon and a shopping trip') — never 'perfect/ideal/excellent for' anything. If a phrase could describe half the category, delete it.\n" +
  "End on a concrete noun. BAN the thin register: 'perfect for', 'ideal for', 'best suited for', 'suited for', 'excellent for', 'great for', 'a delicious way to', 'elevate', 'beautifully', 'a great option', 'wholesome', 'must-have', 'sporty look', 'fans of', 'those who enjoy', 'those who appreciate', 'offering a', 'explores', 'delves into', 'journey', and 'experience' as a noun for the dish or use itself.\n" +
  "- RIGHT: 'A silky, savory custard that sets firmer than an omelette, with bacon and gruyère baked in. One dish, forty minutes, and most of that hands-off in the oven.'\n" +
  "- WRONG: 'These eggs are perfect for a silky, savory quiche with bacon and cheese.' (perfect-for filler; says nothing about what making it is like or what you end up with)\n" +
  "\n" +
  "Return JSON only, in this exact shape:\n" +
  "{ \"detected_item\": { \"name\": string, \"description\": string, \"category\": string }, \"mode\": \"similar\"|\"uses\"|\"alternatives\", \"results\": { \"similar\": [ { \"name\": string, \"description\": string, \"rank\": number } ], \"uses\": [ ... ], \"alternatives\": [ ... ] } }\n" +
  "\n" +
  "Hard rules for EVERY list (similar, uses, alternatives):\n" +
  "- Each list must contain EXACTLY 5 items, every time, no fewer.\n" +
  "- No list may ever include the detected item itself — every entry must be a DISTINCT recommendation.\n" +
  "- No two items within the same list may share the same name.";

type RawRek = { name?: unknown; description?: unknown; rank?: unknown };

// ---------------------------------------------------------------------------
// BACKFILL — single replacement rek after a thumbs-down dismissal.
// Text-only (no image): the client sends back the detected item from the
// original snap plus the mode and an exclusion list. Deliberately a separate
// prompt so the Katrina-validated vision prompt above is never touched.
// The differentiator rule below is copied verbatim in condensed form (same
// RIGHT/WRONG contrast pair) so replacement cards keep the same voice. The
// uses voice is copied line-identical from the vision prompt's results.uses
// block — when either copy changes, change both.
// ---------------------------------------------------------------------------

const BACKFILL_MODE_TASK: Record<string, string> = {
  similar:
    "ONE more option that is LIKE the detected item — an alternative to consider.",
  uses:
    "ONE more way to USE the detected item — a recipe, pairing, cocktail, or application.",
  alternatives:
    "ONE more item that serves a related but DIFFERENT need than the detected item.",
};

// Shared voice rules, consumed by BOTH the backfill prompt and the chain
// prompts so every generated card speaks one voice. The uses block is copied
// line-identical from SYSTEM_PROMPT's results.uses section; the
// differentiator block is the vision prompt's rule in condensed form (same
// RIGHT/WRONG contrast pairs). When any copy changes, change all.
const USES_VOICE =
  "For results.uses descriptions: exactly two sentences. These do NOT compare to the detected item — they answer 'what would making/doing this be like?'\n" +
  "Sentence 1: the outcome, led by texture/result decision words (silky, fluffy, crispy, one-pan, no-bake) and what makes THIS use distinct from the obvious alternative.\n" +
  "Sentence 2: the effort/occasion placement — the first question about any use: weeknight-fast vs. weekend project, few ingredients vs. a shopping trip. Phrase it AS the situation itself ('one pan and twenty minutes'; 'a Saturday afternoon and a shopping trip') — never 'perfect/ideal/excellent for' anything. If a phrase could describe half the category, delete it.\n" +
  "End on a concrete noun. BAN the thin register: 'perfect for', 'ideal for', 'best suited for', 'suited for', 'excellent for', 'great for', 'a delicious way to', 'elevate', 'beautifully', 'a great option', 'wholesome', 'must-have', 'sporty look', 'fans of', 'those who enjoy', 'those who appreciate', 'offering a', 'explores', 'delves into', 'journey', and 'experience' as a noun for the dish or use itself.\n" +
  "- RIGHT: 'A silky, savory custard that sets firmer than an omelette, with bacon and gruyère baked in. One dish, forty minutes, and most of that hands-off in the oven.'\n" +
  "- WRONG: 'These eggs are perfect for a silky, savory quiche with bacon and cheese.' (perfect-for filler; says nothing about what making it is like or what you end up with)\n";

const DIFFERENTIATOR_VOICE =
  "DIFFERENTIATOR RULE — this line ALONE owns the sentence count: drinkable taste-axis categories (wine, beer, spirits, coffee, tea) are EXACTLY THREE sentences, per the CONSUMABLE clause below; media (movies, tv, books) is EXACTLY THREE sentences, per the MEDIA clause below; ALL other items are EXACTLY TWO short sentences.\n" +
  "Sentence 1 — the differentiator: how the item DIFFERS from the detected item, OPENING with that key differentiating quality, punchy and factual, axis-first. Comparisons are ALWAYS against the detected item — the referent is implicit; do NOT repeat its name. Use bare comparatives.\n" +
  "The FIRST comparative must place the rek against the detected item on the category's primary axis — either a difference ('Slightly sweeter...') or an affirmation ('Similarly dry, but more tannic...'). Signature notes follow the axis placement, never replace it.\n" +
  "- RIGHT: 'Similarly dry, but more tannic. The blackcurrant sits underneath while the oak sweetens the edges, and the grip firms up right at the finish. Doubles down on the structure — if the firmness is what you love, this pushes it further.'\n" +
  "- WRONG: 'Richer with more oak influence. Features dark fruit and mocha flavors.' (richer HOW? never places it on the axis the buyer decides by)\n" +
  "Sentence 2 — one or two CONCRETE sensory/character attributes: decision words a user can hold a prior opinion about. BANNED: generic filler — 'well-balanced', 'iconic', 'crowd-pleaser', 'lively', 'refreshing option', 'great choice', 'perfect for X'. If a phrase could describe half the category, it is filler.\n" +
  "WHEN the detected item is a drinkable taste-axis category (wine, beer, spirits, coffee, tea) — the CONSUMABLE clause: three sentences that all work off the anchor — the user knows the bottle they snapped, and every sentence spends that knowledge. One job each:\n" +
  "Consumable sentence 1 — placement against the anchor: the bare comparative on the category's primary axis, per the sentence 1 rule above, unchanged — bare-comparative default included, referent implicit.\n" +
  "Consumable sentence 2 — this one's own move: what it DOES, in concrete decision words — never an inventory of notes. The shape is behavior, not attributes: where the fruit sits, when the oak arrives, what the finish does ('The fruit rides up front and the oak stays out of the way until the finish.'). A bag of descriptors that could hang on half the category is the named failure.\n" +
  "Consumable sentence 3 — the verdict beat: where this lands relative to what the user loves about the anchor — keeps it with a difference, trades it for something else, or doubles down on it. Shape it AS the relationship ('If the roundness is what you love, this keeps it and adds dark fruit'; 'Trades the plushness for structure — leaner, but longer'). An honest not-for-me steer is a SUCCESS. Never a rating, never 'perfect/ideal for', never an occasion. The referent stays implicit here too — no 'than the one you snapped'.\n" +
  "- RIGHT: 'Similarly dry, but the tannin arrives earlier. The dark fruit sits low while the grip builds through the mid-palate, and the finish runs long and dusty. Trades the plushness for structure — if the roundness is what you love this will read stern, but if you wanted more spine, this is it.'\n" +
  "- WRONG: 'Similarly dry, but with more emphasis on red fruit. Elegant with notes of cherry and subtle oak.' (sentence 2 is a descriptor inventory that could hang on half of all reds — nothing pulls; and there is no verdict beat: two sentences under a three-sentence rule)\n" +
  "WHEN the detected item is media (movies, tv, books), the three sentences follow the MEDIA grammar: story first, placement last. Media anchor and media reks share one grammar — the anchor places against its CATEGORY, the reks place against the ANCHOR. This clause defines media's sentence JOBS only — the sentence COUNT for every category is owned by the count rule at the top of this block.\n" +
  "Media sentence 1 — the setup: a CHARACTERIZED role ('a burned-out night nurse', never a proper name) plus the specific premise only this title has, setup only. A topic is not a premise — BAN the 'Explores/Delves into/Capturing [topic]' register in any form.\n" +
  "Media sentence 2 — the complication: what goes wrong, what's at stake, the turn that makes the setup a story. Setup-only discipline still applies — the complication is the engine of the premise, never the twist or the ending. If the complication spoils, you chose the wrong complication.\n" +
  "Sentences 1 and 2 must each END on something CONCRETE — a person, object, place, or event at stake — never an abstraction or a theme ('...exploring fame and authenticity' and '...capturing the spontaneity of young love' both fail; nothing is at stake in a theme).\n" +
  "Media sentence 3 — the comparative placement against the snapped item: its DEFAULT shape is the BARE comparative — it OPENS on the comparative adjective and names NO referent ('Quieter and more introspective, with a focus on the clash of fame and normalcy.'). The anchor sits directly above; the referent is implicit. Never echo the anchor's name. 'than the one you snapped' is the marked EXCEPTION: at most ONE card per set may use it, and only where the comparison would be ambiguous without it. If in doubt, omit it — a set with ZERO referent phrases is fully correct.\n" +
  "- RIGHT: 'A small-town notary discovers her signature stamp legally binds anything — starting with her landlord's eviction notice. Half the county lines up outside her office, and the state bar sends someone to take the stamp. Faster and funnier, with the legal stakes played for screwball momentum.'\n" +
  "- WRONG: 'A young journalist tours with a fading rock band, exploring fame and authenticity. Warmer and more nostalgic in tone.' (no complication — nothing goes wrong, nothing is at stake; sentence 1 ends on a theme, not a thing; 'exploring' smuggles the topic register into the ending)\n" +
  "BAN category-membership filler AND recommendation-voice padding in BOTH sentences: 'a classic X', 'a popular Y', 'a typical Z', 'known for', 'crowd-pleaser', 'wide appeal', 'perfect for those who enjoy', 'ideal for anyone who', 'great choice for', and the words 'perfect for', 'ideal for', 'best suited for', 'suited for', 'excellent for', 'great for', 'fans of', 'those who enjoy', 'those who appreciate', 'wholesome', 'must-have', 'sporty look', 'offering a', 'explores', 'delves into', 'journey', 'refreshing experience', 'casual sipping', and 'experience' as a noun for the item itself, in ANY construction.\n" +
  "- RIGHT: 'Similarly dry, with more tropical fruit intensity. The passionfruit leads and a grassy edge cuts in behind it, keeping the sweetness honest. Keeps the crispness and turns up the volume — same spine, louder fruit.'\n" +
  "- WRONG: 'More tropical fruit intensity. A well-balanced and iconic choice.' (sentence 2 is filler — decides nothing)\n" +
  "Do NOT make taste or quality judgments — never 'better', 'smoother', 'superior', 'best'. Be conservative and factual with health, medical, ingestible, or safety-related items; never assert or imply efficacy.";

const buildBackfillPrompt = (mode: string) => {
  const descriptionRule = mode === "uses" ? USES_VOICE : DIFFERENTIATOR_VOICE;

  return (
    "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they dismissed one recommendation — generate a single replacement.\n" +
    "\n" +
    `Recommend exactly ${BACKFILL_MODE_TASK[mode]}\n` +
    "\n" +
    descriptionRule +
    "\n\n" +
    "Hard rules:\n" +
    "- NEVER recommend the detected item itself.\n" +
    "- NEVER recommend any name in the already-shown list (the user has seen these).\n" +
    "- NEVER recommend any name in the REJECTED list. These are items the user thumbs-downed: avoid them AND lean away from their dominant characteristics in your replacement — a rejected item is a signal about what to steer from, not just a name to skip.\n" +
    "\n" +
    'Return JSON only, in this exact shape: { "rek": { "name": string, "description": string } }'
  );
};

async function handleBackfill(backfill: any): Promise<Response> {
  const item = backfill?.detectedItem;
  const mode = backfill?.mode;
  const cleanNames = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.filter((n: unknown): n is string => typeof n === "string")
      : [];
  // Two framings, one banned set: excludeNames are plain "already shown,
  // don't repeat"; rejectedNames were thumbs-downed this snap and also steer
  // the replacement away from their dominant characteristics.
  const excludeNames = cleanNames(backfill?.excludeNames);
  const rejectedNames = cleanNames(backfill?.rejectedNames);

  if (
    !item ||
    typeof item.name !== "string" ||
    typeof mode !== "string" ||
    !(mode in BACKFILL_MODE_TASK)
  ) {
    return Response.json({ error: "Bad backfill request" }, { status: 400 });
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildBackfillPrompt(mode) },
      {
        role: "user",
        content:
          `Detected item: ${item.name}\n` +
          (typeof item.description === "string" && item.description
            ? `Its signature profile: ${item.description}\n`
            : "") +
          (typeof item.category === "string" && item.category
            ? `Category: ${item.category}\n`
            : "") +
          `Already shown (do not repeat): ${excludeNames.join(", ") || "(none)"}\n` +
          `REJECTED (user disliked these — avoid them and lean away from their dominant characteristics): ${
            rejectedNames.join(", ") || "(none)"
          }`,
      },
    ],
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Backfill failed" }, { status: 502 });
  }

  const rek = parsed?.rek;
  const normalize = (s: string) => s.trim().toLowerCase();
  if (!rek || typeof rek.name !== "string" || !rek.name.trim()) {
    return Response.json({ error: "Backfill failed" }, { status: 502 });
  }
  // Belt-and-braces: the model was told, but never trust it — a repeat of the
  // detected item, an excluded name, or a rejected name is a failed backfill,
  // not a rek.
  const banned = new Set([
    normalize(item.name),
    ...excludeNames.map(normalize),
    ...rejectedNames.map(normalize),
  ]);
  if (banned.has(normalize(rek.name))) {
    return Response.json({ error: "Backfill failed" }, { status: 502 });
  }

  return Response.json(
    {
      rek: {
        name: rek.name,
        description:
          typeof rek.description === "string" ? rek.description : "",
      },
    },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// ANCHOR DETAIL — lazy long tier for the detected-item card.
// Text-only (no image): fired when the user taps "Show details" on the
// anchor. The client sends the anchor's ALREADY-DISPLAYED two-sentence
// profile; the one non-negotiable is coherence — the long must DEEPEN the
// exact axis placement that profile established, never re-roll a fresh
// characterization the user would read as contradicting what's on screen.
// Separate prompt for the same reason as backfill: the Katrina-validated
// vision prompt is never touched.
// ---------------------------------------------------------------------------

const ANCHOR_DETAIL_PROMPT =
  "You are a taste-aware recommendation engine. The user snapped a photo of the item below and was shown its two-sentence profile. They tapped 'Show details' — write the longer detail that profile expands into.\n" +
  "\n" +
  "Write ONE sentence per job below — 3 sentences, or 4 only if the optional job earns it. Never more. One paragraph.\n" +
  "- Sentence 1: extend the profile's primary-axis placement (wine = dry vs. sweet; whiskey = smoky vs. smooth; coffee = light vs. dark roast; tools = strength, speed, what it works on) with finer CONCRETE decision words (grapefruit pith, char, bond strength) — never re-characterize on a different axis, never contradict the profile. When the axis is a two-camp fork, NAME the side outright even if the profile only implied it — for whisky, say whether there is peat/smoke ('no peat here' / 'gently peated'); the reader may not know that 'smooth' means unpeated.\n" +
  "- Sentence 2: place it against one or two NAMED close neighbors in its category — how it differs, in plain decision words.\n" +
  "- Sentence 3: one concrete moment or pairing where it wins.\n" +
  "- Optional sentence 4: where a neighbor wins instead.\n" +
  "The FINAL WORD of the paragraph must be a concrete noun — a food, a moment, a place, a task. Never end on a verb phrase or a mood.\n" +
  "NEVER repeat the item's name — the title sits directly above this text.\n" +
  "NEVER restate the profile's sentences in other words — the user just read them.\n" +
  "Decision rule: if a phrase could describe half the category, delete it and say something only this item earns. This is a friend talking across a table, not a magazine review.\n" +
  "BAN these in any construction: 'perfect for', 'ideal for', 'great choice', 'a classic X', 'crowd-pleaser', 'known for', 'gentle caress', 'elegance', 'notes unfold', 'refreshing experience'.\n" +
  "- RIGHT (profile said 'Off-dry and peach-led — ripe stone fruit...'): 'The sweetness stays just off-dry — a ripe-peach roundness rather than sugar, with the acidity tucked underneath it. Against the citrus-sharp styles that dominate the shelf it drinks softer and rounder, nearer a dry Riesling than a grassy Sauvignon Blanc. It earns its place next to spicy takeout — green curry, kung pao — where a sharper white would fight the chilies.' (extends off-dry + peach, adds neighbors and a concrete moment)\n" +
  "- WRONG (profile said 'Smooth and slightly sweet, with notes of vanilla, honey, and a hint of fruitiness'): 'Its silky texture glides across the palate, enhanced by a subtle sweetness akin to clover honey. The vanilla notes are gentle yet persistent, rounding out the soft edges with a comforting warmth... its understated elegance complements without overwhelming.' (nearly double the allowed length; tasting-poetry that could describe fifty bottles; opens by repeating the item's name; never names a neighbor; ends on a mood, not a noun)\n" +
  "\n" +
  'Return JSON only, in this exact shape: { "long": string }';

async function handleAnchorDetail(anchorDetail: any): Promise<Response> {
  const name = anchorDetail?.name;
  const shortDescription = anchorDetail?.shortDescription;
  const category =
    typeof anchorDetail?.category === "string"
      ? anchorDetail.category.trim().toLowerCase()
      : "";

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof shortDescription !== "string" ||
    !shortDescription.trim()
  ) {
    return Response.json({ error: "Bad anchor detail request" }, { status: 400 });
  }

  // Belt-and-braces twin of the client gate: health/medical anchors stay
  // structurally thin — no request path may generate a rich profile for them.
  if (HEALTH_MEDICAL_CATEGORIES.has(category)) {
    return Response.json(
      { error: "Detail not available for this category" },
      { status: 403 }
    );
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 300,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ANCHOR_DETAIL_PROMPT },
      {
        role: "user",
        content:
          `Item: ${name}\n` +
          (category ? `Category: ${category}\n` : "") +
          `Its displayed profile: ${shortDescription}`,
      },
    ],
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Detail failed" }, { status: 502 });
  }

  const long = parsed?.long;
  if (typeof long !== "string" || !long.trim()) {
    return Response.json({ error: "Detail failed" }, { status: 502 });
  }

  return Response.json({ long: long.trim() }, { status: 200 });
}

// ---------------------------------------------------------------------------
// CHAIN — Slice Two steering. Two kinds, one branch:
//   kind "steer"  — "+ More like this" on a rek card. The anchor is the line
//     origin, the chained item the endpoint; the five new reks EXTRAPOLATE
//     that line (never average back). Trail marks shade/confirm, rejected
//     items steer away by attribute, and a trail-origin chain is
//     double-weighted (verdict + pursuit).
//   kind "reroll" — "+ More like this" on the anchor. A different job:
//     fresh five along the anchor's own line, everything seen this snap
//     banned. No direction block — there is no chained item.
// Text-only like backfill/anchorDetail — the vision prompt is never touched.
// ---------------------------------------------------------------------------

const CHAIN_MODE_TASK: Record<string, string> = {
  similar:
    "FIVE options that are LIKE the detected item — alternatives to consider.",
  uses:
    "FIVE ways to USE the detected item — recipes, pairings, cocktails, or applications.",
  alternatives:
    "FIVE items that serve a related but DIFFERENT need than the detected item.",
};

const CHAIN_SET_SHAPE =
  'Return JSON only, in this exact shape: { "reks": [ { "name": string, "description": string } ] } — exactly 5 items.';

const buildChainSteerPrompt = (mode: string) => {
  const voice = mode === "uses" ? USES_VOICE : DIFFERENTIATOR_VOICE;
  return (
    "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they have been steering the results. They tapped '+ More like this' on one recommendation — the CHAINED ITEM below. Generate five fresh recommendations pursuing that direction.\n" +
    "\n" +
    `The lane: recommend exactly ${CHAIN_MODE_TASK[mode]}\n` +
    "\n" +
    "THE LINE — core rule: the ANCHOR (detected item) is the origin point; the CHAINED ITEM is where the user walked to. Two points make a line — EXTRAPOLATE it, do not average it. The five new options live BEYOND the chained item in the direction it points away from the anchor, never between the two points.\n" +
    "- RIGHT: anchor is an oaky Napa Cabernet, chained item is a Rioja Reserva → continue toward Old-World structure: Tempranillo crianzas, Brunello, aged Douro reds — leaner and more savory, further from Napa.\n" +
    "- WRONG: anchor is an oaky Napa Cabernet, chained item is a Rioja Reserva → five more Napa Cabernets. (that averages back toward the anchor — the user just told you which way they are walking)\n" +
    "KEPT items shade and CONFIRM the direction — let them sharpen the line, never redefine it. REJECTED items steer away: avoid them AND lean away from their dominant characteristics in every pick — a rejected item is a signal about what to steer from, not just a name to skip.\n" +
    "\n" +
    "SET COMPOSITION — exactly 5 items:\n" +
    "- Positions 1-3: strictly ON the extrapolated line.\n" +
    "- Exactly ONE of positions 4-5 is an honest tangent — an adjacent direction this taste would plausibly love, clearly related, never a category leap. The other of positions 4-5 stays on-line.\n" +
    "- Every card is a genuine recommendation. Zero deliberate duds, zero filler picks.\n" +
    "\n" +
    voice +
    "\n\n" +
    (mode === "uses"
      ? ""
      : "REFERENT OVERRIDE for this task: comparisons are ALWAYS against the CHAINED ITEM — the direction being pursued — not the detected item. The chained item is the implicit referent; do NOT repeat its name.\n\n") +
    "Hard rules:\n" +
    "- NEVER recommend the detected item or the chained item themselves.\n" +
    "- NEVER recommend any name in the NEVER-REPEAT list.\n" +
    "- NEVER recommend any name in the REJECTED list.\n" +
    "\n" +
    CHAIN_SET_SHAPE
  );
};

const buildChainRerollPrompt = (mode: string) => {
  const voice = mode === "uses" ? USES_VOICE : DIFFERENTIATOR_VOICE;
  return (
    "You are a taste-aware recommendation engine. The user snapped a photo, the item below was detected, and they asked for a FRESH SET — a re-roll, not a steer. Five options along the same line the detected item's profile establishes, none of which they have seen.\n" +
    "\n" +
    `Recommend exactly ${CHAIN_MODE_TASK[mode]}\n` +
    "\n" +
    "RE-ROLL RULE: every previously seen name is banned, but the DIRECTION is unchanged — stay on the line the detected item's own profile establishes; do not drift to a new interpretation of the item. KEPT items shade and confirm what the user responded to. REJECTED items steer away: avoid them AND lean away from their dominant characteristics — a rejected item is a signal about what to steer from, not just a name to skip.\n" +
    "\n" +
    "SET COMPOSITION — exactly 5 items, ALL on the detected item's line (a re-roll has no tangent). Every card is a genuine recommendation. Zero deliberate duds, zero filler picks.\n" +
    "\n" +
    voice +
    "\n\n" +
    "Hard rules:\n" +
    "- NEVER recommend the detected item itself.\n" +
    "- NEVER recommend any name in the NEVER-REPEAT list.\n" +
    "- NEVER recommend any name in the REJECTED list.\n" +
    "\n" +
    CHAIN_SET_SHAPE
  );
};

async function handleChain(chain: any): Promise<Response> {
  const item = chain?.detectedItem;
  const mode = chain?.mode;
  const kind = chain?.kind;

  const cleanNames = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.filter((n: unknown): n is string => typeof n === "string")
      : [];

  if (
    !item ||
    typeof item.name !== "string" ||
    !item.name.trim() ||
    typeof mode !== "string" ||
    !(mode in CHAIN_MODE_TASK) ||
    (kind !== "steer" && kind !== "reroll")
  ) {
    return Response.json({ error: "Bad chain request" }, { status: 400 });
  }

  const chained = chain?.chained;
  if (
    kind === "steer" &&
    (!chained || typeof chained.name !== "string" || !chained.name.trim())
  ) {
    return Response.json({ error: "Bad chain request" }, { status: 400 });
  }

  // Belt-and-braces twin of the client gate (same as anchorDetail): no
  // chain may generate for a health/medical anchor.
  const category =
    typeof item.category === "string" ? item.category.trim().toLowerCase() : "";
  if (HEALTH_MEDICAL_CATEGORIES.has(category)) {
    return Response.json(
      { error: "Chaining not available for this category" },
      { status: 403 }
    );
  }

  const excludeNames = cleanNames(chain?.excludeNames);
  const rejectedNames = cleanNames(chain?.rejectedNames);
  const chainedOrigin = chain?.chainedOrigin === "trail" ? "trail" : "frontier";
  const rawDepth = Number(chain?.chainDepth);
  const chainDepth =
    Number.isFinite(rawDepth) && rawDepth >= 1 ? Math.round(rawDepth) : 1;

  // KEPT tier: weights serialize as labeled ROLES, not scalars — the model
  // reads roles better. "pursued" = chained earlier this snap (strong).
  const trailMarks: string[] = (Array.isArray(chain?.trail) ? chain.trail : [])
    .filter((t: any) => t && typeof t.name === "string" && t.name.trim())
    .map((t: any) => {
      const mark =
        t.mark === "pursued"
          ? "pursued earlier this snap — strong"
          : t.mark === "saved"
          ? "saved"
          : "liked";
      return `- ${t.name} (${mark})`;
    });

  const commonTail =
    `KEPT THIS SNAP (shade and confirm — do not redefine the direction):\n${
      trailMarks.length ? trailMarks.join("\n") : "(none)"
    }\n` +
    `REJECTED THIS SNAP (steer away from their DOMINANT ATTRIBUTES, not just the names): ${
      rejectedNames.join(", ") || "(none)"
    }\n` +
    `NEVER REPEAT (full exclusion union): ${
      excludeNames.join(", ") || "(none)"
    }`;

  const userContent =
    kind === "steer"
      ? `ANCHOR (line origin): ${item.name}\n` +
        (typeof item.description === "string" && item.description
          ? `Its signature profile: ${item.description}\n`
          : "") +
        (category ? `Category: ${category}\n` : "") +
        `DIRECTION (line endpoint — newest chained item): ${chained.name}` +
        (typeof chained.description === "string" && chained.description
          ? ` — ${chained.description}`
          : "") +
        "\n" +
        (chainedOrigin === "trail"
          ? "Chain origin: TRAIL — the user had already KEPT this item, then chose to pursue it. Verdict + pursuit: treat this direction as strongly confirmed (double weight).\n"
          : "Chain origin: FRONTIER — pursued directly from the fresh set. Single weight.\n") +
        `CHAIN DEPTH this snap: ${chainDepth}\n` +
        commonTail
      : `Detected item: ${item.name}\n` +
        (typeof item.description === "string" && item.description
          ? `Its signature profile: ${item.description}\n`
          : "") +
        (category ? `Category: ${category}\n` : "") +
        commonTail;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    // Five cards at the backfill card budget.
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          kind === "steer"
            ? buildChainSteerPrompt(mode)
            : buildChainRerollPrompt(mode),
      },
      { role: "user", content: userContent },
    ],
  });

  const text = completion.choices?.[0]?.message?.content ?? "";
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return Response.json({ error: "Chain failed" }, { status: 502 });
  }

  const normalize = (s: string) => s.trim().toLowerCase();
  // Belt-and-braces: the model was told, but never trust it. Violators are
  // FILTERED and the survivors returned (honest-short over canned-full);
  // 502 only when nothing survives.
  const banned = new Set([
    normalize(item.name),
    ...(kind === "steer" ? [normalize(chained.name)] : []),
    ...excludeNames.map(normalize),
    ...rejectedNames.map(normalize),
  ]);

  const raw: RawRek[] = Array.isArray(parsed?.reks) ? parsed.reks : [];
  const seen = new Set<string>();
  const reks: { name: string; description: string }[] = [];
  for (const r of raw) {
    if (!r || typeof r.name !== "string" || !r.name.trim()) continue;
    const key = normalize(r.name);
    if (banned.has(key) || seen.has(key)) continue;
    seen.add(key);
    reks.push({
      name: r.name,
      description: typeof r.description === "string" ? r.description : "",
    });
    if (reks.length === 5) break;
  }

  if (reks.length === 0) {
    return Response.json({ error: "Chain failed" }, { status: 502 });
  }
  if (reks.length < 5) {
    console.warn(
      `RekSnap chain: only ${reks.length}/5 reks survived exclusion filtering (kind: ${kind})`
    );
  }

  return Response.json({ reks }, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // Backfill requests are text-only and carry no image.
    if (body?.backfill && typeof body.backfill === "object") {
      return await handleBackfill(body.backfill);
    }

    // Anchor-detail requests are text-only and carry no image.
    if (body?.anchorDetail && typeof body.anchorDetail === "object") {
      return await handleAnchorDetail(body.anchorDetail);
    }

    // Chain requests (steer / re-roll) are text-only and carry no image.
    if (body?.chain && typeof body.chain === "object") {
      return await handleChain(body.chain);
    }

    const image = typeof body?.image === "string" ? body.image : "";

    if (!image.startsWith("data:image/")) {
      return Response.json({ error: "Missing image" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      temperature: 0.7,
      // Three lists of five is ~triple the output of the old single list —
      // raised well above 3x the old 1500 cap so the JSON never truncates.
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: image } }],
        },
      ],
    });

    const text = completion.choices?.[0]?.message?.content ?? "";

    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json(
        { error: "Could not read that photo." },
        { status: 502 }
      );
    }

    const detected = parsed?.detected_item;
    const results = parsed?.results;

    if (
      !detected ||
      typeof detected.name !== "string" ||
      !results ||
      typeof results !== "object"
    ) {
      return Response.json(
        { error: "Could not read that photo." },
        { status: 502 }
      );
    }

    const normalize = (s: string) => s.trim().toLowerCase();
    const detectedName = normalize(detected.name);

    // Clean a single list: drop the detected item, drop intra-list dupes,
    // cap at 5, and normalise the rek shape.
    const cleanList = (raw: unknown, listName: string): SnapRekOut[] => {
      const arr: RawRek[] = Array.isArray(raw) ? raw : [];
      const seen = new Set<string>();
      const out: SnapRekOut[] = [];
      for (const r of arr) {
        if (!r || typeof r.name !== "string") continue;
        const key = normalize(r.name);
        if (key === detectedName) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: r.name,
          description: typeof r.description === "string" ? r.description : "",
          rank: typeof r.rank === "number" ? r.rank : out.length + 1,
        });
        if (out.length === 5) break;
      }
      // Re-rank sequentially so ranks are always 1..n after filtering.
      const ranked = out.map((r, i) => ({ ...r, rank: i + 1 }));
      if (ranked.length < 5) {
        console.warn(
          `RekSnap: only ${ranked.length} reks in "${listName}" after filtering (detected_item: "${detected.name}")`
        );
      }
      return ranked;
    };

    const cleaned = {
      similar: cleanList(results.similar, "similar"),
      uses: cleanList(results.uses, "uses"),
      alternatives: cleanList(results.alternatives, "alternatives"),
    };

    // Fail only if every list is empty — a partial result is still usable.
    if (
      cleaned.similar.length === 0 &&
      cleaned.uses.length === 0 &&
      cleaned.alternatives.length === 0
    ) {
      return Response.json(
        { error: "Could not read that photo." },
        { status: 502 }
      );
    }

    const allowedModes = ["similar", "uses", "alternatives"] as const;
    let mode: (typeof allowedModes)[number] = allowedModes.includes(parsed?.mode)
      ? parsed.mode
      : "similar";
    // Never default to a mode whose list came back empty.
    if (cleaned[mode].length === 0) {
      mode =
        allowedModes.find((m) => cleaned[m].length > 0) ?? "similar";
    }

    return Response.json(
      {
        detected_item: {
          name: detected.name,
          description:
            typeof detected.description === "string"
              ? detected.description
              : "",
          category:
            typeof detected.category === "string" && detected.category.trim()
              ? detected.category.trim().toLowerCase()
              : "unknown",
        },
        mode,
        results: cleaned,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("RekSnap route error:", err);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}

type SnapRekOut = { name: string; description: string; rank: number };
