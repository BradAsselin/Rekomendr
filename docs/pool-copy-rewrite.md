# Pool Copy Rewrite — Draft for Brad's Review

**Status: DRAFT — data-only proposal, NOT applied.** Written 2026-07-19 (overnight) from disk at `main` @ `48317fa`. Nothing here touches the data files until Brad approves; the pool files are marked `AUTO-GENERATED. Do not hand edit.` (`movies.enriched.ts:1`) — applying this means either editing that header convention or re-running generation with this copy as the source of truth. Brad's call at apply time.

**Why:** the canned pools are the deterministic first impression (Play → comfort-core) and still speak the pre-July-3 register. The July-3/July-11 grammar work rewrote the AI prompts only; the pool files were last touched 2026-01-03.

**Grammar applied (the shipped search-lane short spec, `rekomendrEngine.ts:621-625`):** exactly two sentences; sentence 1 opens with a characterized role + the concrete premise only this title has; sentence 2 is the complication; setup only, never a twist; end on a concrete noun or stake; banned endings ("leading to...", "hilarity ensues", "nothing will ever be the same", "a journey of self-discovery") and the recommendation-voice tics ("crowd-pleaser", "perfect for", "fans of", "must-watch", "explores themes of") never appear. Wine: sentence 1 opens on dry-vs-sweet placement + concrete decision words; sentence 2 a concrete moment or contrast, ending on a concrete noun.

**Finding (corrects the typed-lane trace):** the comfort-core deck lists ten titles (`starterDecks.ts:19-30`) but four — The Princess Bride, The Sandlot, The Goonies, School of Rock — are **not in the movies pool**, and `getTop5FromDeck` skips missing titles (`deckSelector.ts:53-56`). **The actual one-button first five is: Back to the Future, The Shawshank Redemption, Forrest Gump, Ocean's Eleven, Chef.** These five got the most care below (including proposed longs).

**Long-tier scope, stated honestly:** T1 movie longs are one-two-sentence recommendation-voice blurbs; T2/T3 longs are auto-generated ~300-word essays (`movies.enriched.ts:212` and onward — every banned tic: "explores themes of", "delves into", "resonates", "lingers long after") and are unusable as-is. This doc delivers: **every short across all four pools**, plus **proposed longs for the first-impression five**. The remaining ~100 longs need the same wholesale treatment under the July-11 long spec (quoted at the end) — that is a dedicated second copy session, not a reason to hold the shorts.

Format per entry: **now** = current `short`, verbatim from disk. **new** = proposed replacement.

---

## Movies (`src/data/pools/movies.enriched.ts`, 52 entries)

### T1

**Forrest Gump (1994)**
- now: "A kind-hearted man with a simple outlook drifts through major moments of American history—never losing his decency or his love."
- new: "A slow-running, sweet-natured Alabama man keeps stumbling into the middle of American history — the Army, ping-pong diplomacy, a shrimp boat — without ever quite noticing. The one thing he does notice is Jenny, and she keeps slipping out of reach."

**The Shawshank Redemption (1994)** *(first-impression five)*
- now: "Two prisoners form an unlikely friendship over decades—building hope inside a place designed to crush it."
- new: "A quiet banker arrives at a brutal Maine prison with a life sentence for murdering his wife, and starts making himself useful to everyone from the librarian to the warden. His friendship with the yard's veteran fixer becomes the one thing the institution can't confiscate."

**The Dark Knight (2008)**
- now: "Batman faces a villain who doesn’t want money or power—just chaos—and Gotham becomes a moral pressure cooker."
- new: "A masked vigilante, a crusading DA, and an honest cop finally have Gotham's mob cornered — until the mob, desperate, hires a man in clown paint with no name and no demands. Every plan in the city starts bending around a person who only wants to watch it break."

**Titanic (1997)**
- now: "A love story ignites aboard the ‘unsinkable’ ship—right before history does what it does."
- new: "A first-class girl being marched into an engagement she dreads meets a steerage kid who won his ticket in a card game, on a liner the papers call unsinkable. Everyone on board has four days and an iceberg they don't know about."

**Jurassic Park (1993)**
- now: "A dinosaur theme park finally opens—then the power goes out and wonder turns into survival fast."
- new: "A billionaire flies two paleontologists to a private island to bless his secret attraction: living, breathing dinosaurs behind electric fences. Then a storm rolls in, an employee cuts the power for a payday, and the fences stop being fences."

**Back to the Future (1985)** *(first-impression five)*
- now: "A teenager gets thrown back to the 1950s and accidentally threatens his own existence—so he has to fix the timeline without losing his mind."
- new: "A teenager gets stranded in 1955 by his friend's plutonium-powered DeLorean, in the town where his parents are still in high school. His first mistake: accidentally taking his father's place in the moment his parents were supposed to meet."

**The Matrix (1999)**
- now: "A hacker learns reality might be a manufactured illusion—and the truth comes with a war attached."
- new: "A cubicle programmer who moonlights as a hacker keeps finding the same question in his machines: what is the Matrix? The strangers who finally answer it offer him a pill, a war, and the news that his entire life has been a rendering."

**Inception (2010)**
- now: "A thief who steals secrets from dreams is offered a shot at redemption—if he can plant an idea instead of taking one."
- new: "A corporate thief who works inside targets' dreams is offered the one job that could buy his way home to his kids: don't steal an idea, plant one. The catch is that planting takes a dream inside a dream inside a dream, and his own subconscious keeps showing up armed."

**Gladiator (2000)**
- now: "A betrayed Roman general is forced into the arena—then turns vengeance into a public reckoning."
- new: "Rome's favorite general is marked for death the night the old emperor names him protector instead of the emperor's own son. He resurfaces as a nameless gladiator — and his path back to the new emperor runs straight through the Colosseum crowd."

