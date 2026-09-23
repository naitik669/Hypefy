/**
 * One mute for the whole feed.
 *
 * There used to be two: Shots kept theirs in sessionStorage (lib/shot-audio)
 * and song previews kept theirs in localStorage (lib/music). Scrolling a feed
 * that mixes both, muting a Shot left the next post's song playing, and the
 * little speaker on a song chip did nothing to the videos. Sound is one thing
 * to the person holding the phone, so it is one preference here.
 *
 * Persisted rather than per-sitting: muting is deliberate, and a phone that
 * starts talking again tomorrow because the choice was forgotten is the
 * surprise worth avoiding.
 */

const KEY = "hypefy_sound_muted";
/** The two preferences this replaces, read once so nobody loses their choice. */
const OLD_MUSIC_KEY = "hypefy_music_muted";
const OLD_SHOTS_KEY = "hypefy.shots.muted";

type Listener = () => void;
const listeners = new Set<Listener>();

/** Default unmuted: a Shot is made with sound, and a song is chosen to be heard.
 *  Whether sound actually happens is a separate question the browser answers. */
let muted = false;
let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      muted = raw === "1";
      return;
    }
    // Either of the old switches counts: someone who muted music yesterday
    // meant "be quiet", not "be quiet except for videos".
    muted =
      localStorage.getItem(OLD_MUSIC_KEY) === "1" ||
      sessionStorage.getItem(OLD_SHOTS_KEY) === "1";
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
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* nothing to do; the choice still holds for this page */
  }
  listeners.forEach((fn) => fn());
}

export function toggleMuted() {
  setMuted(!isMuted());
}

export function subscribeSound(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
