"use client";

import { Star, MessageCircle, Bookmark, ImageIcon } from "lucide-react";
import { Plane } from "@/components/ui/Plane";
import { Avatar } from "@/components/ui/Avatar";
import { RichPostText } from "@/components/ui/RichPostText";
import { TrackChip } from "@/components/music/TrackChip";
import type { Track } from "@/lib/music";

export type PreviewAuthor = {
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

/**
 * Live preview of the post being composed, drawn to match FeedCard rather
 * than invented: the caption runs inline after the @name and the body sits
 * under it dimmed, which is the one thing the composer's two text boxes
 * could never show on their own.
 *
 * The image frame uses the same `aspect-ratio` the post will be stored with,
 * so choosing a shape is visibly a decision about the feed and not about the
 * composer's own thumbnails.
 *
 * Counts are shown as em-dashes, not zeroes — a fake "0 hypes" reads as a
 * real number, and this is a preview of layout, not of engagement.
 */
export function PostPreview({
  author,
  imageUrls,
  aspect,
  caption,
  body,
  track,
  pollOptions,
}: {
  author: PreviewAuthor;
  imageUrls: string[];
  aspect: number;
  caption: string;
  body: string;
  track: Track | null;
  pollOptions: string[] | null;
}) {
  const handle = author.username ? `@${author.username}` : author.name;
  const polls = (pollOptions ?? []).map((o) => o.trim()).filter(Boolean);
  const empty = !imageUrls.length && !caption.trim() && !body.trim() && !track && polls.length < 2;

  return (
    <section aria-label="Post preview" className="overflow-hidden rounded-2xl border border-border bg-surface">
      <p className="border-b border-border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-faint">
        Preview
      </p>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-8 text-center">
          <ImageIcon size={20} className="text-faint" />
          <p className="text-xs text-muted">Your post shows up here as you build it.</p>
        </div>
      ) : (
        <div className="pb-2.5">
          {/* author row */}
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Avatar name={author.name} hue={author.hue} size={30} src={author.avatarUrl ?? undefined} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{author.name}</span>
            <span className="text-[11px] text-faint">now</span>
          </div>

          {/* Only the first image — the preview answers "what shape is this",
              and a working carousel here would be a second gallery to keep in
              sync with the one below it. */}
          {imageUrls.length > 0 && (
            <div className="relative mx-3 overflow-hidden rounded-xl bg-elevated">
              <div className="relative w-full" style={{ aspectRatio: String(aspect) }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrls[0]} alt="" className="h-full w-full object-cover" />
              </div>
              {imageUrls.length > 1 && (
                <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
                  1/{imageUrls.length}
                </span>
              )}
            </div>
          )}

          {/* action rail — inert, purely to place the text correctly below it */}
          <div aria-hidden className="flex items-center gap-3 px-3 pt-2.5 text-faint">
            <Star size={16} />
            <MessageCircle size={16} />
            <Plane size={16} weight="bold" />
            <span className="flex-1" />
            <Bookmark size={16} />
          </div>

          {(caption.trim() || body.trim()) && (
            <div className="px-3 pt-1.5 text-sm leading-snug">
              {caption.trim() && (
                <p>
                  <span className="font-semibold">{handle}</span>{" "}
                  <RichPostText text={caption} />
                </p>
              )}
              {body.trim() && (
                <p className="mt-1 text-foreground/85">
                  <RichPostText text={body} />
                </p>
              )}
            </div>
          )}

          {polls.length >= 2 && (
            <div className="mt-2 flex flex-col gap-1.5 px-3">
              {polls.slice(0, 4).map((o, i) => (
                <div key={i} className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground">
                  {o}
                </div>
              ))}
            </div>
          )}

          {track && (
            <div className="mt-2 px-3">
              <TrackChip track={track} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
