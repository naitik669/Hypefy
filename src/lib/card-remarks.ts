/**
 * The one line on the Hypefy ID with a personality.
 *
 * Every other row is a fact — a number, a date, a song. This one is a read
 * on the person, and it is written as a customs officer would write it:
 * what you *declared*, against what was *observed*. The joke is that an
 * otherwise formal document quietly reports that you claimed to be editing
 * and have been for six weeks.
 *
 * That split is not decoration. The REMARKS value column is 208px — about
 * thirty-two characters — on a 360px phone, and both the card and the saved
 * image clip a long value with an ellipsis. A two-part observation cannot
 * fit on one row, so it gets two labelled rows, each short. The format is
 * doing the work a longer sentence could not.
 *
 * Five rules shape it.
 *
 *  - **It reports a gap, not a trait.** The comedy is the distance between
 *    two facts. The version this replaces picked one trait and printed a
 *    canned sentence, so two people who both ticked Gamer read identically
 *    forever, and the line said nothing the ROLES row above it had not.
 *  - **Written, not generated.** Every phrase is one someone wrote. What
 *    the code chooses is which pair of them to put together.
 *  - **It earns the right to say things.** An account three days old has
 *    no material, so it gets a warm line and nothing sharper. What may be
 *    said widens as the account gives it something to say.
 *  - **Stable while you look at it.** The pick comes from the account id,
 *    so the card says the same thing however many times it is opened and
 *    the saved image matches the screen it came from.
 *  - **Not a tattoo.** It takes a four-week epoch too, staggered per
 *    account so cards do not all turn over on the same day.
 *
 * Every single-row line opens "This user". Pronouns are a profile field,
 * but one form that is right for everyone beats two that are right for
 * most — and the flat anonymity of "this user" on a document about a
 * specific person is part of the joke.
 */

export type RemarkSource = {
  userId: string;
  tags: string[];
  interests: string[];
  hasAnthem: boolean;
  memberNo: number | null;
  /** ISO. Account age drives which era the line is written from. */
  joinedAt?: string | null;
  /** Counts become bands immediately and never leave this file as numbers. */
  posts?: number;
  hypers?: number;
  /** ISO. Only ever read as a coarse bucket, and only with showActivity. */
  lastSeenAt?: string | null;
  /** The profile's own toggle. False means last-seen is not ours to use. */
  showActivity?: boolean;
  /** Worn cosmetics, which are self-chosen and so fair game. */
  frame?: string | null;
  isPremium?: boolean;
  verified?: boolean;
  /**
   * Which cycle's wording to use. Defaults to the real one; tests pass it
   * so they do not depend on the day they run.
   */
  epoch?: number;
  /** Overridable clock, for the same reason. */
  now?: number;
};

/** One row of the ID: a label and the value beside it. */
export type RemarkRow = { label: string; value: string };

/** Every single-row line already carries its subject. */
const SUBJECT = "This user";

/**
 * The widest a value may be, in characters.
 *
 * The column is 208px and the mono face runs 6.32px to the character, both
 * measured on the live card. A value past this is truncated with an
 * ellipsis rather than wrapped, so the cap is real rather than advisory.
 */
export const VALUE_CHARS = 32;
/** What is left for a single-row line once "This user " has taken its share. */
export const PREDICATE_CHARS = VALUE_CHARS - SUBJECT.length - 1;

const DAY = 864e5;
/** The launch market. See the note in remarkRows about travellers. */
const IST = 5.5 * 36e5;

/* ── The vocabulary ──────────────────────────────────────────────────── */

type Trait = {
  /** Tags and interests that count towards it. Both can, and then twice. */
  from: string[];
  /** One word for it, for the shortest lines. */
  noun: string;
  /** The plain claim, as DECLARED would record it. */
  claim: string;
  /** A more characterful claim, for when there is room to be funny. */
  alt: string;
  /** What OBSERVED says when the claim checks out. */
  confirm: string;
  /** Complete predicates, following "This user ". Kept under the cap. */
  solo: string[];
  /** Traits that are a process rather than a state, for the "still at it" gag. */
  ongoing?: boolean;
};

