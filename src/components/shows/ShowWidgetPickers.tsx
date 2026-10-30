"use client";

import { useEffect, useState } from "react";
import { Link2, MessageCircleQuestion, Image as ImageIcon, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * The sheet behind the Show editor's embed sticker: picking one of your
 * own posts or Shots. A song comes from TrackPicker; people, places, tags
 * and links are typed on their stickers (TagWriter).
 */

/** What a post or Shot embed shows once somebody is looking at it. */
export type EmbedState = {
  thumb: string | null;
  caption: string | null;
  /** Deleted, or taken down, since the Show was made. */
  gone?: boolean;
};

/** One of your own posts or Shots, as the picker lists it. */
type Mine = { kind: "post" | "shot"; id: string; thumb: string | null; caption: string | null };

/**
 * Your own posts and Shots, to embed one.
 *
 * Only your own: embedding is a way of pointing at something you made,
 * and a picker over everybody's would be a way of attaching a stranger's
 * picture to your Show.
 */
export function EmbedSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (choice: Mine) => void;
}) {
  const [supabase] = useState(createClient);
  const [mine, setMine] = useState<Mine[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let dropped = false;

    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        if (!dropped) setMine([]);
        return;
      }

      const [posts, shots] = await Promise.all([
        supabase
          .from("posts")
          .select("id, image_url, image_urls, caption, body, created_at")
          .eq("user_id", me)
          .is("removed_at", null)
          .order("created_at", { ascending: false })
          .limit(24),
        supabase
          .from("shots")
          .select("id, poster_url, caption, created_at")
          .eq("user_id", me)
          .is("removed_at", null)
          .order("created_at", { ascending: false })
          .limit(24),
      ]);

      if (dropped) return;
      setMine([
        ...(posts.data ?? []).map((p) => ({
          kind: "post" as const,
          id: p.id,
          thumb: p.image_url ?? p.image_urls?.[0] ?? null,
          caption: p.caption ?? p.body ?? null,
        })),
        ...(shots.data ?? []).map((s) => ({
          kind: "shot" as const,
          id: s.id,
          thumb: s.poster_url ?? null,
          caption: s.caption ?? null,
        })),
      ]);
    })();

    return () => {
      dropped = true;
    };
  }, [open, supabase]);

  return (
    <BottomSheet open={open} onClose={onClose} title="Embed something of yours" size="tall">
      <div className="px-4 pb-4">
        {mine === null && <p className="py-10 text-center text-sm text-muted">Finding them…</p>}
        {mine !== null && mine.length === 0 && (
          <EmptyState
            icon={ImageIcon}
            title="Nothing to embed yet"
            text="Post something or shoot a Shot, then it can go on a Show."
          />
        )}
        {mine !== null && mine.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {mine.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => {
                  onPick(item);
                  onClose();
                }}
                className="relative aspect-square overflow-hidden rounded-xl bg-surface transition active:scale-95"
              >
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted">
                    {item.kind === "shot" ? <Film size={20} /> : <ImageIcon size={20} />}
                  </span>
                )}
                {item.kind === "shot" && (
                  <span className="absolute right-1.5 top-1.5 rounded-pill bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Shot
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

/** The two icons the tray borrows for the widgets that have no picker of their own. */
export const WIDGET_ICONS = { link: Link2, question: MessageCircleQuestion } as const;
