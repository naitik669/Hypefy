/**
 * What a reaction is, now that it can be a thing you own.
 *
 * message_reactions.emoji is free text, so a reaction with a frame in it
 * needs no migration — it needs a shape the column can hold and both ends
 * agree on. `frame:<id>` is that shape.
 *
 * Free text also means a client can write whatever it likes into that
 * column, so nothing here trusts what comes back. A token is only a frame
 * if it looks like one, and a frame only draws if the catalogue has it:
 * anything else falls through to being drawn as text, which is what the
 * column held before any of this and is harmless.
 */

const FRAME_PREFIX = "frame:";

/**
 * Frame ids are catalogue keys — short, and without the punctuation that
 * would let a token smuggle anything past the renderer.
 */
const FRAME_ID = /^[a-z0-9][a-z0-9_-]{0,47}$/i;

/** The reaction that means "this frame". */
export function frameReaction(frameId: string): string {
  return `${FRAME_PREFIX}${frameId}`;
}

/**
 * The frame a reaction names, or null when it names none.
 *
 * Null for an emoji, and null for a token that merely starts the right
 * way — the id still has to look like an id.
 */
export function frameIdOf(reaction: string): string | null {
  if (!reaction.startsWith(FRAME_PREFIX)) return null;
  const id = reaction.slice(FRAME_PREFIX.length);
  return FRAME_ID.test(id) ? id : null;
}

/**
 * What a screen reader says for a reaction.
 *
 * An emoji reads as itself. A frame reads as its name, because "frame:
 * aurora" is a token and not a thing anybody said.
 */
export function reactionLabel(reaction: string, frameLabel?: string | null): string {
  const id = frameIdOf(reaction);
  if (!id) return reaction;
  return frameLabel?.trim() || id;
}
