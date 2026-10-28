/**
 * Whether a message was forwarded, and what it actually says.
 *
 * Forwarding used to write "↪️ Forwarded: " onto the front of the body.
 * That put a label where the content goes, with four consequences: it
 * could not be styled, so it rendered as a stray coloured glyph mid
 * sentence; it followed the text into the inbox preview, into search and
 * into a quoted reply; forwarding a forward stacked a second copy of it;
 * and only text ever got it, so a forwarded photo or voice note said
 * nothing at all.
 *
 * It is a fact about the message, so it belongs in `metadata` (0177) and
 * is drawn as a label above the bubble, like "Pinned" — for every kind,
 * not only text.
 *
 * Messages sent the old way are still in people's threads, so the prefix
 * is read as the label it was standing in for and taken off the words.
 * Pure, so the thread, the quoted reply and the inbox preview all give
 * the same answer.
 */

/** What the old client wrote onto the front of a forwarded body. */
export const LEGACY_FORWARD_PREFIX = "↪️ Forwarded: ";

type MaybeForwarded = {
  body?: string | null;
  metadata?: { forwarded?: boolean } | null;
};

/** Whether to draw the label. */
export function isForwarded(m: MaybeForwarded): boolean {
  if (m.metadata?.forwarded === true) return true;
  return typeof m.body === "string" && m.body.startsWith(LEGACY_FORWARD_PREFIX);
}

/**
 * The message without the label the old client baked into it.
 *
 * Only the leading copy, and only once: a body that happens to contain
 * those words further in is somebody's sentence, not a marker, and a
 * forward of a forward should lose the one prefix it was given rather
 * than every one it ever had.
 */
export function forwardedBody(body: string | null | undefined): string | null {
  if (typeof body !== "string") return body ?? null;
  if (!body.startsWith(LEGACY_FORWARD_PREFIX)) return body;
  return body.slice(LEGACY_FORWARD_PREFIX.length);
}
