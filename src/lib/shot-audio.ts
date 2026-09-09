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
 * Kept in sessionStorage rather than localStorage on purpose: a preference
 * about sound belongs to this sitting. Coming back tomorrow to a phone that
 * starts talking is exactly the surprise this is trying to avoid.
 */

const KEY = "hypefy.shots.muted";

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Default UNMUTED. Whether sound actually happens is a separate question the
 * browser answers — see `attemptWithSound` in ShotFeedCard. A card that is
 * refused falls back to muted and says so, rather than silently not playing.
 */
let muted = false;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw !== null) muted = raw === "1";
  } catch {
    /* private mode — the in-memory default stands */
  }
}

export function isMuted(): boolean {
  hydrate();
  return muted;
}

export function setMuted(next: boolean) {
  hydrate();
  if (muted === next) return;
  muted = next;
  try {
    sessionStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* nothing to do; the choice still holds for this page */
  }
  listeners.forEach((fn) => fn());
}

/** Fires on both the mute preference and a change of audio owner. */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
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
