/**
 * Text normalization utility for Hypefy.
 *
 * Use cleanText() when rendering user-generated content from the database
 * (post captions, bios, message bodies, notification bodies) to guard against
 * mojibake sequences that may have been stored before the encoding fix.
 *
 * Do NOT use on usernames, URLs, or structured data.
 */

/** Known mojibake -> correct character replacements */
const MOJIBAKE: [RegExp, string][] = [
  // UTF-8 double-encoded sequences (latin1 mis-read of UTF-8 bytes)
  [/â/g, "'"],  // right single quotation mark '
  [/â/g, "'"],  // left single quotation mark '
  [/â/g, '"'],  // left double quotation mark "
  [/â/g, '"'],  // right double quotation mark "
  [/â/g, "-"],  // en dash -
  [/â/g, "-"],  // em dash -
  [/â¢/g, "-"],  // bullet -
  [/â¦/g, "..."], // horizontal ellipsis ...
  [/Â /g, " "],        // non-breaking space -> regular space
  [/Â·/g, "·"],   // latin1 mis-encoded middle dot -> correct middle dot
  // String-level mojibake (if stored literally in DB as latin1 mis-read strings)
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€/g, '"'],
  [/â€“/g, "-"],
  [/â€”/g, "-"],
  [/â€¢/g, "-"],
  [/â€¦/g, "..."],
  // Stray Â prefix (latin1 C2 byte mis-rendered)
  [/Â(?=\s|$)/g, ""],
  // Unicode replacement character
  [/�/g, ""],
];

/**
 * Clean user-generated text coming from the database.
 * Returns an empty string for null/undefined input.
 * Removes known mojibake sequences and normalizes whitespace.
 */
export function cleanText(input: string | null | undefined): string {
  if (!input) return "";
  let out = input;
  for (const [pattern, replacement] of MOJIBAKE) {
    out = out.replace(pattern, replacement);
  }
  // Collapse multiple spaces/newlines into single space (optional -- only for
  // single-line contexts; for multi-line content callers should skip this)
  return out;
}

/**
 * Same as cleanText but also collapses whitespace runs into a single space.
 * Use for single-line display fields (usernames, display names, notification bodies).
 */
export function cleanTextInline(input: string | null | undefined): string {
  return cleanText(input).replace(/\s+/g, " ").trim();
}
