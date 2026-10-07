"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListPlus, Music, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { SoundRow } from "@/components/saved/SoundRow";
import { SoundPlaylistSheet } from "@/components/saved/SoundPlaylistSheet";
import { composerHrefFor } from "@/components/music/SoundHero";
import { useStopPreviewOnUnmount, type Track } from "@/lib/music";
import { unsaveSound } from "@/lib/sound-shelf";

/**
 * The sounds in your Library: play one, use it for a Shot, file it into a
 * playlist, or take it out.
 */
export function LibrarySounds({ userId, initial }: { userId: string; initial: Track[] }) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [sounds, setSounds] = useState(initial);
  const [filing, setFiling] = useState<Track | null>(null);
  useStopPreviewOnUnmount();

  async function remove(track: Track) {
    const before = sounds;
    setSounds((s) => s.filter((t) => t.id !== track.id));
    if (!(await unsaveSound(supabase, userId, track.id))) {
      setSounds(before);
      toast("Couldn't remove that. Try again.", "error");
    }
  }

  if (sounds.length === 0) {
    return (
      <EmptyState
        icon={Music}
        title="No sounds in your Library"
        text="Tap the sound on any Shot, then the bookmark on its page."
        variant="compact"
      />
    );
  }

  return (
    <div className="flex flex-col pb-4" data-library-sounds>
      {sounds.map((t) => (
        <SoundRow
          key={t.id}
          track={t}
          right={
            <span className="flex shrink-0 items-center gap-1">
              <Link
                href={composerHrefFor(t.id)}
                className="rounded-pill border border-border px-3 py-1.5 text-xs font-bold text-foreground"
              >
                Use
              </Link>
              <button
                type="button"
                onClick={() => setFiling(t)}
                aria-label={`Add ${t.title} to a playlist`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:text-foreground"
              >
                <ListPlus size={18} />
              </button>
              <button
                type="button"
                onClick={() => void remove(t)}
                aria-label={`Remove ${t.title} from your Library`}
                className="flex h-9 w-9 items-center justify-center rounded-full text-faint hover:text-foreground"
              >
                <X size={16} />
              </button>
            </span>
          }
        />
      ))}
      {filing && <SoundPlaylistSheet open onClose={() => setFiling(null)} track={filing} />}
    </div>
  );
}
