/**
 * Hypefy content utilities.
 * Parse hashtags and mentions from post caption/body text.
 * Used in the post composer and for storing structured data.
 */

/**
 * Extract hashtags from text.
 * Returns lowercase tag names without the '#' prefix.
 * Deduplicates results.
 *
 * @example extractHashtags("Working on #Hypefy and #Design")
 * // → ["hypefy", "design"]
 */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /#([a-zA-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tag = m[1].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/**
 * Extract mentions from text.
 * Returns lowercase usernames without the '@' prefix.
 * Deduplicates results.
 *
 * @example extractMentions("Working with @aman and @crazie.extra")
 * // → ["aman", "crazie.extra"]
 */
export function extractMentions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /@([a-zA-Z0-9_.]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const handle = m[1].toLowerCase();
    if (!seen.has(handle)) {
      seen.add(handle);
      out.push(handle);
    }
  }
  return out;
}
