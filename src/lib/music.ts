"use client";

import { useEffect, useSyncExternalStore } from "react";
import { spotifyPlay, spotifyPause } from "@/lib/spotify-player";

/** A song attached to a note/post/show/profile — shaped by /api/music. */
export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  /** 30s mp3. Empty for Spotify tracks — Spotify stopped serving previews to
   *  newly-created apps, so those play through `uri` and the Playback SDK. */
  preview: string;
  /** `spotify:track:…` — full-length playback via the Web Playback SDK. */
  uri?: string;
  /** Real track length in ms, so a snippet timeline can span the whole song
   *  instead of a 30s preview. */
  durationMs?: number;
  /** Seconds into the track to start from (snippet selection). */
  start?: number;
  /** "Listen on" link — Apple Music or Spotify, depending on the source. */
  appleUrl?: string;
};

/**
 * Parse a track jsonb column defensively — bad shapes become null.
 *
 * Playable means a preview OR a Spotify uri: rows written before the switch
 * have only the former, rows written after only the latter, and both have to
 * keep working in the same feed.
 */
export function parseTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (!t.id || !t.title || !(t.preview || t.uri)) return null;
  const start = Number(t.start);
  const durationMs = Number(t.durationMs);
  return {
    id: String(t.id),
    title: String(t.title),
    artist: String(t.artist ?? ""),
    artwork: String(t.artwork ?? ""),
    preview: String(t.preview ?? ""),
    ...(t.uri ? { uri: String(t.uri) } : {}),
    ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationMs } : {}),
    ...(Number.isFinite(start) && start > 0 ? { start } : {}),
    ...(t.appleUrl ? { appleUrl: String(t.appleUrl) } : {}),
  };
}

/**
 * Media-fragment URL for a track — `#t=12` makes the <audio> element start
 * 12s into the preview natively, no seek bookkeeping needed.
 */
function srcFor(track: Track): string {
  return track.start ? `${track.preview}#t=${track.start}` : track.preview;
}

/**
 * One shared <audio> element for the whole app so only one 30s preview plays
 * at a time — starting a track anywhere stops whatever else was playing.
 */
let audio: HTMLAudioElement | null = null;
let playingId: string | null = null;
/**
 * The track that should start again when it ends, and from where — its
 * snippet start, not 0:00, so a Diary loops the part its writer picked.
 * Cleared by any play that does not ask to loop.
 */
let loopFrom: { id: string; start: number } | null = null;
/**
 * Which play() is the latest. A play interrupted by the next one (or by a
 * pause) rejects later; only the latest may say "it did not start", or a
 * stale rejection would mark a song that is playing as stopped.
 */
let playSeq = 0;
/** A play the browser refused, waiting for the next touch to try again. */
let retryOnTouch: (() => void) | null = null;
function startPlay(a: HTMLAudioElement) {
  const seq = ++playSeq;
  const id = playingId;
  if (retryOnTouch) {
    document.removeEventListener("pointerdown", retryOnTouch, true);
    retryOnTouch = null;
  }
  a.play().catch((err: unknown) => {
    if (seq !== playSeq) return;
    playingId = null;
    emit();
    // Opened without a tap first (a reload, a link from outside), the browser
    // will not start sound on its own. The first touch anywhere on the page
    // is allowed to, so the song starts then rather than never.
    if ((err as { name?: string } | null)?.name !== "NotAllowedError" || typeof document === "undefined") return;
    const retry = () => {
      document.removeEventListener("pointerdown", retry, true);
      if (retryOnTouch === retry) retryOnTouch = null;
      if (seq !== playSeq || !id) return;
      playingId = id;
      emit();
      startPlay(a);
    };
    retryOnTouch = retry;
    document.addEventListener("pointerdown", retry, true);
  });
}
const listeners = new Set<() => void>();

const MUTE_KEY = "hypefy_music_muted";
let musicMuted = false;
try {
  musicMuted = typeof window !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
} catch { /* storage unavailable */ }

function emit() {
  listeners.forEach((l) => l());
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
    audio.muted = musicMuted;
    const clear = () => {
      // A looping track that just ran out goes round again instead. "pause"
      // fires before "ended" at the end of a track; whichever comes first
      // finds it stopped at the end, seeks back and plays, and the other then
      // finds it playing and leaves it be.
      if (audio && audio.ended && audio.paused && loopFrom && loopFrom.id === playingId) {
        audio.currentTime = loopFrom.start;
        void audio.play().catch(() => {});
        return;
      }
      // pause/error events are queued async — if another play() already
      // started (track switch), the element isn't paused anymore: keep state.
      if (audio && !audio.paused) return;
      playingId = null;
      emit();
    };
    audio.addEventListener("ended", clear);
    audio.addEventListener("pause", clear);
    audio.addEventListener("error", clear);
  }
  return audio;
}

/** Spotify tracks have no preview mp3, so they route to the Playback SDK.
 *  Everything else stays on the shared <audio> element. */
function usesSpotify(track: Track): boolean {
  return !!track.uri && !track.preview;
}