const TRAITS: Record<string, Trait> = {
  music: {
    from: ["Musician", "Music"],
    noun: "music",
    claim: "music",
    alt: "holds the aux",
    confirm: "no objections filed",
    solo: ["holds the aux.", "plays it out loud.", "has a song picked.", "hears it first."],
  },
  build: {
    from: ["Founder", "Startups"],
    noun: "building",
    claim: "founder",
    alt: "building something",
    confirm: "still building it",
    solo: ["ships on weekends.", "is early and loud.", "has a pitch ready.", "started it alone."],
    ongoing: true,
  },
  code: {
    from: ["Developer", "Coding", "Tech"],
    noun: "code",
    claim: "shipping code",
    alt: "opinions on semicolons",
    confirm: "confirmed",
    solo: ["ships code.", "says it works locally.", "is one tab from a fix.", "deletes less than most."],
  },
  design: {
    from: ["Designer", "Design"],
    noun: "design",
    claim: "design",
    alt: "opinions about fonts",
    confirm: "the spacing, always",
    solo: ["moves pixels.", "noticed it too.", "nudged it two left.", "saw that gap."],
  },
  art: {
    from: ["Artist", "Art", "Animator"],
    noun: "art",
    claim: "making things",
    alt: "mid-project",
    confirm: "still mid-project",
    solo: ["is always mid-project.", "fills the margins.", "draws it out first."],
    ongoing: true,
  },
  edit: {
    from: ["Editor", "Editing"],
    noun: "editing",
    claim: "editing",
    alt: "one more pass",
    confirm: "a clean cut",
    solo: ["has notes.", "wants one more pass.", "cuts it tight."],
    ongoing: true,
  },
  photo: {
    from: ["Photographer"],
    noun: "photos",
    claim: "photography",
    alt: "waiting for light",
    confirm: "up before you",
    solo: ["waits for the light.", "shot it twice.", "took the long way."],
  },
  memes: {
    from: ["Meme Creator", "Memes"],
    noun: "memes",
    claim: "memes",
    alt: "the funny ones",
    confirm: "certified poster",
    solo: ["posts the funny ones.", "is a certified poster.", "had the screenshot."],
  },
  games: {
    from: ["Gamer", "Gaming"],
    noun: "gaming",
    claim: "gaming",
    alt: "one more round",
    confirm: "round four",
    solo: ["says one more round.", "blames the lag.", "never queues alone.", "is ranked, somehow."],
  },
  write: {
    from: ["Writer"],
    noun: "writing",
    claim: "writing",
    alt: "writer",
    confirm: "drafts, mostly",
    solo: ["writes it down.", "drafts it twice.", "reads the comments."],
    ongoing: true,
  },
  screen: {
    from: ["Anime", "Movies"],
    noun: "watching",
    claim: "watching things",
    alt: "mid-arc",
    confirm: "still mid-arc",
    solo: ["is mid-arc.", "watches everything.", "will recommend it."],
  },
  fit: {
    from: ["Fitness"],
    noun: "fitness",
    claim: "fitness",
    alt: "never skips",
    confirm: "up before you",
    solo: ["never skips.", "is up before you.", "counts the reps."],
  },
  study: {
    from: ["Student", "Study"],
    noun: "study",
    claim: "student",
    alt: "revising",
    confirm: "still awake",
    solo: ["is revising.", "claims to revise.", "knows the library."],
    ongoing: true,
  },
  create: {
    from: ["Creator", "Creators"],
    noun: "creating",
    claim: "creator",
    alt: "posting and building",
    confirm: "a crowd, apparently",
    solo: ["posts and builds.", "is online a lot.", "makes things on purpose."],
  },
};

/** Said when the profile is bare. Never sharp — there is nothing to be sharp about. */
const BLANK = ["is new. Be nice.", "is figuring it out.", "just arrived.", "keeps it brief."];
/**
 * Said when a bare profile has been bare for a long time, which is funnier
 * than saying it on someone's first day. Nothing here assumes a gender:
 * pronouns are a field, and guessing one on a document is worse than the
 * flatness of "this user".
 */
