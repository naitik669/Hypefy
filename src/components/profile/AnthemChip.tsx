"use client";

import { useState } from "react";
import { Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TrackChip } from "@/components/music/TrackChip";
import { TrackPicker } from "@/components/music/TrackPicker";
import { parseTrack, type Track } from "@/lib/music";

/**
 * Profile anthem — the one song that lives under your vibe. Owners set/clear
 * it via TrackPicker; visitors just tap to hear the 30s preview.
 */
export function AnthemChip({
  anthem,
  editable = false,
  userId,
}: {
  anthem: unknown;
  editable?: boolean;
  userId?: string;
}) {
  const [track, setTrack] = useState<Track | null>(() => parseTrack(anthem));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(next: Track | null) {
    if (!userId || busy) return;
    const prev = track;
    setTrack(next);
    setBusy(true);
    const { error } = await createClient()
      .from("profiles")
      .update({ anthem: next })
      .eq("id", userId);
    setBusy(false);
    if (error) setTrack(prev);
  }

  if (!track && !editable) return null;

  return (
    <div className="mt-1.5">
      {track ? (
        <TrackChip track={track} onRemove={editable ? () => save(null) : undefined} />
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/25 hover:text-foreground"
        >
          <Music size={13} /> Set an anthem
        </button>
      )}

      {editable && (
        <TrackPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(t) => save(t)} />
      )}
    </div>
  );
}
