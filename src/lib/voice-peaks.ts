/**
 * The shape of a voice note.
 *
 * The old waveform was computed from the bar's index, so every voice note in
 * the app was the same drawing — decoration standing where information should
 * be. These are real loudness samples, taken off the microphone while the note
 * is being recorded and carried in the message body, so a note looks like what
 * it sounds like and a pause reads as a gap.
 */

/** How many samples a note is stored with. */
export const PEAK_COUNT = 48;

/** The loudest a stored sample can be. Ints, so the body stays small. */
export const PEAK_MAX = 100;

/**
 * Reduce the samples taken while recording down to the stored few.
 *
 * Buckets are averaged rather than maxed: a max keeps every click and lip
 * noise at full height and flattens the difference between talking and
 * shouting, which is the whole signal.
 *
 * Then the whole note is scaled so its loudest moment reaches the top. Voice
 * notes are recorded at wildly different distances from the microphone, and
 * without this a quietly-spoken note is a flat line.
 */
export function summarisePeaks(samples: readonly number[], count = PEAK_COUNT): number[] {
  if (samples.length === 0) return [];
  const buckets = Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * samples.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / count));
    const slice = samples.slice(from, to);
    return slice.reduce((sum, v) => sum + v, 0) / slice.length;
  });
  const loudest = Math.max(...buckets);
  // A note with no sound in it at all would divide by zero; it gets a flat
  // floor instead, which is honest — there is nothing to draw.
  if (loudest <= 0) return buckets.map(() => 0);
  return buckets.map((v) => Math.round(Math.min(PEAK_MAX, (v / loudest) * PEAK_MAX)));
}

/**
 * Fit stored samples to however many bars the bubble has room for.
 *
 * Averaging again, for the same reason as above. Asking for more bars than
 * were stored repeats samples rather than inventing detail, which keeps a
 * short note from looking more precise than it is.
 */
export function resamplePeaks(peaks: readonly number[], count: number): number[] {
  if (peaks.length === 0 || count <= 0) return [];
  if (peaks.length === count) return [...peaks];
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor((i * peaks.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / count));
    const slice = peaks.slice(from, to);
    return Math.round(slice.reduce((sum, v) => sum + v, 0) / slice.length);
  });
}

/** The narrowest and widest a voice bubble gets, and how fast it grows. */
const WIDTH_MIN = 158;
const WIDTH_MAX = 262;
const WIDTH_PER_SEC = 2.4;

/**
 * How wide the bubble is for a note of this length.
 *
 * Every voice note used to be exactly 200px, so a two-second "yeah" and a
 * two-minute story were the same object. Growing with duration means the
 * length of the thing you are about to commit to is visible before you press
 * play. It is capped early — past about three-quarters of a minute the exact
 * length stops mattering and only "this is a long one" does.
 */
export function voiceWidth(durationSecs: number): number {
  const secs = Number.isFinite(durationSecs) && durationSecs > 0 ? durationSecs : 0;
  return Math.round(Math.min(WIDTH_MAX, WIDTH_MIN + secs * WIDTH_PER_SEC));
}

/** Bar plus gap, in px — the density the waveform keeps at any width. */
const BAR_PITCH = 4;
/** Everything in the bubble that is not waveform: button, padding, duration. */
const BUBBLE_CHROME = 96;

/**
 * How many bars fit a bubble of this width.
 *
 * Bar count follows width so the bars stay the same thickness in every note;
 * a fixed count would stretch them in a long note and crush them in a short
 * one, which is how the waveform stopped meaning anything in the first place.
 */
export function barCount(width: number): number {
  const room = width - BUBBLE_CHROME;
  return Math.max(12, Math.min(PEAK_COUNT, Math.round(room / BAR_PITCH)));
}
