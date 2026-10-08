"use client";

import { useState } from "react";
import { Archive, Loader2, Play, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { ShotCover } from "@/components/profile/ProfileGrids";
import { setArchived, type ArchivedItem } from "@/lib/post-controls";

/**
 * What you have archived, and the way back.
 *
 * Tiles do not open: an archived post is off every screen in the app, so
 * there is nowhere for a tap to go. Put it back first, and it returns to
 * exactly where it was, with its hypes and comments intact.
 */
export function ArchiveList({ initial }: { initial: ArchivedItem[] }) {
  const supabase = createClient();
  const showToast = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function restore(item: ArchivedItem) {
    setBusy(item.id);
    const problem = await setArchived(supabase, item.kind, item.id, false);
    setBusy(null);
    if (problem) {
      showToast(problem);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    showToast(item.kind === "shot" ? "Shot is back" : "Post is back");
  }

  if (items.length === 0) {
    return (
      <div className="pt-10">
        <EmptyState
          icon={Archive}
          title="Nothing archived"
          text="Archive a post or Shot to take it off everything without deleting it. Only you can see what is here."
          variant="compact"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 items-start gap-2 px-3 pb-10 pt-2">
      {items.map((item) => (
        <div key={`${item.kind}-${item.id}`} className="overflow-hidden rounded-2xl bg-surface">
          <div className="relative aspect-[4/5] overflow-hidden bg-elevated">
            {item.kind === "shot" ? (
              <ShotCover poster={item.thumb} media={item.media_url ?? ""} />
            ) : item.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <span className="absolute inset-0 flex items-center p-3 text-xs leading-snug text-muted">
                <span className="line-clamp-6">{item.caption ?? "Post"}</span>
              </span>
            )}
            {item.kind === "shot" && (
              <Play size={16} className="absolute right-2 top-2 text-white drop-shadow" fill="currentColor" aria-hidden />
            )}
          </div>
          <div className="flex items-center gap-2 p-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold">
                {item.kind === "shot" ? "Shot" : "Post"}
              </span>
              {item.caption && <span className="block truncate text-[11px] text-muted">{item.caption}</span>}
            </span>
            <button
              type="button"
              disabled={busy === item.id}
              onClick={() => void restore(item)}
              aria-label={`Put this ${item.kind === "shot" ? "Shot" : "post"} back`}
              className="flex h-8 shrink-0 items-center gap-1 rounded-pill bg-accent px-2.5 text-[11px] font-bold text-accent-ink disabled:opacity-60"
            >
              {busy === item.id ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Put back
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