**Goodfellas (1990)**
- now: "A street-level rise through the mob—seductive at first, then claustrophobic as the consequences close in."
- new: "A Brooklyn kid who always wanted to be a gangster gets his wish, running cargo heists and comped tables with the neighborhood crew. The life pays exactly as advertised until the bodies, the wiretaps, and the cocaine start compounding interest."

**Saving Private Ryan (1998)**
- now: "A squad is sent behind enemy lines to bring one soldier home—at a cost that keeps rising."
- new: "Days after wading through Omaha Beach, a captain gets a new mission: find one paratrooper — the last surviving brother of four — somewhere in occupied Normandy and send him home. Eight men march into the hedgerows doing arithmetic about what one life is worth."

**The Godfather (1972)**
- now: "A powerful crime family tries to secure its future—pulling a reluctant son into a life he didn’t want."
- new: "A New York crime patriarch refuses to bankroll the heroin trade, and the other families decide he's in the way. His war-hero son — the one kept clean, the one with the American girlfriend — starts getting drawn toward the family desk."

**Pulp Fiction (1994)**
- now: "Interlocking crime stories collide in L.A.—stylish, funny, violent, and oddly philosophical in bursts."
- new: "Two hitmen on a routine briefcase pickup, a boxer paid to throw a fight, and a gangster's wife on a chaperoned night out keep colliding across a few days in Los Angeles. Every errand goes sideways in a different direction, told out of order so the connections land late."

**The Lion King (1994)**
- now: "A young lion is driven from home after tragedy—then has to decide whether to run from the past or face it."
- new: "A lion cub who can't wait to be king is maneuvered by his uncle into believing his father's death was his fault, and runs. Years of no-worries exile later, the kingdom he abandoned comes looking for him."

**Toy Story (1995)**
- now: "A cowboy toy panics when a flashy new space ranger steals the spotlight—and they end up on an adventure outside the house."
- new: "A pull-string cowboy has been his kid's favorite toy for years when a birthday delivers a space ranger who doesn't know he's a toy. One jealous shove later, both of them are lost in the neighborhood with a house move days away — and the toy-torturing kid next door in between."

**Finding Nemo (2003)**
- now: "A cautious father crosses the ocean to find his son—teaming up with an unforgettable, optimistic friend along the way."
- new: "An overprotective clownfish watches a dive boat take his only son off the reef, and swims after it with nothing but a boat's name to go on. His one companion is a blue tang who forgets everything ten seconds after it happens — including, occasionally, the mission."

**The Avengers (2012)**
- now: "A team of superheroes that barely tolerates each other has to work together before the world gets flattened."
- new: "A spy agency drags a billionaire in a metal suit, a thawed super-soldier, a thunder god, and a scientist with a rage problem onto one flying aircraft carrier to stop a stolen cosmic cube. The invasion is scheduled; the team hasn't stopped arguing long enough to notice."

**Star Wars: A New Hope (1977)**
- now: "A farm kid, a rogue, and a princess get pulled into a rebellion—while a planet-killing weapon looms overhead."
- new: "A moisture-farm kid buys two second-hand droids, and one of them is carrying a rebel princess's stolen battle-station plans and a plea for help. The old hermit over the ridge turns out to know exactly what the message means — and the station it describes can crack planets."

**E.T. the Extra-Terrestrial (1982)**
- now: "A lonely kid befriends a stranded alien—and their bond becomes the only way home."
- new: "A latchkey kid in a fresh-divorce household finds a stranded botanist from another planet hiding in the toolshed and smuggles him inside among the stuffed animals. Keeping him secret gets harder as the two start sharing feelings — literally — and government vans start circling the block."

**A Few Good Men (1992)**
- now: "A military lawyer takes a case that looks simple—until it points straight at the chain of command."
- new: "A Navy lawyer famous for plea-bargaining everything draws two Marines who killed a squadmate at Guantanamo — and won't take a deal, because they say they were following orders. The order in question is one the base commander insists doesn't exist."

### T2

**The Martian (2015)**
- now: "A stranded astronaut uses ingenuity and resilience to survive alone on Mars while awaiting rescue."
- new: "An astronaut-botanist is left for dead on Mars when a storm forces his crew to launch without him, with the next mission four years and fifty million miles away. He starts doing the math out loud: water, calories, potatoes, and how to tell NASA he's alive with hardware from the 1990s."

**Moneyball (2011)**
- now: "A baseball manager challenges traditional scouting by using data analytics to build a competitive team on a limited budget."
- new: "The general manager of baseball's poorest team loses his three best players in one winter and can't outbid anyone for replacements. So he hires a Yale economics kid who buys wins on a spreadsheet — and declares war on a century of scouts, including his own."

**Ford v Ferrari (2019)**
- now: "A gripping drama capturing the fierce rivalry and innovation behind Ford's quest to beat Ferrari at the 1966 Le Mans race."
- new: "After Ferrari humiliates Ford in a failed buyout, Ford's executives order a race car built for one purpose: beat Ferrari at Le Mans. The designer they hire and the hot-tempered British driver he insists on spend as much time fighting Ford's own suits as building the car."

**Apollo 13 (1995)**
- now: "A gripping dramatization of NASA's harrowing Apollo 13 mission, showcasing the intense struggle for survival amid a life-threatening space crisis."
- new: "Three astronauts are most of the way to the Moon when an oxygen tank explodes and their spacecraft starts bleeding power and air. Houston's engineers have days, slide rules, and a lunar lander built for two to get three men home."

**Cast Away (2000)**
- now: "A FedEx executive survives a plane crash and must learn to survive alone on a deserted island, confronting isolation and the will to live."
- new: "A FedEx systems engineer who lives by the clock washes up on an uninhabited Pacific island as the only survivor of a cargo-plane crash. What's in the surviving packages — and a volleyball — become his tools, his calendar, and his company."

