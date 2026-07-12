"use client";

import { useEffect, useSyncExternalStore } from "react";

/** A song attached to a note/post/show/profile — shaped by /api/music. */
export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  preview: string;
  /** Seconds into the 30s preview to start from (snippet selection). */
  start?: number;
};

/** Parse a track jsonb column defensively — bad shapes become null. */
export function parseTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (!t.id || !t.title || !t.preview) return null;
  const start = Number(t.start);
  return {
    id: String(t.id),
    title: String(t.title),
    artist: String(t.artist ?? ""),
    artwork: String(t.artwork ?? ""),
    preview: String(t.preview),
    ...(Number.isFinite(start) && start > 0 ? { start } : {}),
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

export function playPreview(track: Track) {
  const a = ensureAudio();
  if (playingId === track.id) {
    a.pause();
    return;
  }
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
}

/**
 * Keep this track playing (no toggle): used by the Show viewer so re-entering
 * the unpaused state resumes from where the preview left off instead of
 * restarting. Only swaps src when the track actually changed.
 */
export function ensurePreviewPlaying(track: Track) {
  const a = ensureAudio();
  const sameSrc = a.src === srcFor(track);
  if (sameSrc && playingId === track.id && !a.paused) return;
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
