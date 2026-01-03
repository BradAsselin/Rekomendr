// F:\Rekomendr\Rekomendr-App\app\api\recs\route.ts

import { NextResponse } from "next/server";

interface Rek {
  id: number;
  title: string;
  year: number;
  short: string;
  long: string;
  trailerUrl: string;
  genre?: string;
  isFavorite?: boolean;
}

/**
 * MOVIE_REKS
 * - First 5: mega-familiar trust builders (cross-genre blockbusters)
 * - Then a mix of comfort watches, big hits, and “hidden gem” feel-goods
 * - AI + engine will pick from this pool based on vertical, clarifier, and text
 */
const MOVIE_REKS: Rek[] = [
  // -------------------------------------------------
  // 1–5: Anchor blockbusters (auto-load feels “safe”)
  // -------------------------------------------------
  {
    id: 1,
    title: "Forrest Gump",
    year: 1994,
    short:
      "A simple man unwittingly walks through the biggest moments of American history with a box of chocolates in hand.",
    long:
      "Tom Hanks plays Forrest, a kind-hearted man whose improbable life crosses historic events and great loves. Equal parts funny, nostalgic, and emotional comfort food.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=forrest+gump+trailer",
    genre: "Drama • Comedy • Romance",
  },
  {
    id: 2,
    title: "The Shawshank Redemption",
    year: 1994,
    short:
      "A quietly powerful prison drama about friendship, hope, and the long game.",
    long:
      "Wrongly convicted banker Andy Dufresne builds an unlikely bond with Red inside a brutal prison, slowly carving out dignity and a way forward. One of the most universally loved modern dramas.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=shawshank+redemption+trailer",
    genre: "Drama",
  },
  {
    id: 3,
    title: "Top Gun: Maverick",
    year: 2022,
    short:
      "Tom Cruise returns to the cockpit for a crowd-pleasing, big-screen jet ride.",
    long:
      "Maverick is pulled back to train a new generation of pilots for an impossible mission. Huge aerial set pieces, old-school movie star charisma, and surprisingly strong emotion.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=top+gun+maverick+trailer",
    genre: "Action • Drama",
  },
  {
    id: 4,
    title: "The Dark Knight",
    year: 2008,
    short:
      "Batman faces the Joker in a crime thriller disguised as a superhero movie.",
    long:
      "Christopher Nolan’s Gotham is a gritty, modern city torn between chaos and order. Heath Ledger’s Joker pushes Batman and the city to their moral limits.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+dark+knight+trailer",
    genre: "Action • Crime • Thriller",
  },
  {
    id: 5,
    title: "The Princess Bride",
    year: 1987,
    short:
      "A fairy-tale adventure that’s equal parts romance, comedy, and quotable nonsense.",
    long:
      "Farmboy-turned-pirate Westley fights his way back to Princess Buttercup through duels, giants, and classic one-liners. A perfect family-friendly comfort watch.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+princess+bride+trailer",
    genre: "Fantasy • Romance • Comedy",
  },

  // -------------------------------------------------
  // Original cozy / feel-good pool you liked
  // -------------------------------------------------
  {
    id: 6,
    title: "The Grand Seduction",
    year: 2013,
    short:
      "A tiny harbor town pulls off an elaborate charm offensive to land a much-needed doctor.",
    long:
      "A small Canadian fishing village needs a doctor to secure a vital factory contract, so the locals orchestrate a hilarious campaign to convince a visiting physician to stay. Warm, quirky, and optimistic.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+grand+seduction+trailer",
    genre: "Comedy",
  },
  {
    id: 7,
    title: "Eurovision Song Contest: The Story of Fire Saga",
    year: 2020,
    short:
      "Icelandic underdogs chase their ridiculous pop-music dreams on the world’s cheesiest stage.",
    long:
      "Will Ferrell and Rachel McAdams play small-town dreamers who stumble their way onto the Eurovision stage. Big songs, outrageous costumes, and more heart than it has any right to have.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=eurovision+song+contest+fire+saga+trailer",
    genre: "Comedy • Music",
  },
  {
    id: 8,
    title: "Hunt for the Wilderpeople",
    year: 2016,
    short:
      "A grumpy uncle, a rebellious kid, and the New Zealand bush. Deadpan, weird, and secretly heartfelt.",
    long:
      "Taika Waititi’s offbeat adventure follows runaway kid Ricky Baker and his reluctant foster uncle on the run in the wilderness. A perfect mix of absurd humor and emotional punch.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=hunt+for+the+wilderpeople+trailer",
    genre: "Adventure • Comedy",
  },
  {
    id: 9,
    title:
      "The 100-Year-Old Man Who Climbed Out the Window and Disappeared",
    year: 2013,
    short:
      "On his 100th birthday, a man climbs out the window and wanders into an absurd crime caper.",
    long:
      "A centenarian escapes his nursing home and accidentally gets tangled up with criminals and a suitcase of cash. A Forrest Gump-style life story wrapped in dry Scandinavian humor.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=100+year+old+man+who+climbed+out+the+window+trailer",
    genre: "Comedy • Adventure",
  },
  {
    id: 10,
    title: "The Intouchables",
    year: 2011,
    short:
      "An aristocrat and his live-in caretaker form an unlikely, life-changing friendship.",
    long:
      "Based on a true story, this French favorite pairs a wealthy quadriplegic with an unconventional caretaker from the projects. Funny, humane, and incredibly crowd-pleasing.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+intouchables+trailer",
    genre: "Comedy • Drama",
  },
  {
    id: 11,
    title: "Chef",
    year: 2014,
    short:
      "A burned-out chef starts a food-truck road trip with his son. Food porn and father-son bonding.",
    long:
      "Jon Favreau plays a chef who walks away from a fancy restaurant and rediscover his passion on a Cuban sandwich food truck. Warm, low-stress, and full of great music and food.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=chef+2014+trailer",
    genre: "Comedy • Food",
  },
  {
    id: 12,
    title: "About Time",
    year: 2013,
    short:
      "A time-travel romance that’s really about appreciating an ordinary day.",
    long:
      "A young man learns he can travel back along his own timeline and uses it to tinker with love, family, and regret. From the writer of Love Actually; sneaky emotional gut-punch.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=about+time+trailer",
    genre: "Romance • Fantasy • Drama",
  },
  {
    id: 13,
    title: "The Nice Guys",
    year: 2016,
    short:
      "Two incompetent detectives bumble through a 1970s LA conspiracy with great banter.",
    long:
      "Ryan Gosling and Russell Crowe play mismatched private eyes hired to investigate a missing girl. Shane Black’s signature wit, chaos, and retro style make this a cult favorite.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+nice+guys+trailer",
    genre: "Comedy • Crime",
  },
  {
    id: 14,
    title: "The Peanut Butter Falcon",
    year: 2019,
    short:
      "A runaway with Down syndrome and a small-time outlaw go on a raft adventure in the American South.",
    long:
      "Zack Gottsagen and Shia LaBeouf headline a gentle, hopeful road-movie about friendship, found family, and wrestling dreams. Big-hearted and quietly powerful.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+peanut+butter+falcon+trailer",
    genre: "Adventure • Drama",
  },
  {
    id: 15,
    title: "Safety Not Guaranteed",
    year: 2012,
    short:
      "A classified ad seeks a partner for time travel. Low-budget, high-charm sci-fi romance.",
    long:
      "A team of journalists investigates a man who claims to have built a time machine and is looking for a partner. Sweet, earnest, and quietly magical.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=safety+not+guaranteed+trailer",
    genre: "Comedy • Sci-Fi • Romance",
  },

  // -------------------------------------------------
  // Big crowd-pleasers across genres
  // -------------------------------------------------
  {
    id: 16,
    title: "Back to the Future",
    year: 1985,
    short:
      "A teenager accidentally travels back in time and almost erases his own existence.",
    long:
      "Marty McFly and Doc Brown race to repair the timeline after Marty meets his parents in high school. A perfect blend of sci-fi, comedy, and 80s charm.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=back+to+the+future+trailer",
    genre: "Sci-Fi • Comedy • Adventure",
  },
  {
    id: 17,
    title: "Jurassic Park",
    year: 1993,
    short: "Dinosaur theme park goes wrong. Very wrong.",
    long:
      "Scientists resurrect dinosaurs for a luxury island attraction, but nature and corporate greed don’t cooperate. Still one of the most thrilling family blockbusters ever made.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=jurassic+park+trailer",
    genre: "Sci-Fi • Adventure • Thriller",
  },
  {
    id: 18,
    title: "Inception",
    year: 2010,
    short:
      "A thief invades dreams to plant an idea inside someone’s mind.",
    long:
      "Christopher Nolan’s puzzle-box heist movie blends emotional stakes with folding cities and zero-gravity hallways. Smart, stylish, and endlessly rewatchable.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=inception+trailer",
    genre: "Sci-Fi • Thriller",
  },
  {
    id: 19,
    title: "The Martian",
    year: 2015,
    short:
      "An astronaut is left behind on Mars and decides not to die there.",
    long:
      "Matt Damon plays a botanist who uses science, duct tape, and sarcasm to survive alone on Mars while Earth figures out a rescue plan. Surprisingly funny and uplifting.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+martian+trailer",
    genre: "Sci-Fi • Drama",
  },
  {
    id: 20,
    title: "Guardians of the Galaxy",
    year: 2014,
    short: "A misfit band of space losers accidentally become heroes.",
    long:
      "Marvel’s most offbeat team—talking raccoon, sentient tree, 70s mixtape—save the galaxy while arguing the whole way. Colorful, funny, and easy to enjoy.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=guardians+of+the+galaxy+trailer",
    genre: "Action • Sci-Fi • Comedy",
  },
  {
    id: 21,
    title: "Knives Out",
    year: 2019,
    short:
      "A modern whodunnit with a sharp tongue and a very cozy sweater.",
    long:
      "Detective Benoit Blanc investigates the death of a crime novelist in a house full of suspects. Twisty, funny, and extremely rewatchable.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=knives+out+trailer",
    genre: "Mystery • Comedy",
  },
  {
    id: 22,
    title: "Crazy Rich Asians",
    year: 2018,
    short:
      "A New Yorker discovers her boyfriend’s family is wildly wealthy and even more dramatic.",
    long:
      "A sunny rom-com set in Singapore’s ultra-rich circles, where love, class, and family collide. Glamorous, funny, and emotionally satisfying.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=crazy+rich+asians+trailer",
    genre: "Romance • Comedy",
  },
  {
    id: 23,
    title: "Hidden Figures",
    year: 2016,
    short:
      "The untold story of Black women mathematicians who helped launch NASA into space.",
    long:
      "Three brilliant women fight for recognition and dignity while doing critical calculations for the space race. Inspiring, accessible, and family-friendly.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=hidden+figures+trailer",
    genre: "Drama • Historical",
  },
  {
    id: 24,
    title: "The Blind Side",
    year: 2009,
    short:
      "A wealthy family takes in a homeless teen who finds a future in football.",
    long:
      "Based on a true story, this feel-good sports drama follows Michael Oher’s path from an unstable upbringing to college football, with help from the Tuohy family.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+blind+side+trailer",
    genre: "Drama • Sports",
  },
  {
    id: 25,
    title: "Moneyball",
    year: 2011,
    short: "Baseball team, broken budget, spreadsheet revolution.",
    long:
      "Brad Pitt plays Oakland A’s GM Billy Beane, who uses data and undervalued players to reinvent how teams are built. Smart, talky, and surprisingly emotional.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=moneyball+trailer",
    genre: "Drama • Sports",
  },

  // -------------------------------------------------
  // Comfort comedies / light watches
  // -------------------------------------------------
  {
    id: 26,
    title: "Groundhog Day",
    year: 1993,
    short:
      "A grumpy weatherman relives the same day until he gets it right.",
    long:
      "Bill Murray’s stuck-in-a-loop comedy slowly turns into a story about growth, kindness, and meaning. A classic comfort rewatch.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=groundhog+day+trailer",
    genre: "Comedy • Fantasy • Romance",
  },
  {
    id: 27,
    title: "The Intern",
    year: 2015,
    short:
      "A retired widower becomes an intern at an online fashion startup.",
    long:
      "Robert De Niro and Anne Hathaway star in a gentle workplace comedy about mentorship, purpose, and intergenerational friendship.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+intern+trailer",
    genre: "Comedy • Drama",
  },
  {
    id: 28,
    title: "The Holiday",
    year: 2006,
    short:
      "Two women swap houses for Christmas and accidentally swap lives.",
    long:
      "A cozy rom-com starring Kate Winslet, Cameron Diaz, Jude Law, and Jack Black. Cottage-core, fireplaces, and new beginnings.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+holiday+trailer",
    genre: "Romance • Comedy",
  },
  {
    id: 29,
    title: "Paddington 2",
    year: 2017,
    short:
      "A polite bear in a blue coat gets framed for a crime he didn’t commit.",
    long:
      "Paddington’s prison misadventure turns into one of the most charming and wholesome movies ever made. Pure serotonin, for kids and adults.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=paddington+2+trailer",
    genre: "Family • Comedy",
  },
  {
    id: 30,
    title: "The Devil Wears Prada",
    year: 2006,
    short:
      "A young journalist becomes assistant to a terrifying fashion editor.",
    long:
      "Anne Hathaway and Meryl Streep face off in a fashion-world coming-of-age story that’s sharper and more emotional than it looks.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+devil+wears+prada+trailer",
    genre: "Comedy • Drama",
  },

  // -------------------------------------------------
  // A few “hidden gem” / indie vibes
  // -------------------------------------------------
  {
    id: 31,
    title: "Sing Street",
    year: 2016,
    short:
      "A Dublin teen starts a band to impress a girl in the 1980s.",
    long:
      "Original songs, awkward teenage romance, and escape-through-music vibes. One of the best music-movie hidden gems of the last decade.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=sing+street+trailer",
    genre: "Music • Drama • Comedy",
  },
  {
    id: 32,
    title: "Begin Again",
    year: 2013,
    short: "Two broken hearts record an album on the streets of New York.",
    long:
      "Keira Knightley and Mark Ruffalo collaborate on a DIY record after major life setbacks. Low-key, musical, and hopeful.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=begin+again+trailer",
    genre: "Music • Drama • Romance",
  },
  {
    id: 33,
    title: "The Way Way Back",
    year: 2013,
    short: "A shy teenager finds confidence at a summer water park.",
    long:
      "After a rough family vacation, a kid bonds with the oddball staff at a local water park. Great coming-of-age tones with Sam Rockwell in full chaos-uncle mode.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+way+way+back+trailer",
    genre: "Comedy • Drama",
  },
  {
    id: 34,
    title: "The Big Sick",
    year: 2017,
    short:
      "A stand-up comic navigates culture clash, new love, and a medical crisis.",
    long:
      "Based on Kumail Nanjiani’s real relationship, this rom-com balances serious health scares with sharp, heartfelt comedy about family and identity.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+big+sick+trailer",
    genre: "Romance • Comedy • Drama",
  },
  {
    id: 35,
    title: "Lars and the Real Girl",
    year: 2007,
    short:
      "A socially anxious man falls in love with a life-size doll, and the town decides to play along.",
    long:
      "Ryan Gosling plays a gentle oddball in a small-town fable about empathy, grief, and chosen family. Way sweeter than the premise sounds.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=lars+and+the+real+girl+trailer",
    genre: "Drama • Comedy",
  },

  // -------------------------------------------------
  // A few thrillers / crime for people who want edge
  // -------------------------------------------------
  {
    id: 36,
    title: "Sicario",
    year: 2015,
    short:
      "An FBI agent is pulled into the murky world of the drug war on the border.",
    long:
      "Emily Blunt, Benicio Del Toro, and Josh Brolin star in a tense, morally grey thriller about power, violence, and blurred lines.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=sicario+trailer",
    genre: "Crime • Thriller",
  },
  {
    id: 37,
    title: "Prisoners",
    year: 2013,
    short:
      "Two young girls go missing, and their parents take matters into their own hands.",
    long:
      "Hugh Jackman and Jake Gyllenhaal drive a dark, slow-burn investigation that asks how far you’d go for your child. Intense and haunting.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=prisoners+trailer",
    genre: "Crime • Thriller • Drama",
  },
  {
    id: 38,
    title: "Gone Girl",
    year: 2014,
    short:
      "A missing wife, an unreliable husband, and a media circus.",
    long:
      "David Fincher’s slick adaptation of Gillian Flynn’s novel twists through lies, secrets, and modern marriage nightmares.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=gone+girl+trailer",
    genre: "Thriller • Mystery",
  },

  // -------------------------------------------------
  // Big family / adventure classics
  // -------------------------------------------------
  {
    id: 39,
    title: "The Goonies",
    year: 1985,
    short:
      "A group of kids hunt for pirate treasure to save their homes.",
    long:
      "Secret tunnels, booby traps, pirates, and 80s kid chaos. A nostalgic adventure classic that still works with families.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+goonies+trailer",
    genre: "Adventure • Family",
  },
  {
    id: 40,
    title: "The Sandlot",
    year: 1993,
    short:
      "A new kid in town finds friends, baseball, and a legendary backyard beast.",
    long:
      "A nostalgic ode to childhood summers, neighborhood games, and that one ball that goes over the fence.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+sandlot+trailer",
    genre: "Family • Sports • Comedy",
  },
  {
    id: 41,
    title: "Harry Potter and the Sorcerer’s Stone",
    year: 2001,
    short:
      "An orphan discovers he’s a wizard and heads off to a very unusual school.",
    long:
      "The first entry in the Harry Potter series introduces Hogwarts, magic, and a world that hooked an entire generation.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=harry+potter+and+the+sorcerers+stone+trailer",
    genre: "Fantasy • Family",
  },
  {
    id: 42,
    title: "Pirates of the Caribbean: The Curse of the Black Pearl",
    year: 2003,
    short:
      "A blacksmith and a strange pirate team up to save a kidnapped girl from cursed buccaneers.",
    long:
      "Johnny Depp’s Captain Jack Sparrow anchors a swashbuckling, supernatural adventure that’s funnier and more stylish than it had any right to be.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=pirates+of+the+caribbean+trailer",
    genre: "Adventure • Fantasy • Action",
  },

  // -------------------------------------------------
  // Modern “good night on the couch” picks
  // -------------------------------------------------
  {
    id: 43,
    title: "Free Guy",
    year: 2021,
    short:
      "A background character in a video game realizes his whole world is code.",
    long:
      "Ryan Reynolds plays a cheerful NPC who becomes self-aware and turns into an unlikely hero. Colorful, easygoing, and crowd-pleasing.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=free+guy+trailer",
    genre: "Action • Comedy • Sci-Fi",
  },
  {
    id: 44,
    title: "A Man Called Ove",
    year: 2015,
    short:
      "A grumpy widower’s rigid routines are disrupted by noisy new neighbors.",
    long:
      "Swedish dramedy about grief, loneliness, and the slow return of connection. Dry humor wrapped around a big emotional core.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=a+man+called+ove+trailer",
    genre: "Drama • Comedy",
  },
  {
    id: 45,
    title: "Coda",
    year: 2021,
    short: "A hearing teen in a Deaf family discovers a gift for singing.",
    long:
      "Torn between supporting her family’s fishing business and following her musical dreams, Ruby navigates love, loyalty, and identity. Gentle and uplifting.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=coda+movie+trailer",
    genre: "Drama • Music",
  },
  {
    id: 46,
    title: "La La Land",
    year: 2016,
    short:
      "A jazz musician and an aspiring actress fall in love in a modern Hollywood musical.",
    long:
      "Stylish, colorful, and bittersweet, this movie leans into classic musical romance while asking what you’re willing to sacrifice for your dreams.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=la+la+land+trailer",
    genre: "Music • Romance • Drama",
  },
  {
    id: 47,
    title: "The Wolverine",
    year: 2013,
    short:
      "Logan travels to Japan and ends up in a samurai-flavored fight for his life.",
    long:
      "A more grounded superhero story that explores vulnerability, honor, and immortality, with some stylish action set pieces.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+wolverine+trailer",
    genre: "Action • Superhero",
  },
  {
    id: 48,
    title: "The Greatest Showman",
    year: 2017,
    short:
      "A musical take on P.T. Barnum’s circus-building ambitions.",
    long:
      "High-energy songs, colorful spectacle, and an underdog-dreamer tone make this an easy family musical night choice.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=the+greatest+showman+trailer",
    genre: "Music • Drama • Family",
  },
  {
    id: 49,
    title: "Mission: Impossible – Fallout",
    year: 2018,
    short:
      "Tom Cruise sprints, fights, and hangs off things in one of the best modern action movies.",
    long:
      "Insane practical stunts, propulsive pacing, and a twisty spy plot make this a top-tier action comfort watch for adrenaline junkies.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=mission+impossible+fallout+trailer",
    genre: "Action • Thriller",
  },
  {
    id: 50,
    title: "Oceans Eleven",
    year: 2001,
    short:
      "George Clooney assembles a charming crew to rob three Vegas casinos at once.",
    long:
      "Slick, funny, and effortlessly cool, this heist movie is all about chemistry, planning, and a very satisfying payoff.",
    trailerUrl:
      "https://www.youtube.com/results?search_query=oceans+eleven+trailer",
    genre: "Crime • Comedy",
  },
];

export async function GET() {
  return NextResponse.json(MOVIE_REKS);
}