**Argo (2012)**
- now: "A tense thriller that follows a CIA operative's daring mission to rescue hostages during the Iran hostage crisis by orchestrating a fake movie production."
- new: "Six American diplomats slip out the back as the Tehran embassy falls in 1979 and end up hiding in the Canadian ambassador's house with no way out of the country. The CIA's best available idea: fly in one officer posing as a producer scouting a fake sci-fi movie, and walk them out as his film crew."

**The Social Network (2010)**
- now: "A sharp, intense drama exploring the complex rise of a tech visionary amid legal battles and personal conflicts."
- new: "A Harvard sophomore gets dumped, hacks the campus face-books in one furious night, and rides the fallout into building a site that swallows first the school, then the world. The framing device is two lawsuits — one from his best friend, whose money started it."

**The Prestige (2006)**
- now: "Two rival magicians engage in a dangerous battle of wits and deception to create the ultimate illusion."
- new: "Two Victorian stage magicians, once partners, turn enemies after a trick kills one of their wives. Their duel escalates from sabotaged shows to stolen notebooks to one impossible illusion — a man who walks through one door and out another across the theater."

**Zodiac (2007)**
- now: "A gripping exploration of the obsessive hunt for a serial killer that unravels the lives of those consumed by the case."
- new: "A killer who names himself in cipher-laced letters to San Francisco newspapers keeps taunting the city, and the case lands on two reporters and a homicide detective. Years pass, jurisdictions won't share files, and the paper's cartoonist quietly becomes the only one still pulling the thread."

**Heat (1995)**
- now: "An intense cat-and-mouse game unfolds between a meticulous bank robber and a dedicated detective in a sprawling urban landscape."
- new: "A career thief who keeps his life empty enough to walk away in thirty seconds is planning one last run of scores across Los Angeles. The robbery-homicide detective closing on him is just as good and just as hollowed out — and both of them know it before they ever share a table."

**The Fugitive (1993)**
- now: "A doctor wrongfully accused of his wife’s murder races against time to find the real killer while evading relentless law enforcement in a high-stakes thriller packed with intense action and suspense."
- new: "A Chicago surgeon convicted of murdering his wife escapes when his prison bus wrecks, and starts hunting the one-armed man he saw in his house that night. The deputy U.S. marshal assigned to him doesn't care whether he's innocent — that famous exchange happens over a spillway ledge."

**Ocean's Eleven (2001)** *(first-impression five)*
- now: "A charismatic crew of thieves orchestrates a high-stakes casino heist blending clever strategy with witty banter and stylish execution."
- new: "A con man walks out of prison with a plan already built: rob three Las Vegas casinos in one night, all owned by the man now dating his ex-wife. He recruits ten specialists who each get one piece of the vault — a vault every one of them knows is impossible."

**Groundhog Day (1993)**
- now: "A cynical weatherman relives the same day repeatedly, forcing him to confront his flaws and discover unexpected joy in a whimsical, feel-good tale."
- new: "A sneering TV weatherman is stuck living the same small-town February 2nd over and over. No consequences carry forward — except what it does to him."

**Chef (2014)** *(first-impression five)*
- now: "A talented chef rediscovers his passion for cooking and life by launching a food truck that reconnects him with his family and creativity."
- new: "An L.A. chef torches his career in one viral meltdown at a food critic, then lets his ex-wife talk him into a battered Miami food truck. The Cuban-sandwich drive back across the country doubles as his first real time with the ten-year-old son riding shotgun."

**About Time (2013)**
- now: "A young man discovers he can time travel and uses this gift to deepen his relationships and find true love in a heartfelt romantic drama."
- new: "At twenty-one, an awkward young lawyer learns the family secret: the men can revisit their own past, stepping back into any moment they've lived. He mostly uses it to un-botch first dates — until the fine print about what each trip can cost starts coming due."

**Little Miss Sunshine (2006)**
- now: "A dysfunctional family's road trip to a children's beauty pageant reveals quirky bonds and unexpected resilience through sharp humor and heartfelt moments."
- new: "A seven-year-old qualifies for a California kiddie pageant, so her whole fraying family — bankrupt motivational-speaker dad, silent teenage brother, heroin-dabbling grandpa, suicidal uncle — crams into a yellow VW bus with a failing clutch. Eight hundred miles is a long way for people this close to the edge."

**The Big Short (2015)**
- now: "A sharp, witty exploration of the 2008 financial crisis through the eyes of unlikely investors betting against the housing market."
- new: "A one-eyed fund manager reads thousands of mortgage filings nobody else opened and starts shorting the American housing market — years early, with his investors screaming. The handful of outsiders who copy the trade have to be right about a collapse the entire system insists is impossible."

**Spotlight (2015)**
- now: "A dedicated team of investigative journalists uncovers a harrowing scandal within a powerful institution, revealing systemic abuse and the pursuit of justice."
- new: "The Boston Globe's four-person investigations team is pointed by a new editor at a story the paper itself once buried: priests accused of abuse, quietly shuffled between parishes. The trail runs through sealed court records and straight into the Church's grip on the paper's own city."

**The Imitation Game (2014)**
- now: "A gripping drama that unravels the intense efforts of a brilliant mathematician racing against time to crack an unbreakable code during World War II."
- new: "An abrasive Cambridge mathematician talks his way into Britain's secret wartime codebreaking estate and starts building a machine to beat the Nazi Enigma cipher — over the objections of nearly everyone he works with. The machine is expensive, unproven, and slower than the U-boats sinking convoys every day it doesn't work."

**Arrival (2016)**
- now: "A linguist races against time to communicate with mysterious extraterrestrial visitors, unraveling a profound connection that challenges human perception of language and time."
- new: "Twelve black ships park over twelve countries, and the Army helicopters a linguistics professor to Montana to answer one question: what do they want. Inside, she trades words with seven-limbed beings whose written language has no beginning or end — while the nations comparing notes start going dark one by one."

