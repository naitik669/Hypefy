"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bookmark, ListPlus, Lock, Music, Pause, Play, Plus } from "lucide-react";
import { SoundPlaylistSheet } from "@/components/saved/SoundPlaylistSheet";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { playPreview, useIsPlaying, useStopPreviewOnUnmount, type Track } from "@/lib/music";
import { saveSound, unsaveSound } from "@/lib/sound-shelf";

/** The Shot camera, opened with this sound already chosen. */
export function composerHrefFor(trackId: string): string {
  return `/create?mode=shot&sound=${encodeURIComponent(trackId)}`;
}

/**
 * The top of a sound's page: what it is, a way to hear it, a way to keep
 * it, and the button the page exists for.
 *
 * Pressing play here is choosing to listen, so it is heard even when the
 * feed is muted (see PlayOpts.audible in lib/music).
 */
export function SoundHero({
  track,
  countLine,
  userId,
  canUse,
  initialSaved,
  ownerHref,
}: {
  track: Track;
  /** "3 Shots · 1 post" */
  countLine: string;
  /** Who is looking; null when signed out. */
  userId: string | null;
  /** False for original audio from a private account. */
  canUse: boolean;
  initialSaved: boolean;
  /** Original audio: the profile it belongs to. */
  ownerHref?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const playing = useIsPlaying(track.id);
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [filing, setFiling] = useState(false);
  useStopPreviewOnUnmount();

  async function toggleSave() {
    if (!userId || pending) return;
    setPending(true);
    const was = saved;
    setSaved(!was);
    haptics.select();
    const ok = was ? await unsaveSound(supabase, userId, track.id) : await saveSound(supabase, userId, track);
    setPending(false);
    if (!ok) {
      setSaved(was);
      toast("Couldn't update that. Try again.", "error");
      return;
    }
    toast(was ? "Removed from your Library" : "Added to Library. It's in the sound picker when you make a Shot.", "success");
  }

  return (
    <section className="flex flex-col gap-4 px-4 pt-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => playPreview(track, { audible: true })}
          aria-label={playing ? "Pause" : `Play ${track.title}`}
          aria-pressed={playing}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-surface"
        >
          {track.artwork ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track.artwork} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-accent">
              <Music size={30} />
            </span>
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 text-xl font-extrabold leading-tight tracking-tight">{track.title}</h1>
          {track.artist &&
            (ownerHref ? (
              <Link href={ownerHref} className="mt-0.5 block truncate text-sm text-muted hover:text-foreground">
                {track.artist}
              </Link>
            ) : (
              <p className="mt-0.5 truncate text-sm text-muted">{track.artist}</p>
            ))}
          {countLine && <p className="mt-1.5 text-xs font-semibold text-faint">{countLine}</p>}
        </div>
      </div>

      <div className="flex gap-2">
        {canUse ? (
          <Link
            href={userId ? composerHrefFor(track.id) : "/onboarding"}
            data-use-sound
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition-transform active:scale-[0.99]"
          >
            <Plus size={17} strokeWidth={2.6} />
            {userId ? "Use this sound" : "Join to use this sound"}
          </Link>
        ) : (
          // Said, rather than a button that is missing with no reason given.
          <p
            data-use-sound-off
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-border px-3 text-xs font-semibold text-muted"
          >
            <Lock size={14} />
            This sound can&rsquo;t be used for new Shots
          </p>
        )}
        {userId && canUse && (
          <button
            type="button"
            onClick={toggleSave}
            aria-pressed={saved}
            aria-label={saved ? "In your Library. Remove it" : "Add this sound to your Library"}
            data-save-sound
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border"
          >
            <Bookmark size={18} className={saved ? "text-accent" : "text-foreground"} fill={saved ? "currentColor" : "none"} />
          </button>
        )}
        {userId && canUse && (
          <button
            type="button"
            onClick={() => setFiling(true)}
            aria-label="Add this sound to a playlist"
            data-sound-playlists
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border text-foreground"
          >
            <ListPlus size={18} />
          </button>
        )}
        {track.appleUrl && (
          <a
            href={track.appleUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open the full song"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border text-foreground"
          >
            <ArrowUpRight size={18} />
          </a>
        )}
      </div>
      {filing && (
        <SoundPlaylistSheet
          open
          track={track}
          onClose={(changed) => {
            setFiling(false);
            // Filing a sound keeps it in the Library too.
            if (changed) setSaved(true);
          }}
        />
      )}
    </section>
  );
}
