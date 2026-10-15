/**
 * The one line on the Hypefy ID with a personality.
 *
 * Every other field is a fact — a number, a date, a song. This one is a
 * read on the person, written from what they chose when they set the
 * profile up. It sits in the REMARKS row, the word a passport uses for its
 * observations box, and the joke is that an otherwise formal document
 * quietly says "This user holds the aux."
 *
 * Four rules shape it.
 *
 *  - **Written, not generated.** Lines are picked from a list someone
 *    wrote. A sentence assembled word by word reads assembled. The one
 *    exception is pairing two clauses with "and", and both halves of every
 *    pair are written to sit in that position.
 *  - **Everything counts, not just the first thing.** Signals are scored
 *    and ranked. An earlier version took whichever trait matched first, so
 *    a founder who also makes music was only ever a musician, and a long
 *    carefully filled profile read exactly like a bare one.
 *  - **Stable while you look at it.** The pick comes from the account id,
 *    so a card says the same thing however many times it is opened, and
 *    the saved image matches the screen it was saved from.
 *  - **Not a tattoo.** It also takes the week, so it moves on. A line you
 *    have read fifty times has stopped saying anything; one that changes
 *    on a Monday is worth going back to look at.
 *
 * Every line opens "This user". Pronouns are a profile field now, so
 * using them here was the warmer option — but it would mean writing each
 * line twice for the verb to agree, and guessing for anyone who leaves the
 * field unset. One form that is right for everyone beats two that are
 * right for most.
 */

export type RemarkSource = {
  userId: string;
  tags: string[];
  interests: string[];
  hasAnthem: boolean;
  memberNo: number | null;
  /**
   * Which week's wording to use. Defaults to the real one; tests pass it
   * so they do not depend on the day they run. The screen and the saved
   * image both take the default and are drawn moments apart, so the only
   * way they could disagree is a save made across a Monday midnight.
   */
  epoch?: number;
};

/** Every line already carries its subject, so the row needs nothing added. */
const SUBJECT = "This user";

/** Whole weeks since 1970. The line moves on a Monday and holds all week. */
export function currentEpoch(now: number = Date.now()): number {
  return Math.floor((now + 3 * 864e5) / (7 * 864e5));
}

type Trait = {
  /** Complete sentences, following "This user ". */
  solo: string[];
  /** Verb phrases, for "This user X and Y." Written to sit either side. */
  clause: string;
  /** Tags and interests that count towards it. Both can, and then it counts twice. */
  from: string[];
};

/**
 * The traits, and the words for each.
 *
 * Keyed off the fixed vocabularies in profile.ts — PROFILE_TAGS and
 * INTERESTS — so a value that exists in the app has somewhere to land.
 */
const TRAITS: Record<string, Trait> = {
  music: {
    from: ["Musician", "Music"],
    clause: "keeps the sound on",
    solo: [
      "plays it out loud.",
      "holds the aux.",
      "has a song picked out.",
      "will send you the track.",
      "hears it before you do.",
    ],
  },
  build: {
    from: ["Founder", "Startups"],
    clause: "is building something",
    solo: [
      "has something in the works.",
      "is early and loud about it.",
      "ships on weekends.",
      "has a pitch ready.",
      "started it themselves.",
    ],
  },
  code: {
    from: ["Developer", "Coding", "Tech"],
    clause: "ships code",
    solo: [
      "ships code.",
      "says it works on their machine.",
      "is three tabs from a fix.",
      "writes more than they delete.",
      "has opinions about semicolons.",
    ],
  },
  design: {
    from: ["Designer", "Design"],
    clause: "moves pixels",
    solo: [
      "moves pixels.",
      "notices the spacing.",
      "has opinions about fonts.",
      "nudges things two pixels left.",
      "saw that misalignment too.",
    ],
  },
  art: {
    from: ["Artist", "Art", "Animator"],
    clause: "makes things",
    solo: [
      "makes things.",
      "is always mid-project.",
      "draws it out first.",
      "has forty unfinished files.",
      "fills the margins.",
    ],
  },
  edit: {
    from: ["Editor", "Editing"],
    clause: "cuts it tight",
    solo: ["cuts it tight.", "wants one more pass.", "has notes.", "trims the first four seconds."],
  },
  photo: {
    from: ["Photographer"],
    clause: "waits for the light",
    solo: ["waits for the light.", "shoots it twice.", "is here for a good frame.", "takes the long way for the view."],
  },
  memes: {
    from: ["Meme Creator", "Memes"],
    clause: "posts the funny ones",
    solo: [
      "posts the funny ones.",
      "is a certified poster.",
      "sends it to the group chat first.",
      "has the screenshot somewhere.",
    ],
  },
  games: {
    from: ["Gamer", "Gaming"],
    clause: "says one more round",
    solo: ["says one more round.", "is online at 3am.", "is ranked, apparently.", "blames the lag.", "never queues alone."],
  },
  write: {
    from: ["Writer"],
    clause: "writes it down",
    solo: ["writes it down.", "drafts everything twice.", "has a notes app full of it.", "reads the comments properly."],
  },
  screen: {
    from: ["Anime", "Movies"],
    clause: "watches everything",
    solo: ["watches everything.", "is mid-arc.", "has a letterboxd and uses it.", "will recommend it unprompted."],
  },
  fit: {
    from: ["Fitness"],
    clause: "never skips",
    solo: ["never skips.", "is up before you.", "counts the reps.", "has a routine and keeps it."],
  },
  study: {
    from: ["Student", "Study"],
    clause: "is still studying",
    solo: ["is still studying.", "has exams pending.", "is revising, allegedly.", "knows where the library is."],
  },
  create: {
    from: ["Creator", "Creators"],
    clause: "posts and builds",
    solo: ["posts and builds.", "is online a lot.", "makes things on purpose.", "is building an audience, quietly."],
  },
};