### T3

**Safety Not Guaranteed (2012)**
- now: "A quirky magazine intern investigates a classified ad seeking a time-travel companion, unraveling a blend of humor and heartfelt discovery."
- new: "A deadpan magazine intern is sent to profile the man behind a classified ad seeking a time-travel partner — 'safety not guaranteed.' The closer she gets to her paranoid, grocery-store-clerk subject, the less sure she is that the story is a joke."

**Hunt for the Wilderpeople (2016)**
- now: "A rebellious city kid and his gruff foster uncle embark on a wild, offbeat journey through New Zealand's wilderness, blending humor and heart in a uniquely uplifting adventure."
- new: "A chubby city foster kid in a haiku phase lands on a remote New Zealand farm with a warm foster aunt and her granite-faced husband. When the arrangement collapses, the kid bolts into the bush — and the old man who goes in after him becomes the co-star of a national manhunt."

**October Sky (1999)**
- now: "A determined young man in a small mining town pursues his dream of building rockets, challenging expectations and inspiring hope."
- new: "In a 1957 West Virginia coal town, a miner's son watches Sputnik cross the sky and starts building rockets with three friends and scavenged scrap. His father runs the mine, the mine is the town's only future, and the launches keep setting things on fire."

**The Fundamentals of Caring (2016)**
- now: "A quirky caregiver and his sarcastic teenage charge embark on a road trip that blends humor and heartfelt moments as they confront personal challenges."
- new: "A grieving writer retrains as a caregiver and gets a client nobody else wants: a foul-mouthed teenager with muscular dystrophy who never leaves the house. Their road trip to see the World's Deepest Pit collects a runaway, a pregnant hitchhiker, and the kid's estranged father's address."

**The Way Way Back (2013)**
- now: "A shy teenager finds unexpected friendship and confidence during a transformative summer working at a quirky water park."
- new: "A fourteen-year-old is dragged to a beach house for the summer by his mother's belittling new boyfriend, who rates him a three out of ten in the car. The kid starts biking off to a shabby water park, where the motor-mouthed manager gives him a job and doesn't tell his family."

**Sing Street (2016)**
- now: "A Dublin teen forms a band to impress a girl and escape his troubled home life, blending 80s music and youthful ambition into a feel-good story."
- new: "A Dublin teenager demoted to a rough Christian Brothers school tells the mysterious older girl across the street that his band needs a model for their video. Now he has a week to have a band — while his parents' marriage disintegrates through the walls and his stoned older brother supplies the record collection."

**The Secret Life of Walter Mitty (2013)**
- now: "A daydreaming photo editor embarks on a global adventure to find a missing negative, blending whimsy with heartfelt self-discovery."
- new: "A photo archivist at a dying magazine — a man whose adventures happen entirely in zone-out daydreams — discovers the negative meant for the final cover is missing. The only lead is the globe-trotting photographer who shot it, which is how a man who has never been anywhere ends up on a helicopter off Greenland."

**Burn After Reading (2008)**
- now: "A darkly comic tale of misfit gym employees who stumble upon a misplaced CIA disc, triggering a chaotic web of espionage and absurd misunderstandings."
- new: "Two gym employees — one saving for cosmetic surgery, one an aggressively dim personal trainer — find a disc of what they think are CIA secrets and try to ransom it back to its furious ex-analyst owner. Nobody in this story, spies included, has any idea what is actually going on."

**Thank You for Smoking (2005)**
- now: "A sharp satire following a charismatic tobacco lobbyist who skillfully spins morality and manipulation in a world where truth is a commodity."
- new: "Big Tobacco's chief spokesman can argue anyone out of anything — he demonstrates on talk shows, in Senate hearings, and to his twelve-year-old son, who's taking notes. Between a crusading senator and a reporter he trusts too much, his gift for spin starts writing checks his life can't cash."

**Source Code (2011)**
- now: "A soldier repeatedly relives the last eight minutes of another man's life to prevent a catastrophic train bombing in this mind-bending sci-fi thriller."
- new: "A helicopter pilot wakes on a Chicago commuter train in another man's body, eight minutes before a bomb destroys it — then wakes again in a capsule where handlers keep sending him back into the same eight minutes. His mission is the bomber's identity, not the passengers; he starts disagreeing."

**Moon (2009)**
- now: "A solitary astronaut nearing the end of a three-year lunar mining mission confronts unsettling discoveries that challenge his understanding of identity and reality."
- new: "The lone employee of a lunar mining station is two weeks from the end of a three-year contract, with only a soft-spoken computer for company and a live feed home that never works. After a crash out on the surface, he starts finding things on the base that contradict his own memory."

**Ex Machina (2014)**
- now: "A reclusive tech CEO invites a young programmer to administer a Turing test on his advanced humanoid AI, sparking a tense exploration of consciousness and control."
- new: "A young coder wins a company lottery to spend a week at his reclusive CEO's mountain compound, and learns the real prize: testing whether the android woman in the glass room is truly conscious. Sessions with her run opposite drinking nights with his host, and both of them are studying him."

---

## TV (`src/data/pools/tv.enriched.ts`, 20 entries)

### T1

**Seinfeld (1989)**
- now: "Four friends in New York obsess over the tiny, meaningless details of everyday life—and somehow make it endlessly funny."
- new: "A stand-up comedian and his three profoundly petty friends treat every minor social contract — the low talker, the close talker, the re-gift — as a hill to die on. No one learns anything, ever, and that's the engine."

**Friends (1994)**
- now: "A tight-knit group of friends navigates work, love, and adulthood while hanging out in the same coffee shop."
- new: "A runaway bride in a wedding dress lands on her old friend's couch in Manhattan, joining five twenty-somethings orbiting one coffee shop and two apartments. Ten years of terrible jobs, worse breakups, and the on-again-off-again couple across the hall."

