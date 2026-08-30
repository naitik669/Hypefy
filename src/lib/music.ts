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
export type PlayOpts = { audible?: boolean };

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
    void spotifyPlay(track.uri!, (track.start ?? 0) * 1000).then((ok) => {
      if (!ok) { playingId = null; emit(); }
    });
    return;
  }

  const a = ensureAudio();
  if (playingId === track.id) {
    a.pause();
    return;
  }
  applyMute(a, opts);
  a.src = srcFor(track);
  playingId = track.id;
  emit();
  a.play().catch(() => {
    playingId = null;
    emit();
  });
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
    void spotifyPlay(track.uri!, (track.start ?? 0) * 1000).then((ok) => {
      if (!ok) { playingId = null; emit(); }
    });
    return;
  }

  const a = ensureAudio();
  const sameSrc = a.src === srcFor(track);
  if (sameSrc && playingId === track.id && !a.paused) return;
  applyMute(a, opts);
  if (!sameSrc) a.src = srcFor(track);
  playingId = track.id;
  emit();
  a.play().catch(() => {
    playingId = null;
    emit();
  });
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
