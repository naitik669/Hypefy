"use client";

import { useEffect, useSyncExternalStore } from "react";

/** A song attached to a note/post/show/profile — shaped by /api/music. */
export type Track = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  preview: string;
};

/** Parse a track jsonb column defensively — bad shapes become null. */
export function parseTrack(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (!t.id || !t.title || !t.preview) return null;
  return {
    id: String(t.id),
    title: String(t.title),
    artist: String(t.artist ?? ""),
    artwork: String(t.artwork ?? ""),
    preview: String(t.preview),
  };
}

/**
 * One shared <audio> element for the whole app so only one 30s preview plays
 * at a time — starting a track anywhere stops whatever else was playing.
 */
let audio: HTMLAudioElement | null = null;
let playingId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "none";
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
  a.src = track.preview;
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