**Cheers (1982)**
- now: "Regulars gather at a Boston bar where everyone knows your name—and your problems."
- new: "A retired relief pitcher runs the Boston basement bar where the same barstools hold the same regulars every night. Then he hires a grad-student cocktail waitress who thinks the place is beneath her, and the sparring starts."

**Frasier (1993)**
- now: "A cultured radio psychiatrist moves back to Seattle and clashes with his down-to-earth family and friends."
- new: "A pompous psychiatrist reinvents himself as a Seattle radio host, then his retired-cop father moves into the pristine apartment with a recliner held together by duct tape and a dog. Add a fussier younger brother and a psychic home-care worker, and the doctor is outnumbered in his own living room."

**The Office (US) (2005)**
- now: "A documentary-style look at a painfully ordinary office—made memorable by awkward humor and unexpected heart."
- new: "A documentary crew embeds with a Scranton paper company whose regional manager believes he is the world's best boss, friend, and entertainer. The camera catches everything the staff's frozen glances say — and the receptionist and the salesman falling for each other over years of desk pranks."

**Parks and Recreation (2009)**
- now: "Optimistic public servants try to make their small town better—despite endless obstacles and personalities."
- new: "A relentlessly optimistic mid-level parks official in small-town Indiana vows to turn a construction pit into a park, one sub-committee at a time. Her department includes a boss ideologically opposed to government itself — and the town hates her meetings."

**Modern Family (2009)**
- now: "Three interconnected families navigate parenting, relationships, and generational chaos."
- new: "A mockumentary follows one sprawling clan: the patriarch with a much-younger Colombian wife, his daughter's picture-perfect suburban household, and his son's family with an adopted baby. Every episode's talking-head confessions contradict what the cameras just saw."

**The Big Bang Theory (2007)**
- now: "Socially awkward scientists collide with the outside world—often with predictable, joke-heavy results."
- new: "Two Caltech physicists — one merely awkward, one with a roommate agreement in triplicate — get a new neighbor: an aspiring actress who waits tables at the Cheesecake Factory. The whiteboard crowd and the normal world start colliding across the hallway."

### T2

**Breaking Bad (2008)**
- now: "A high school chemistry teacher turns to manufacturing methamphetamine after a cancer diagnosis, navigating the dangerous criminal underworld with escalating stakes and moral complexity."
- new: "A high-school chemistry teacher with lung cancer and no savings cooks one batch of methamphetamine with a former student to leave his family something. His product is too good — and his brother-in-law is the local DEA's rising star."

**Better Call Saul (2015)**
- now: "A morally complex lawyer navigates the seedy underbelly of Albuquerque, balancing ambition with the consequences of his choices in a gripping crime drama."
- new: "A reformed con man scrapes by as a public defender in Albuquerque, working out of a nail-salon closet and craving the approval of his brilliant, ailing lawyer brother. Every shortcut he takes works a little too well — this is how a man talks himself into becoming Saul Goodman."

**Mad Men (2007)**
- now: "Explore the complex world of 1960s advertising where ambition, identity, and societal change collide in a stylish, character-driven drama."
- new: "Madison Avenue's most gifted ad man can sell anything — including the identity he's wearing, which belongs to a dead man from a war he'd rather not discuss. Around him, the agency's secretaries, wives, and one ambitious new girl start wanting more than 1960 is offering."

**Succession (2018)**
- now: "A ruthless family power struggle unfolds within a global media empire, blending sharp wit with dark, high-stakes drama."
- new: "An aging media mogul dangles his empire in front of four damaged adult children, then refuses to die, retire, or choose. Every board meeting, wedding, and yacht trip becomes another round of siblings knifing each other for a father's approval that never comes."

**The Bear (2022)**
- now: "A talented chef returns home to save his family’s struggling Chicago sandwich shop, navigating intense kitchen pressures and personal demons with raw authenticity and dark humor."
- new: "A fine-dining prodigy inherits his dead brother's chaotic Chicago beef-sandwich shop, its debts, and its feral kitchen crew. Every service is a panic attack with tickets printing — and the staff didn't ask to be turned into a brigade."

**True Detective (2014)**
- now: "Two detectives with troubled pasts investigate a series of ritualistic murders in Louisiana, unravelling a dark and complex conspiracy."
- new: "In 1995, a nihilist philosopher-detective and his good-ol'-boy partner catch a Louisiana murder staged with antlers and spiral symbols. In 2012, separated and ruined in different ways, both men are being interviewed about that case — because someone thinks it never actually closed."

**Stranger Things (2016)**
- now: "A group of kids in a small town uncover a secret government experiment and a supernatural dimension while searching for their missing friend."
- new: "A twelve-year-old vanishes biking home in 1983 Indiana the same night a girl with a shaved head and a number tattoo walks out of the woods near a government lab. His D&D-playing friends hide her in a basement fort while something from her side of the fence starts hunting the town."

**Sherlock (2010)**
- now: "A brilliant detective and his loyal companion unravel complex crimes in modern London, blending sharp intellect with thrilling suspense."
- new: "A self-described high-functioning sociopath consults for Scotland Yard in present-day London, deducing lives from phone scratches and tan lines. His new flatmate — an army doctor invalided home from Afghanistan — starts blogging the cases, and someone clever starts leaving puzzles addressed to them both."

### T3

**Brooklyn Nine-Nine (2013)**
- now: "A quirky ensemble of detectives balances crime-solving with hilarious office antics in a vibrant New York precinct."
- new: "Brooklyn's most gifted, least mature detective meets his match when a robotically stoic new captain takes over the precinct and demands he wear a tie. The squad closes real cases between heists, bets, and the annual Halloween contest for the title of Amazing Detective/Genius."