/** Said when nothing else is, and when nothing at all has been filled in. */
const EARLY = ["was here before most.", "found it first.", "got in early.", "has the low number."];
const BLANK = ["is new here.", "is figuring it out.", "just arrived.", "has not filled this in yet."];

/**
 * Stable, well-spread choice from a string.
 *
 * FNV-1a rather than summing character codes: ids are uuids, which share
 * most of their alphabet and all of their length, and a sum clusters them
 * hard enough that neighbouring accounts keep drawing the same line.
 */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(list: T[], seed: string, epoch: number): T {
  const mixed = (hash(seed) ^ Math.imul(epoch + 1, 0x9e3779b1)) >>> 0;
  return list[mixed % list.length];
}

/**
 * What this profile says about its owner, strongest first.
 *
 * A tag and an interest pointing at the same thing count twice, because
 * someone who ticked both Musician and Music has told us twice. An anthem
 * counts for more than either: it is the only one of the three you have to
 * go and find.
 */
export function traitsOf(source: RemarkSource): { key: string; score: number }[] {
  const scores = new Map<string, number>();
  const add = (key: string, n: number) => scores.set(key, (scores.get(key) ?? 0) + n);

  for (const [key, trait] of Object.entries(TRAITS)) {
    for (const value of trait.from) {
      if (source.tags.includes(value)) add(key, 2);
      if (source.interests.includes(value)) add(key, 2);
    }
  }
  if (source.hasAnthem) add("music", 3);

  return [...scores.entries()]
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) =>
      // Ties broken by the account, not by the order the traits happen to
      // be written in — otherwise everyone with the same two interests
      // gets the same one of them, forever.
      b.score - a.score || hash(`${source.userId}:${a.key}`) - hash(`${source.userId}:${b.key}`),
    );
}

export function remarkFor(source: RemarkSource): string {
  const epoch = source.epoch ?? currentEpoch();
  const seed = `${source.userId}:${epoch}`;
  const ranked = traitsOf(source);

  if (ranked.length === 0) {
    const lines = source.memberNo !== null && source.memberNo <= 50 ? EARLY : BLANK;
    return `${SUBJECT} ${pick(lines, source.userId, epoch)}`;
  }

  // Two clauses, now and then. Always pairing would be its own formula —
  // every card the same shape — and a profile with one thing on it has
  // nothing to pair with anyway.
  const [first, second] = ranked;
  if (second && second.score >= 2 && hash(`${seed}:pair`) % 3 === 0) {
    return `${SUBJECT} ${TRAITS[first.key].clause} and ${TRAITS[second.key].clause}.`;
  }
  return `${SUBJECT} ${pick(TRAITS[first.key].solo, `${source.userId}:${first.key}`, epoch)}`;
}
