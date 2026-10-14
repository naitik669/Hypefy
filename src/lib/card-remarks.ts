/**
 * The one line on the Hypefy ID with a personality.
 *
 * Every other field is a fact — a number, a date, a song. This one is a
 * read on the person, written from what they picked when they set the
 * profile up: a tag, an interest, an anthem. It sits in the REMARKS row,
 * which is the word a passport uses for its observations box, and the joke
 * is that an otherwise formal document quietly says "This user plays it
 * out loud."
 *
 * Two rules make it work:
 *
 *  - It is picked, never composed. A sentence assembled from parts reads
 *    assembled. These are written lines, chosen between.
 *  - The choice is deterministic, from the account id. A card that says
 *    something different each time it is opened is a slot machine, not a
 *    credential, and the same line has to come out of the image export as
 *    came out of the screen.
 *
 * Every line opens "This user" rather than a pronoun. Pronouns are now a
 * profile field, so using them here was the warmer option — but it would
 * mean writing each line twice for the verb to agree (plays / play) and
 * picking the wrong one for anybody who leaves the field unset. One form
 * that is right for everyone beats two that are right for most.
 */

export type RemarkSource = {
  userId: string;
  tags: string[];
  interests: string[];
  hasAnthem: boolean;
  memberNo: number | null;
};

/** Every line already carries its subject, so the row needs nothing added. */
const SUBJECT = "This user";

/**
 * The lines, by the signal that earns them.
 *
 * Ordered: the first group whose signal is present wins, so the strongest
 * thing about a profile is what gets said. Someone with an anthem is read
 * as someone with an anthem, not as "still studying".
 */
const LINES: { when: (s: RemarkSource) => boolean; lines: string[] }[] = [
  {
    // An anthem is the most deliberate thing on a Hypefy profile — you had
    // to go and find the song.
    when: (s) => s.hasAnthem,
    lines: [
      "plays it out loud.",
      "has a song picked out.",
      "holds the aux.",
      "keeps the sound on.",
      "will send you the track.",
    ],
  },
  {
    when: (s) => has(s, "Musician") || has(s, "Music"),
    lines: ["makes the noise.", "is here for the music.", "keeps the sound on."],
  },
  {
    when: (s) => has(s, "Founder") || has(s, "Startups"),
    lines: ["is building something.", "is early and loud about it.", "ships on weekends.", "has a pitch ready."],
  },
  {
    when: (s) => has(s, "Developer") || has(s, "Coding"),
    lines: ["ships code.", "says it works on their machine.", "is three tabs from a fix.", "writes more than they delete."],
  },
  {
    when: (s) => has(s, "Designer") || has(s, "Design"),
    lines: ["moves pixels.", "notices the spacing.", "has opinions about fonts.", "nudges things two pixels left."],
  },
  {
    when: (s) => has(s, "Artist") || has(s, "Art") || has(s, "Animator"),
    lines: ["makes things.", "is always mid-project.", "draws it out first.", "has forty unfinished files."],
  },
  {
    when: (s) => has(s, "Editor") || has(s, "Editing"),
    lines: ["cuts it tight.", "wants one more pass.", "has notes."],
  },
  {
    when: (s) => has(s, "Photographer"),
    lines: ["waits for the light.", "shoots it twice.", "is here for a good frame."],
  },
  {
    when: (s) => has(s, "Meme Creator") || has(s, "Memes"),
    lines: ["posts the funny ones.", "is a certified poster.", "sends it to the group chat first."],
  },
  {
    when: (s) => has(s, "Gamer") || has(s, "Gaming"),
    lines: ["says one more round.", "is online at 3am.", "is ranked, apparently.", "blames the lag."],
  },
  {
    when: (s) => has(s, "Writer"),
    lines: ["writes it down.", "drafts everything twice.", "has a notes app full of it."],
  },
  {
    when: (s) => has(s, "Anime") || has(s, "Movies"),
    lines: ["watches everything.", "is mid-arc.", "has a letterboxd and uses it."],
  },
  {
    when: (s) => has(s, "Fitness"),
    lines: ["never skips.", "is up before you.", "counts the reps."],
  },
  {
    when: (s) => has(s, "Student") || has(s, "Study"),
    lines: ["is still studying.", "has exams pending.", "is revising, allegedly."],
  },
  {
    when: (s) => has(s, "Creator") || has(s, "Creators") || has(s, "Tech"),
    lines: ["posts and builds.", "is online a lot.", "makes things on purpose."],
  },
  {
    // Nothing picked, but they were here at the start, which is its own fact.
    when: (s) => s.memberNo !== null && s.memberNo <= 50,
    lines: ["was here before most.", "found it first.", "got in early."],
  },
  {
    when: () => true,
    lines: ["is new here.", "is figuring it out.", "just arrived.", "has not filled this in yet."],
  },
];

function has(s: RemarkSource, value: string): boolean {
  return s.tags.includes(value) || s.interests.includes(value);
}

/**
 * Stable, well-spread choice from an account id.
 *
 * FNV-1a rather than summing character codes: ids are uuids, which share
 * most of their alphabet and all of their length, and a sum clusters them
 * hard enough that neighbouring accounts keep drawing the same line.
 */
function hash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function remarkFor(source: RemarkSource): string {
  const group = LINES.find((g) => g.when(source)) ?? LINES[LINES.length - 1];
  return `${SUBJECT} ${group.lines[hash(source.userId) % group.lines.length]}`;
}