const BARE_VETERAN = ["declared nothing.", "keeps it very brief.", "left this box empty.", "has filed nothing."];
/** Said when the account is old and the number is low. */
const EARLY = ["was here before most.", "found it first.", "got in early."];

/* ── Reading the profile ─────────────────────────────────────────────── */

type Band = "none" | "few" | "many" | "lots";

/** Counts become bands here and never leave as numbers. */
function bandOf(n: number | undefined): Band {
  if (!n || n <= 0) return "none";
  if (n < 10) return "few";
  if (n < 100) return "many";
  return "lots";
}

const thin = (b: Band) => b === "none" || b === "few";
const broad = (b: Band) => b === "many" || b === "lots";

function daysSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null;
}

/**
 * The only part of the clock worth reporting.
 *
 * Normal waking hours produce nothing, because "online at 4pm" is not an
 * observation. Gated twice: the profile's own show_activity toggle, and a
 * staleness check, so an account last seen in June does not get described
 * as awake right now.
 */
type Clock = "small-hours" | "early" | null;

function clockOf(source: RemarkSource, now: number): Clock {
  if (source.showActivity === false) return null;
  if (!source.lastSeenAt) return null;
  const t = Date.parse(source.lastSeenAt);
  if (!Number.isFinite(t) || now - t > 7 * DAY) return null;
  const hour = Math.floor(((t + IST) % DAY) / 36e5);
  if (hour < 5) return "small-hours";
  if (hour < 9) return "early";
  return null;
}

/**
 * What this profile says about its owner, strongest first.
 *
 * A tag and an interest pointing at the same thing count twice, because
 * someone who ticked both Musician and Music has told us twice. An anthem
 * counts for more than either: it is the only one you have to go and find.
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
    .sort(
      (a, b) =>
        // Ties broken by the account, not by the order the traits are
        // written in — otherwise everyone with the same two interests
        // gets the same one of them, forever.
        b.score - a.score || hash(`${source.userId}:${a.key}`) - hash(`${source.userId}:${b.key}`),
    );
}

/* ── Eras ────────────────────────────────────────────────────────────── */

/**
 * How much the card has earned the right to say.
 *
 * Arrival is a floor rather than a stage: a profile with nothing on it
 * stays there however old the account, because there is still nothing to
 * report. It is also the safety net — a roast needs material, and the one
 * card where a burn would genuinely land badly is somebody's first week.
 */
export type Era = "arrival" | "settling" | "regular" | "veteran";

export function eraOf(source: RemarkSource, now: number): Era {
  const days = daysSince(source.joinedAt, now);
  const declared = source.tags.length + source.interests.length;
  // An empty profile is Arrival only while it is plausibly still being
  // filled in. A year of saying nothing is a different observation, and
  // "just arrived" on a year-old account is the card getting it wrong.
  if (declared === 0) return days !== null && days >= 60 ? "veteran" : "arrival";
  if (days !== null && days < 14) return "arrival";

  const posts = bandOf(source.posts);
  const hypers = bandOf(source.hypers);
  const old = days !== null && days >= 180;
  const founding = source.memberNo !== null && source.memberNo <= 50;
  if (old || founding || posts === "lots" || hypers === "lots") return "veteran";
  if (days !== null && days >= 30 && (posts !== "none" || hypers !== "none")) return "regular";
  return "settling";
}

/** How hard the line is allowed to land. Rotates per account, per cycle. */
type Temper = "warm" | "dry" | "sharp";

function temperOf(source: RemarkSource, epoch: number, era: Era): Temper {
  if (era === "arrival") return "warm";
  const all: Temper[] = era === "settling" ? ["warm", "dry"] : ["warm", "dry", "sharp"];
  return pick(all, `${source.userId}:temper`, epoch);
}

/* ── Choosing ────────────────────────────────────────────────────────── */

/**
 * Stable, well-spread choice from a string.
 *
 * FNV-1a rather than summing character codes: ids are uuids, which share
 * most of their alphabet and all of their length, and a sum clusters them
 * hard enough that neighbouring accounts keep drawing the same line.
 */
