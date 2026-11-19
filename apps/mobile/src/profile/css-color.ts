/**
 * A CSS colour, split the way SVG wants it.
 *
 * CSS puts the colour and its alpha in one function — `rgba(163,230,53,0.40)`
 * — and SVG takes them as two attributes, `stopColor` and `stopOpacity`. An
 * rgba() string handed to a stop renders as nothing at all, silently.
 *
 * In its own module rather than beside the screen that uses it, for the
 * reason that keeps recurring: a file importing react-native cannot be
 * loaded in a Node test, so maths left there could only be checked by
 * reading the source. This can be called.
 */

/** `rgba(163,230,53,0.40)` to `#a3e635`. Hex passes through untouched. */
export function toHex(css: string): string {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return css;
  const hex = (v: string) => Number(v).toString(16).padStart(2, "0");
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

/** The alpha of an `rgba()`, or 1 for anything else. */
export function alphaOf(css: string): number {
  const m = css.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/);
  return m ? Number(m[1]) : 1;
}