**Schitt's Creek (2015)**
- now: "A wealthy family adjusts to life in a small town after losing their fortune, blending sharp humor with heartfelt moments."
- new: "A video-store magnate, his soap-opera-diva wife, and their two spectacularly sheltered adult children lose everything but one asset: a small town they once bought as a joke. They move into two adjoining motel rooms — wardrobe intact, life skills absent."

**Ted Lasso (2020)**
- now: "An American football coach unexpectedly leads a British soccer team, blending humor and heart in a story about optimism and teamwork."
- new: "A Kansas college-football coach who has never seen a soccer match is hired to manage a Premier League club — by an owner who wants the team destroyed to spite her ex-husband. His weapons are biscuits, belief, and a locker room that despises him."

**Scrubs (2001)**
- now: "A quirky medical comedy-drama that blends heartfelt moments with offbeat humor in the chaotic world of hospital interns."
- new: "A daydream-prone medical intern narrates his first years at Sacred Heart, where the janitor has declared war on him and his mentor communicates in rants. The fantasy cutaways keep colliding with the real thing — patients who don't all make it."

---

## Books (`src/data/pools/books.enriched.ts`, 20 entries)

### T1

**To Kill a Mockingbird (1960)**
- now: "A young girl observes her small Southern town—and its moral failures—through the lens of her father’s quiet integrity."
- new: "A scrappy six-year-old in Depression-era Alabama spends her summers daring her brother to touch the shut-in neighbor's porch. Then her lawyer father agrees to defend a Black man accused of assaulting a white woman, and the whole town turns its weight on their family."

**1984 (1949)**
- now: "A man struggles to hold onto truth and individuality inside a society built on constant surveillance and control."
- new: "A records clerk whose job is rewriting old newspapers to match the Party's current truth starts keeping an illegal diary. In a state where the telescreen watches every room and children inform on parents, he compounds the crime — he falls in love."

**The Great Gatsby (1925)**
- now: "A mysterious millionaire throws lavish parties while quietly chasing a dream that may already be gone."
- new: "A Midwestern bond salesman rents the cottage next to a Long Island mansion where a mysterious millionaire throws parties he never attends. The parties, it turns out, are bait — for the married woman across the bay, whose dock light the host watches at night."

**The Catcher in the Rye (1951)**
- now: "A disaffected teenager wanders New York, wrestling with adulthood, phoniness, and his own confusion."
- new: "A sixteen-year-old flunks out of his fourth prep school and, rather than face his parents, spends three days drifting through New York hotels, bars, and old acquaintances. The only person he actually wants to see is his kid sister — everyone else is a phony, by his exhaustive count."

**The Lord of the Rings (1954)**
- now: "A small group carries an impossible burden across a vast world to stop a rising darkness."
- new: "A country hobbit inherits his uncle's magic ring and learns it is the weapon a returning dark lord needs to end the world's free peoples. The only unmaking is the volcano where it was forged — a walk across a continent, carrying a thing that corrupts whoever holds it."

**Harry Potter and the Sorcerer's Stone (1997)**
- now: "An ordinary kid discovers he belongs to a hidden world of magic—and everything changes."
- new: "An orphan raised in a cupboard under his aunt's stairs gets a letter — hundreds of letters — announcing he's a wizard, famous in a world he's never seen for surviving an attack he can't remember. At school, something is trying to steal what's hidden beneath a trapdoor guarded by a three-headed dog."

**The Hobbit (1937)**
- now: "A comfort-loving hobbit is reluctantly pulled into an adventure far bigger than himself."
- new: "A hobbit whose idea of excitement is a second breakfast finds thirteen dwarves and a wizard at his door, recruiting him — as the burglar — to reclaim a mountain of treasure from a dragon. Somewhere under the goblin tunnels, he wins a riddle game and pockets a ring."

**Pride and Prejudice (1813)**
- now: "A sharp-witted woman navigates love, class, and first impressions in a tightly observed social world."
- new: "The second of five unmarried sisters — the clever one — overhears a rich newcomer's friend dismiss her as tolerable at a country ball, and files him permanently under insufferable. Her family's future depends on marriages; her judgment of this particular man depends on information that keeps turning out wrong."

**The Alchemist (1988)**
- now: "A shepherd follows a dream across continents, guided by intuition, coincidence, and faith."
- new: "An Andalusian shepherd boy dreams twice of treasure buried at the Egyptian pyramids and sells his flock to go find it. The route runs through a crystal shop in Tangier, a desert caravan, and an alchemist who keeps answering questions with harder ones."

**The Da Vinci Code (2003)**
- now: "A symbologist races through Europe uncovering secrets hidden in art, religion, and history."
- new: "A Harvard symbologist is summoned to the Louvre at midnight, where the murdered curator lies posed inside a circle of his own codes. Deciphering them — with the curator's cryptographer granddaughter, one step ahead of the police and an albino assassin — points at a secret the Church has guarded for two thousand years."

**The Hunger Games (2008)**
- now: "Teenagers are forced into a televised fight for survival—while the world watches."
- new: "In a nation that punishes its districts by making their children fight to the death on live television, a sixteen-year-old hunter volunteers to take her little sister's place. Surviving the arena means playing to the cameras — including a romance she isn't sure is strategy."

**The Girl with the Dragon Tattoo (2005)**
- now: "A journalist and a brilliant hacker dig into a decades-old mystery with dangerous consequences."
- new: "A disgraced financial journalist is hired by an aging industrialist to solve a forty-year-old disappearance: a girl who vanished from an island the family owns, during a bridge closure that trapped everyone on it. His research partner is a pierced, antisocial hacker with a photographic memory and her own account to settle."

**Sapiens: A Brief History of Humankind (2011)**
- now: "A sweeping look at how biology, culture, and belief shaped modern humans."
- new: "A historian retells our species' whole run — from one unremarkable ape among six human species to the only one left — as three revolutions: cognitive, agricultural, scientific. The recurring provocation: the things that organize us at scale, from money to nations to gods, are shared fictions."