export function hash(s: string): number {
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

/** Four-week blocks since 1970. */
export function currentEpoch(now: number = Date.now()): number {
  return Math.floor(now / (28 * DAY));
}

/**
 * Which cycle this account is in.
 *
 * Staggered by the account, so cards do not all turn over on the same
 * morning. Everybody changing at once reads as a deploy; one card changing
 * on its own reads as the card having thought about it.
 */
export function epochFor(userId: string, now: number = Date.now()): number {
  return currentEpoch(now + (hash(`${userId}:stagger`) % (28 * DAY)));
}

/* ── Phrasing helpers ────────────────────────────────────────────────── */

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const word = (n: number) => NUMBER_WORDS[n] ?? "several";

/** "six weeks of it", and then months, and then a year. Spelled, never digits. */
function howLong(days: number): string {
  if (days < 77) return `${word(Math.max(2, Math.round(days / 7)))} weeks of it`;
  if (days < 350) return `${word(Math.round(days / 30))} months of it`;
  return days < 700 ? "a year of it" : "years of it";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Zero-padded, matching the MEMBER row above. The one number allowed out. */
const memberTag = (n: number) => String(n).padStart(4, "0");

/* ── The rules ───────────────────────────────────────────────────────── */

type Pair = { declared: string; observed: string; temper: Temper };

/**
 * Every gap worth reporting about this account.
 *
 * Each rule looks for a distance between something declared and something
 * observed. A rule that finds nothing returns nothing; the caller takes
 * the best one the era and the temperament allow.
 */
function tensions(source: RemarkSource, now: number): Pair[] {
  const out: Pair[] = [];
  const ranked = traitsOf(source);
  const top = ranked[0] ? TRAITS[ranked[0].key] : null;
  const posts = bandOf(source.posts);
  const hypers = bandOf(source.hypers);
  const days = daysSince(source.joinedAt, now);
  const clock = clockOf(source, now);

  // Claimed a lot, filed little.
  if (ranked.length >= 3 && thin(posts)) {
    out.push({
      declared: `${word(Math.min(ranked.length, 10))} interests`,
      observed: "posts about one",
      temper: "sharp",
    });
  }

  // Still at it, where "it" is a process rather than a state.
  if (top?.ongoing && days !== null && days >= 45 && thin(posts)) {
    out.push({ declared: top.claim, observed: howLong(days), temper: "sharp" });
  }

  // Declared one thing, observed at an unreasonable hour.
  if (top && clock === "small-hours") {
    for (const observed of ["awake at 3am", "nocturnal", "keeps odd hours"]) {
      out.push({ declared: top.claim, observed, temper: "sharp" });
    }
    out.push({ declared: top.alt, observed: "still awake", temper: "dry" });
  }
  if (top && clock === "early") {
    out.push({ declared: top.alt, observed: "up before you", temper: "warm" });
  }

  // Dressed, nowhere to be.
  if (source.frame && thin(posts)) {
    out.push({ declared: top?.claim ?? "creator", observed: "excellent frame", temper: "sharp" });
  }

  // Hypes more than posts. Warm and sharp readings of the same fact.
  if (broad(hypers) && thin(posts)) {
    const claim = top?.claim ?? "creator";
    for (const observed of ["hypes, rarely posts", "attends, does not file"]) {
      out.push({ declared: claim, observed, temper: "sharp" });
    }
    for (const observed of ["shows up for everyone", "present, as ever"]) {
      out.push({ declared: claim, observed, temper: "warm" });
    }
  }

  // Early, and never sat down.
  if (source.memberNo !== null && source.memberNo <= 50 && broad(posts)) {
    out.push({ declared: "early access", observed: "never sat down", temper: "warm" });
  }

  // The claim checks out. The widest rule, so it carries the most
  // phrasings — this is what most filled-in, active accounts land on, and
  // one wording would have them all reading alike.
  if (top && broad(posts)) {
    out.push({ declared: top.alt, observed: top.confirm, temper: "warm" });
    out.push({ declared: top.claim, observed: top.confirm, temper: "warm" });
    for (const observed of ["no notes", "nothing to add", "as described"]) {
      out.push({ declared: top.alt, observed, temper: "warm" });
    }
    for (const observed of ["corroborated", "checks out", "consistent", "extensively"]) {
      out.push({ declared: top.claim, observed, temper: "dry" });
    }
  }

  // A crowd turned up.
  if (hypers === "lots") {
    out.push({ declared: top?.claim ?? "creator", observed: "a crowd, apparently", temper: "dry" });
  }

  // Nothing filed yet, but it is early days.
  if (top && posts === "none" && days !== null && days < 60) {
    for (const observed of ["awaiting evidence", "no filings yet", "pending"]) {
      out.push({ declared: top.claim, observed, temper: "dry" });
    }
  }

  return out;
}

/** The single-row lines this account could get, as predicates. */
function notes(source: RemarkSource, era: Era, now: number): string[] {
  const ranked = traitsOf(source);
  const top = ranked[0] ? TRAITS[ranked[0].key] : null;
  const days = daysSince(source.joinedAt, now);

  if (era === "arrival") {
    const lines = [...BLANK];
    // The one place slang belongs: shortest lines, lowest stakes, and a
    // one-line edit if it ages badly.
    if (top) {
      lines.push(`fw ${top.noun}. Noted.`, `declared ${top.noun}.`);
      if (ranked.length >= 2) lines.push(`declared ${word(ranked.length)} things.`);
    }
    if (days !== null && days < 14) {
      lines.push(`arrived on ${WEEKDAYS[new Date(now - days * DAY).getDay()]}.`);
    }
    return lines;
  }

  const lines: string[] = [];
  if (top) lines.push(...top.solo);
  if (ranked.length === 0) lines.push(...BARE_VETERAN);
  if (source.memberNo !== null && source.memberNo <= 50) {
    lines.push(`entered at ${memberTag(source.memberNo)}.`, ...EARLY);
  }
  return lines.length > 0 ? lines : [...BLANK];
}

/* ── The output ──────────────────────────────────────────────────────── */

/**
 * The rows the REMARKS area becomes: one, or a declared/observed pair.
 *
 * A pair only appears once the account has given it a gap worth reporting.
 * Everything else is a single row, which is also the fallback whenever a
 * candidate would not fit the column.
 */
export function remarkRows(source: RemarkSource): RemarkRow[] {
  const now = source.now ?? Date.now();
  const epoch = source.epoch ?? epochFor(source.userId, now);
  const era = eraOf(source, now);
  const temper = temperOf(source, epoch, era);

  const fitting =
    era === "regular" || era === "veteran"
      ? tensions(source, now).filter(
          (p) => p.declared.length <= VALUE_CHARS && p.observed.length <= VALUE_CHARS,
        )
      : [];

  // A pair most cycles, a plain note the rest. Always pairing would be
  // its own formula — every card the same shape forever — and the thinner
  // the material the more often it falls back, because an account whose
  // only gap is one rule would otherwise read the same row every cycle
  // for as long as that stayed true.
  const odds = fitting.length >= 3 ? 3 : 2;
  const wantsPair = fitting.length > 0 && hash(`${source.userId}:shape`) % odds !== epoch % odds;

  if (wantsPair) {
    // The temperament this cycle, if it has anything to say; otherwise
    // whatever else was found, because a pair beats a plain note.
    const mine = fitting.filter((p) => p.temper === temper);
    const usable = mine.length > 0 ? mine : fitting;
    const chosen = pick(usable, `${source.userId}:pair`, epoch);
    return [
      { label: "Declared", value: chosen.declared },
      { label: "Observed", value: chosen.observed },
    ];
  }

  const lines = notes(source, era, now).filter((s) => s.length <= PREDICATE_CHARS);
  const line = lines.length > 0 ? pick(lines, `${source.userId}:note`, epoch) : BLANK[0];
  return [{ label: "Remarks", value: `${SUBJECT} ${line}` }];
}
