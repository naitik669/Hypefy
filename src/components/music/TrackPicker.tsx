"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Search, Play, Pause } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  type Track,
  playPreview,
  stopPreview,
  usePlayingTrackId,
} from "@/lib/music";

/**
 * Song search sheet (iTunes via /api/music): type to search, tap artwork to
 * hear the 30s preview, tap the row to attach the track. Closing stops any
 * playing preview.
 */
export function TrackPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (track: Track) => void;
}) {
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const playingId = usePlayingTrackId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setTracks([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/music?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        setTracks((json.tracks ?? []) as Track[]);
      } catch {
        setTracks([]);
      } finally {
        setSearched(true);
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  // Reset + stop audio when the sheet closes
  useEffect(() => {
    if (!open) {
      stopPreview();
      setQuery("");
      setTracks([]);
      setSearched(false);
    } else {
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open]);

  function pick(track: Track) {
    stopPreview();
    onSelect(track);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a song">
      {/* Search field */}
      <div className="relative pb-3">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 -mt-1.5 text-faint" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs or artists…"
          className="input pl-10"
        />
      </div>

      <div className="flex min-h-[280px] flex-col pb-2">
        {loading ? (
          <div className="flex flex-col gap-1 pt-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <div className="skeleton h-11 w-11 shrink-0 rounded-lg" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="skeleton h-3 rounded" style={{ width: `${50 + (i % 3) * 15}%` }} />
                  <div className="skeleton h-2.5 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : tracks.length > 0 ? (
          <div className="flex flex-col">
            {tracks.map((t) => {
              const playing = playingId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t)}
                  className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={playing ? "Pause preview" : "Play preview"}
                    onClick={(e) => {
                      e.stopPropagation();
                      playPreview(t);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        playPreview(t);
                      }
                    }}
                    className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface"
                  >
                    {t.artwork ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.artwork} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-faint">
                        <Music size={16} />
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                      {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.title}</span>
                    <span className="block truncate text-xs text-muted">{t.artist}</span>
                  </span>
                  <span className="shrink-0 rounded-pill bg-surface px-3 py-1 text-xs font-bold text-accent">
                    Add
                  </span>
                </button>
              );
            })}
          </div>
        ) : searched ? (
          <EmptyState icon={Music} title="No songs found" text="Try a different title or artist." variant="compact" />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <Music size={28} className="text-faint" />
            <p className="text-sm text-muted">Search for a song to attach</p>
            <p className="text-xs text-faint">30-second previews, free via iTunes</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
