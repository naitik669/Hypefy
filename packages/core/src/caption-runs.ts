/** An emoji, by the Unicode property that covers every pictograph. */
const PICTO = /\p{Extended_Pictographic}/u;

/** A stretch of a caption that is either all emoji or all not. */
export type CaptionRun = { text: string; emoji: boolean };

/**
 * A caption split into emoji runs and word runs.
 *
 * Only so the two can be styled apart: the shadow that keeps words readable
 * over a bright photo has to go on the words alone. On an emoji — already an
 * opaque block of colour — the same shadow reads as a smudge stuck to the
 * glyph rather than as depth behind a letter.
 *
 * Runs, not single characters, so "going with it" stays one text node and the
 * line breaks and kerns exactly as it did before this existed.
 */
export function captionRuns(text: string): CaptionRun[] {
  return clusters(text).reduce<CaptionRun[]>((runs, c) => {
    const emoji = PICTO.test(c);
    const last = runs[runs.length - 1];
    return last && last.emoji === emoji
      ? [...runs.slice(0, -1), { text: last.text + c, emoji }]
      : [...runs, { text: c, emoji }];
  }, []);
}

/**
 * The characters a reader sees, not the code points.
 *
 * A flag, a skin tone, or a family joined by zero-width joiners is one
 * character to a reader and several to the string; spreading the string would
 * cut them apart and leave half an emoji in a word run. Segmenter has been in
 * every browser this app supports for years, and the repo already relies on
 * it, but the fallback costs one line and keeps a caption rendering rather
 * than throwing if it is ever missing.
 */
function clusters(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter().segment(text)].map((s) => s.segment);
  }
  return [...text];
}