**Educated (2018)**
- now: "A woman raised in an isolated survivalist family fights for education and self-definition."
- new: "A girl raised by survivalists in the Idaho mountains — no school, no birth certificate, injuries treated with herbs while her father awaits the End of Days — teaches herself enough algebra to test into college at seventeen. Every term she learns (the Holocaust, the civil rights movement) widens a gap her family will demand she close."

**The Road (2006)**
- now: "A father and son walk through a devastated world, clinging to each other and to moral decency."
- new: "A father and his young son push a shopping cart south through a burned America, toward a coast that may hold nothing. The father's whole theology fits in one promise to the boy — that they're the good guys, carrying the fire — and the road keeps testing it."

### T2

**The Big Short (2010)**
- now: "An incisive exploration of the 2008 financial crisis through the eyes of maverick investors who foresaw the collapse of the housing market."
- new: "A reporter follows the handful of investors who actually read the mortgage bonds — a one-eyed doctor turned fund manager, a pair of garage-startup kids, a Wall Street cynic — as they bet billions on America's housing market collapsing. Being right means the fraud is real, and nobody will believe them until it detonates."

**Outliers (2008)**
- now: "Explores how extraordinary success results from a blend of talent, opportunity, and cultural legacy, challenging traditional notions of achievement."
- new: "A journalist dismantles the lone-genius story of success by auditing the actual ledgers: birth months in hockey leagues, the ten thousand hours behind the Beatles, why one generation of New York lawyers all had the same résumé. The argument is that when and where you're born does work we prefer to credit to character."

**Into the Wild (1996)**
- now: "A gripping nonfiction adventure tracing a young man's journey into the Alaskan wilderness to seek freedom and self-discovery beyond societal constraints."
- new: "A top student from a comfortable family donates his savings to charity, burns the cash in his wallet, and disappears into two years of drifting that end at an abandoned bus in the Alaskan bush. The writer retraces his route through the people who fed him, drove him, and warned him — assembling how a smart kid's pilgrimage went four months too long."

### T3

**A Man Called Ove (2012)**
- now: "A curmudgeonly widower’s rigid routine is upended by unexpected friendships that reveal the warmth beneath his gruff exterior."
- new: "A Swedish widower who patrols his block enforcing parking rules has private plans to join his late wife — plans the world keeps interrupting. It starts when the new neighbors flatten his mailbox with a trailer, and the pregnant wife decides the angriest man on the street is going to teach her to drive."

**The Nightingale (2015)**
- now: "Two sisters navigate the harrowing realities of World War II in Nazi-occupied France, confronting courage, sacrifice, and the complexities of love and survival."
- new: "In occupied France, a cautious schoolteacher's wife has a German officer billeted in her home while her reckless younger sister starts walking downed Allied airmen over the Pyrenees. Each sister thinks the other has chosen wrong, and both are keeping secrets that could get the family shot."

---

## Wine (`src/data/pools/wine.enriched.ts`, 16 entries)

### T1

**Dr. Loosen 'Dr. L' Riesling (2022)**
- now: "A bright, crowd-friendly Riesling that usually lands in the ‘easy yes’ zone—crisp, aromatic, and not too serious."
- new: "Off-dry and peach-led — ripe stone fruit and a squeeze of lime over a light, spritzy body. Built for spicy takeout and porch afternoons, not a candlelit dinner."

**Kung Fu Girl Riesling (2022)**
- now: "An approachable, slightly off-dry Riesling that’s built for casual drinking and spicy takeout nights."
- new: "Just off-dry — white peach and mandarin up front with enough acidity to keep the sweetness honest. At its best next to pad thai or fish tacos; a rich cream sauce will flatten it."

**Chateau Ste. Michelle Riesling (2022)**
- now: "A dependable grocery-store classic: light sweetness, bright fruit, and easy drinking."
- new: "Lightly sweet — apple and apricot with a soft, round finish that goes down without argument. A weeknight roast-chicken bottle, not a tasting-night centerpiece."

**Kim Crawford Sauvignon Blanc (2022)**
- now: "Crisp, zesty, and unmistakable—this is the ‘clean, bright white’ a lot of people reach for by default."
- new: "Bone-dry and loud — passionfruit and cut grass with a grapefruit-pith bite on the finish. Made for a hot afternoon and a plate of oysters; it will bulldoze a delicate dish."

**Oyster Bay Sauvignon Blanc (2022)**
- now: "A reliable, crisp Sauvignon Blanc that hits the same bright lane without feeling complicated."
- new: "Dry and citrus-sharp — lime and gooseberry with a leaner, quieter profile than the flashier New Zealand labels. A goat-cheese-salad wine that stays out of the food's way."

**Kendall-Jackson Vintner's Reserve Chardonnay (2022)**
- now: "Classic ‘buttery-ish’ California Chardonnay—rounder, softer, and more comforting than crisp whites."
- new: "Dry but plush — baked apple and pineapple wrapped in vanilla and a buttery finish. Built for roast chicken and cream sauces; next to raw shellfish it reads heavy."

**La Crema Sonoma Coast Chardonnay (2022)**
- now: "A step-up Chardonnay: still smooth and friendly, but usually a little cleaner and more ‘put together.’"
- new: "Dry, with the oak dialed back — pear and lemon curd over a mineral line that keeps the richness in check. The Chardonnay for people who found the buttery style too much but aren't ready for steel-tank austerity."

**Meiomi Pinot Noir (2021)**
- now: "A very approachable, plush Pinot-style red that’s built to be easy—smooth, fruit-forward, and low-friction."
- new: "Dry on paper, sweet-fruited in the glass — jammy cherry and cola with soft edges and barely-there tannin. A salmon-or-burgers crowd bottle; drinkers who want Pinot's earthy side will find none of it here."

