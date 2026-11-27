"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Mic, Music, Pin as PinIcon, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  bannerLine,
  bannerThumb,
  bannerTitle,
  loadBannerPins,
  pinBannerMode,
  type Pin,
} from "@/lib/chat-pins";

/**
 * The newest pin, shown when a chat opens, then folded into a tab.
 *
 * Opening state: a strip under the header (Naitik's reference). Folded: a
 * tab on the right edge, which is where the pin board slides in from, so
 * tapping it and swiping left reach the same place. Both lie over the
 * thread rather than in the flow, so folding never moves a message.
 *
 * Design: https://claude.ai/artifact/Wa8DxBn1KwkrhkjwYd7CL3 (B, with A's strip).
 */
export function PinBanner({
  conversationId,
  me,
  nameOf,
  folded,
  refreshKey,
  onOpen,
}: {
  conversationId: string;
  me: string;
  nameOf: (id: string) => string | null;
  folded: boolean;
  /** Changes when a pin may have been added or taken off, to read again. */
  refreshKey: string;
  onOpen: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [pins, setPins] = useState<Pin[]>([]);

  useEffect(() => {
    let live = true;
    void loadBannerPins(supabase as never, conversationId, me).then((p) => {
      if (live) setPins(p);
    });
    return () => {
      live = false;
    };
  }, [supabase, conversationId, me, refreshKey]);

  const mode = pinBannerMode(pins.length, folded);
  if (mode === "none") return null;
  const top = pins[0];

  if (mode === "tab") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Show pinned, ${pins.length}`}
        className="motion-safe:animate-[dm-slide-in_260ms_cubic-bezier(0.16,1,0.3,1)] absolute right-0 top-2 flex h-[52px] w-[46px] flex-col items-center justify-center gap-0.5 rounded-l-[14px] border border-r-0 border-border bg-elevated text-foreground shadow-lg"
      >
        <ChevronLeft size={16} strokeWidth={2.6} className="text-accent" aria-hidden />
        <span className="text-[11px] font-extrabold leading-none">{pins.length}</span>
      </button>
    );
  }

  const thumb = bannerThumb(top);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-border bg-elevated px-3.5 py-2.5 text-left text-foreground"
    >
      <PinIcon size={16} className="shrink-0 text-muted" aria-hidden />
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface text-muted">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- a 40px thumb from storage, as the board draws it
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <BannerGlyph pin={top} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-bold">{bannerTitle(top)}</span>
        <span className="truncate text-[11px] text-muted">{bannerLine(top, me, nameOf, pins.length)}</span>
      </span>
      <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-muted" aria-hidden />
    </button>
  );
}

/** For the pins with no picture of their own. */
function BannerGlyph({ pin }: { pin: Pin }) {
  switch (pin.card.shape) {
    case "voice":
      return <Mic size={18} aria-hidden />;
    case "track":
      return <Music size={18} aria-hidden />;
    case "file":
      return <FileText size={18} aria-hidden />;
    case "photo":
      // A video with no poster.
      return <Play size={18} aria-hidden />;
    default:
      return <PinIcon size={16} aria-hidden />;
  }
}
