/**
 * Whether Shots in the feed play with sound, shared across every card.
 *
 * Two things have to be true at once, and neither works as per-card state:
 *
 *  - **The choice is about the feed, not about one Shot.** Muting a card and
 *    then scrolling to the next one must not ask again; per-card state means
 *    fighting the same toggle every few hundred pixels.
 *  - **Only one card may be audible.** Two Shots talking over each other is
 *    the failure people remember, and on a wide screen more than one card can
 *    clear the play threshold at once.
 *
 * The mute itself is not kept here: it is the app's one sound preference, in
 * lib/sound, shared with song previews. Muting a Shot in the feed silences
 * the song on the next post, which is what muting a feed means. What does
 * live here is the rest: who is allowed to be audible.
 */

import { isMuted as soundMuted, setMuted as setSoundMuted, subscribeSound } from "@/lib/sound";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Default UNMUTED. Whether sound actually happens is a separate question the
 *  browser answers — see `attemptWithSound` in ShotFeedCard. A card that is
 *  refused falls back to muted and says so, rather than silently not playing. */
export function isMuted(): boolean {
  return soundMuted();
}

export function setMuted(next: boolean) {
  setSoundMuted(next);
}

/** Fires on the mute preference, a change of audio owner, or the song
 *  previews' own speaker being tapped — they are the same switch now. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  const stopSound = subscribeSound(fn);
  return () => {
    listeners.delete(fn);
    stopSound();
  };
}

/**
 * Which card is allowed to make noise. Null means nobody has claimed it.
 *
 * Claiming is last-one-wins: the card that most recently came into view is
 * the one you are looking at, so it is the one that should be heard.
 */
let owner: string | null = null;

export function claimAudio(id: string) {
  if (owner === id) return;
  owner = id;
  listeners.forEach((fn) => fn());
}

export function releaseAudio(id: string) {
  if (owner !== id) return;
  owner = null;
  listeners.forEach((fn) => fn());
}

export function ownsAudio(id: string): boolean {
  return owner === id;
}

/** True when this card should be audible right now. */
export function shouldBeAudible(id: string): boolean {
  return !isMuted() && ownsAudio(id);
}