**Josh Cellars Cabernet Sauvignon (2021)**
- now: "A dependable, weeknight Cab: dark fruit, gentle structure, and an easy finish."
- new: "Dry and soft-shouldered — blackberry and mocha with tannins sanded smooth. A weeknight-steak and pizza-night Cab; it won't reward an hour in a decanter."

**19 Crimes Cabernet Sauvignon (2021)**
- now: "A bold, accessible Cab that leans crowd-pleasing—dark fruit, smooth edges, and easy pairing."
- new: "Dry, dark, and sweet-edged — plum and vanilla with a smoky note and a plush, low-tannin finish. Built for barbecue and party pours; the sweetness will clash with lean, herby dishes."

**Campo Viejo Rioja Reserva (2018)**
- now: "A classic Rioja-style red: smooth, savory-leaning, and food-friendly without being heavy."
- new: "Dry and savory — dried cherry, tobacco, and the vanilla of American oak, with a lighter body than its dark color suggests. It wants food on the table: lamb, chorizo, hard cheese — and it fades on its own."

**La Vieille Ferme Rosé (2022)**
- now: "A clean, dry-ish rosé that’s easy to like: refreshing, light, and not sugary."
- new: "Dry — strawberry and melon over a crisp, stony finish with none of the candy some rosés carry. A picnic and salty-snacks bottle for a hot day, not a wine to contemplate."

### T2

**Vouvray (Chenin Blanc) – Domaine Huet (2022)**
- now: "An off-dry Chenin Blanc that balances vibrant acidity with nuanced minerality, inviting thoughtful reflection through its layered complexity and refined elegance."
- new: "Off-dry — honeyed pear and quince riding a wire of acidity that keeps it tasting lighter than it is. The rare bottle that handles pork with fruit, Thai spice, and a cheese board without losing the thread."

**Grüner Veltliner (Wachau) (2023)**
- now: "A crisp and mineral-driven white that balances bright acidity with subtle herbal notes, inviting thoughtful sipping in a cozy setting."
- new: "Bone-dry — green apple and white pepper over a wet-stone finish, with a radish-y snap no other white quite has. Famous as the wine that survives asparagus and vinaigrettes; drinkers wanting tropical fruit should look elsewhere."

### T3

**Riesling Spätlese (Mosel) (2021)**
- now: "A vibrant off-dry white that balances crisp acidity with subtle sweetness, revealing delicate floral and stone fruit notes wrapped in a cozy, underrated charm."
- new: "Distinctly sweet — apricot and honey at only about eight percent alcohol, with Mosel acidity keeping it nimble instead of sticky. Built for blue cheese, spicy food, or a warm evening with no dinner at all."

**Beaujolais (Gamay) – Cru (2022)**
- now: "This light red reveals vibrant cherry and raspberry notes layered with subtle earthiness, delivering a cozy, underrated gem that invites quiet reflection."
- new: "Dry and light-bodied — crushed raspberry and violet with a faint earthy stem-snap, best with a slight chill on it. The red for roast chicken and charcuterie; drinkers wanting weight and oak will call it thin."

---

## Proposed longs — the first-impression five

Per the shipped long spec (`rekomendrEngine.ts:566-576`): 3-4 sentences — the concrete situation, the texture, a situation-phrased viewing moment ("One for... / Save it for... / Best on..."), optional honest expectation. These five are the deterministic cold-load Play set.

**Back to the Future** — "Every gag is load-bearing: a flyer, a song, a lightning storm, all planted early and paid off to the minute. It moves like a Swiss watch wearing a leather jacket — fast, warm, and impossible to check your phone during. One for a family night where the ages run from ten to seventy. The 1955 jokes land harder the more 1985 you remember, but nothing in it needs a footnote."

**The Shawshank Redemption** — "Decades of prison time pass in narration and small victories: a beer on a rooftop, an opera record over the PA, a library built by weekly letters. It's patient and plainspoken, carried by two performances that never beg. Save it for an evening with room to sit still afterward. Expect quiet — the violence is real but brief, and the movie's pulse is hope doing time."

**Forrest Gump** — "Three decades of American upheaval stream past a man too guileless to be impressed by any of it, from Army barracks to shrimp boats to a bench in Savannah. The tone swings from sight gag to gut-punch without grinding gears. One for a Sunday evening when you want to laugh and get quietly wrecked in the same sitting. Expect the soundtrack to do a lot of remembering for you."

**Ocean's Eleven** — "A vault job assembled piece by piece — the acrobat, the pickpocket, the demolition man — where the pleasure is watching professionals be casually excellent at each other. It's all velvet patter and misdirection; the movie cons you with the same grin the crew uses on the casino. Best on a Friday night with company and snacks. Nobody bleeds; the stakes are money, pride, and an ex-wife."

**Chef** — "A wood-fire restaurant kitchen, a Twitter feud that detonates a career, and a food truck scrubbed back to life across Miami, New Orleans, and Austin. Every third scene is food shot like it owes you money, with a father and son doing their real talking over cubanos. One for a weekend evening when you want zero villains and a full stomach. Order food first — watching it hungry is a mistake everyone makes once."

## Second-pass protocol (remaining longs)

The other ~100 longs get the same treatment in a dedicated session: T1 blurbs (rec-voice one-liners) and all T2/T3 essay-longs (auto-generated ~300-worders) are replaced wholesale under the long spec above — media titles get the 3-4 sentence jobs; wine keeps its one-sentence long per the spec's non-media branch. No entry ships with its current long once shorts are applied; mixing new shorts with essay-longs on an expanded card would be a register clash mid-card.

**Apply mechanics (Brad's call at apply time):** the files say `AUTO-GENERATED. Do not hand edit.` — either this doc becomes the new source for `scripts/generatePoolCopy.ts`, or the header convention is retired and the files are hand-maintained from here. Validation: Play through all four verticals on a fresh session and read the five cards aloud — the Katrina bar: does each sentence say something only that title earns?