/**
 * Two kinds of playback share one audio element and want opposite things from
 * the mute switch.
 *
 * Ambient playback — a song under a feed post or a Show — is exactly what the
 * mute button exists for. Deliberate playback is the user pressing play inside
 * a picker to *choose* a song, and muting that makes the picker unusable: you
 * cannot pick the right moment of a track you cannot hear.
 *
 * So deliberate playback passes `audible` and ignores the mute. Nothing is
 * persisted, and the next ambient play re-reads musicMuted, so the mute switch
 * is untouched by any of this.
 */
export type PlayOpts = {
  audible?: boolean;
  /** Start again from the snippet start each time it ends (a Diary's song). */
  loop?: boolean;
  /** Start from the snippet start even if this track was paused part-way. */
  restart?: boolean;
};

function setLoop(track: Track, opts?: PlayOpts) {
  loopFrom = opts?.loop ? { id: track.id, start: track.start ?? 0 } : null;
}

function applyMute(a: HTMLAudioElement, opts?: PlayOpts) {
  a.muted = opts?.audible ? false : musicMuted;
}

export function playPreview(track: Track, opts?: PlayOpts) {
  if (usesSpotify(track)) {
    if (playingId === track.id) {
      void spotifyPause();
      playingId = null;
      emit();
      return;
    }
    // Stop any mp3 first — the two players are independent and would
    // otherwise overlap.
    audio?.pause();
    playingId = track.id;
    emit();
    void spotifyPlay(track.uri!, (track.start ?? 0) * 1000, { repeat: !!opts?.loop }).then((ok) => {
      if (!ok) { playingId = null; emit(); }
    });
    return;
  }

  const a = ensureAudio();
  if (playingId === track.id) {
    a.pause();
    return;
  }
  setLoop(track, opts);
  applyMute(a, opts);
  a.src = srcFor(track);
  playingId = track.id;
  emit();
  startPlay(a);
}

export function stopPreview() {
  if (audio && playingId) audio.pause();
  void spotifyPause();
  if (playingId) { playingId = null; emit(); }
}

/**
 * Keep this track playing (no toggle): used by the Show viewer so re-entering
 * the unpaused state resumes from where the preview left off instead of
 * restarting. Only swaps src when the track actually changed.
 */
export function ensurePreviewPlaying(track: Track, opts?: PlayOpts) {
  if (usesSpotify(track)) {
    audio?.pause();
    playingId = track.id;
    emit();
    // Always restarts at `start`. The SDK cannot resume mid-snippet from a
    // different offset, and for scrubbing — the only caller that repeats —
    // restarting at the new point is the intended behaviour anyway.
    void spotifyPlay(track.uri!, (track.start ?? 0) * 1000, { repeat: !!opts?.loop }).then((ok) => {
      if (!ok) { playingId = null; emit(); }
    });
    return;
  }

  const a = ensureAudio();
  const sameSrc = a.src === srcFor(track);
  setLoop(track, opts);
  if (sameSrc && playingId === track.id && !a.paused && !opts?.restart) return;
  applyMute(a, opts);
  if (!sameSrc) a.src = srcFor(track);
  else if (opts?.restart) a.currentTime = track.start ?? 0;
  playingId = track.id;
  emit();
  startPlay(a);
}

/**
 * Surfaces that play a song for as long as they are on screen — the page at
 * the front of Spotlight, a page opened full screen over it. The newest claim
 * plays. Releasing it pauses only if it is still the one playing, and hands
 * the song back to the claim underneath, so closing a full-screen page does
 * not leave the page behind it silent, and a card leaving late does not stop
 * the song of the card that replaced it.
 */
type Claim = { track: Track; opts?: PlayOpts };
const claims: Claim[] = [];
export function claimPreview(track: Track, opts?: PlayOpts): () => void {
  const claim: Claim = { track, opts };
  claims.push(claim);
  ensurePreviewPlaying(track, opts);
  return () => {
    const i = claims.indexOf(claim);
    if (i < 0) return;
    const wasTop = i === claims.length - 1;
    claims.splice(i, 1);
    if (!wasTop) return;
    const under = claims[claims.length - 1];
    if (under) ensurePreviewPlaying(under.track, under.opts);
    else if (playingId === track.id) pausePreview();
  };
}

/** Pause without clearing the source, so ensurePreviewPlaying can resume. */
export function pausePreview() {
  audio?.pause();
  void spotifyPause();
  if (playingId) { playingId = null; emit(); }
}

/** Global music mute — one tap silences every preview surface, persisted. */
export function toggleMusicMuted() {
  musicMuted = !musicMuted;
  if (audio) audio.muted = musicMuted;
  try { localStorage.setItem(MUTE_KEY, musicMuted ? "1" : "0"); } catch {}
  emit();
}

export function useMusicMuted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => musicMuted,
    () => false,
  );
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive id of the currently playing preview (null when silent). */
export function usePlayingTrackId(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => playingId,
    () => null,
  );
}

/** Convenience: is this specific track playing right now? */
export function useIsPlaying(trackId: string | undefined): boolean {
  const playing = usePlayingTrackId();
  return !!trackId && playing === trackId;
}

/** Stop any preview when the calling surface unmounts (viewers, sheets). */
export function useStopPreviewOnUnmount() {
  useEffect(() => stopPreview, []);
}
