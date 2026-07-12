"use client";

import { Volume2, VolumeX } from "lucide-react";
import { toggleMusicMuted, useMusicMuted } from "@/lib/music";

/**
 * Global music mute toggle — one tap silences every song preview surface
 * (feed autoplay, chips, anthem). Persisted across sessions.
 */
export function MusicMuteButton({ className = "" }: { className?: string }) {
  const muted = useMusicMuted();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleMusicMuted();
      }}
      aria-label={muted ? "Unmute music" : "Mute music"}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface transition-colors ${
        muted ? "text-danger" : "text-muted hover:text-foreground"
      } ${className}`}
    >
      {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
    </button>
  );
}
