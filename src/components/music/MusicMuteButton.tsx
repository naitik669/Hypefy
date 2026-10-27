"use client";

import { Volume2, VolumeX } from "lucide-react";
import { toggleMusicMuted, useMusicMuted } from "@/lib/music";
import { useToast } from "@/components/ui/ToastProvider";

/** Said once, the first time someone silences music from inside a post. */
const TOLD_KEY = "hypefy_music_mute_explained";

/**
 * Global music mute toggle — one tap silences every song preview surface
 * (feed autoplay, chips, anthem). Persisted across sessions.
 *
 * It sits in the corner of a post now, which is where the sound is coming
 * from and also where it looks local. It is not: muting here silences the
 * whole feed. Rather than make it per-post — you want quiet, not quiet on
 * one post — it says so the first time it is used, once, ever.
 */
export function MusicMuteButton({
  onMedia = false,
  className = "",
}: {
  /** Glass squircle, for sitting on a photo rather than in a row. */
  onMedia?: boolean;
  className?: string;
}) {
  const muted = useMusicMuted();
  const toast = useToast();

  function explainOnce() {
    try {
      if (localStorage.getItem(TOLD_KEY)) return;
      localStorage.setItem(TOLD_KEY, "1");
      toast("Music off everywhere, not just this post");
    } catch {
      /* private mode: the toast is a courtesy, not a promise */
    }
  }

  const look = onMedia
    ? `h-[30px] w-[30px] rounded-[11px] border border-white/[0.16] bg-black/[0.46] backdrop-blur-md ${
        muted ? "text-danger" : "text-white/85"
      }`
    : `h-7 w-7 rounded-lg border border-border bg-surface ${
        muted ? "text-danger" : "text-muted hover:text-foreground"
      }`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!muted) explainOnce();
        toggleMusicMuted();
      }}
      aria-label={muted ? "Unmute music everywhere" : "Mute music everywhere"}
      className={`flex shrink-0 items-center justify-center transition-colors ${look} ${className}`}
    >
      {muted ? <VolumeX size={onMedia ? 14 : 13} /> : <Volume2 size={onMedia ? 14 : 13} />}
    </button>
  );
}
