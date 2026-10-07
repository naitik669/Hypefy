"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { SoundRow } from "@/components/saved/SoundRow";
import {
  ensurePreviewPlaying,
  stopPreview,
  usePlayingTrackId,
  useStopPreviewOnUnmount,
  type Track,
} from "@/lib/music";
import { loadPlaylistSounds, nextInQueue, removePlaylistSound, type PlaylistSound } from "@/lib/playlists";

/**
 * The sounds in a playlist, and a button that plays them through.
 *
 * "Play sounds" starts at the top and moves on when each one ends; it stops
 * at the end rather than going round. Starting a row by hand while it is
 * playing through carries on from that row.
 */
export function PlaylistSounds({ playlistId, onCount }: { playlistId: string; onCount?: (n: number) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [sounds, setSounds] = useState<PlaylistSound[] | null>(null);
  const playingId = usePlayingTrackId();
  /** Playing through: the sound the queue last started. Null when it is not. */
  const [queued, setQueued] = useState<string | null>(null);
  const heard = useRef<string | null>(null);
  useStopPreviewOnUnmount();

  useEffect(() => {
    let live = true;
    void loadPlaylistSounds(supabase, playlistId).then((s) => {
      if (!live) return;
      setSounds(s);
      onCount?.(s.length);
    });
    return () => {
      live = false;
    };
    // onCount is the parent's setter; it does not change what is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, playlistId]);

  const tracks = (sounds ?? []).map((s) => s.track);
  const ids = tracks.map((t) => t.id);

  function start(track: Track) {
    heard.current = track.id;
    setQueued(track.id);
    ensurePreviewPlaying(track, { audible: true, restart: true });
  }

  // One has stopped. If the queue was on it and it was heard playing, the
  // next one starts; at the end the queue is over.
  useEffect(() => {
    if (!queued) return;
    if (playingId === queued) {
      heard.current = queued;
      return;
    }
    if (playingId !== null || heard.current !== queued) return;
    const nextId = nextInQueue(ids, queued);
    const next = tracks.find((t) => t.id === nextId);
    const t = setTimeout(() => {
      if (next) start(next);
      else setQueued(null);
    }, 0);
    return () => clearTimeout(t);
    // `ids`/`tracks` are rebuilt every render from `sounds`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId, queued, sounds]);

  async function remove(track: Track) {
    const before = sounds;
    setSounds((s) => (s ?? []).filter((x) => x.track.id !== track.id));
    if (!(await removePlaylistSound(supabase, playlistId, track.id))) {
      setSounds(before);
      toast("Couldn't take that out", "error");
      return;
    }
    onCount?.((before?.length ?? 1) - 1);
  }

  if (!sounds || sounds.length === 0) return null;
  const through = queued !== null;

  return (
    <section className="pb-4" data-playlist-sounds>
      <div className="flex items-center gap-3 px-4 pb-1">
        <h3 className="flex-1 text-xs font-bold uppercase tracking-widest text-faint">Sounds</h3>
        <button
          type="button"
          onClick={() => {
            if (through) {
              setQueued(null);
              stopPreview();
            } else if (tracks[0]) start(tracks[0]);
          }}
          aria-pressed={through}
          className="flex h-8 items-center gap-1.5 rounded-pill bg-accent px-3.5 text-xs font-extrabold text-accent-ink"
        >
          {through ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
          {through ? "Stop" : "Play sounds"}
        </button>
      </div>
      {tracks.map((t) => (
        <SoundRow
          key={t.id}
          track={t}
          // Started by hand mid-queue: carry on from here.
          onPlay={(track) => {
            if (through) {
              heard.current = null;
              setQueued(track.id);
            }
          }}
          right={
            <button
              type="button"
              onClick={() => void remove(t)}
              aria-label={`Take ${t.title} out of this playlist`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-faint hover:text-foreground"
            >
              <X size={16} />
            </button>
          }
        />
      ))}
    </section>
  );
}
