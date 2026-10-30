"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isVideoUrl } from "@/lib/video-mime";
import { BLANK_POSTER } from "@/lib/blank-poster";

/**
 * The Show a message answers, drawn small above it.
 *
 * Read live by id: a Show that has expired or been deleted, or one this
 * reader cannot see, says so instead of showing a copy kept for ever.
 */
export function ShowReplyCard({ showId, mine }: { showId: string; mine: boolean }) {
  const [supabase] = useState(createClient);
  const [show, setShow] = useState<{ media: string | null } | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void supabase
      .from("shows")
      .select("media_url")
      .eq("id", showId)
      .maybeSingle()
      .then(({ data }) => {
        if (live) setShow(data ? { media: data.media_url ?? null } : null);
      });
    return () => {
      live = false;
    };
  }, [supabase, showId]);

  const label = mine ? "You replied to their Show" : "Replied to your Show";
  const thumb =
    show && show.media ? (
      isVideoUrl(show.media) ? (
        <video src={show.media} poster={BLANK_POSTER} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={show.media} alt="" className="h-full w-full object-cover" />
      )
    ) : null;

  return (
    <span className={`mb-1 flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`} data-show-reply>
      <span className="px-1 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
      {show ? (
        <Link
          href={`/shows/${showId}`}
          aria-label="Open the Show"
          className="block h-[96px] w-[64px] overflow-hidden rounded-[14px] border border-white/15 bg-surface"
        >
          {thumb}
        </Link>
      ) : show === null ? (
        <span className="rounded-[12px] bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-muted">This Show has ended</span>
      ) : (
        <span aria-hidden className="block h-[96px] w-[64px] rounded-[14px] bg-white/5" />
      )}
    </span>
  );
}
