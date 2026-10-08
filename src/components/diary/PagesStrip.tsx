"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Music, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { loadSeen, pageText, storyOrder, unseen, type DiaryEntry } from "@/lib/diary";

/** The face. */
const FACE = 52;
/**
 * The cell, which is wider than the face.
 *
 * The bubble takes the cell's full width while the face stays centred in it,
 * so a page gets a few more words before it has to trail off. At the face's
 * own width most pages read "bored out of…", which is not worth a row.
 */
const CELL = 66;
/**
 * How far the bubble sits over the face.
 *
 * It used to float clear above it, which read as a label printed over
 * someone rather than something they said. Dropping it until its lower edge
 * and tail cross the top of the picture is what makes it theirs.
 */
const OVERLAP = 10;

/**
 * Today's pages as a row of faces, each with what they wrote over it.
 *
 * The same rows the Spotlight deck shuffles through, laid out flat: at a
 * glance you see who has written something and roughly what, rather than
 * one card at a time. Yours comes first, as get_notes() already returns it,
 * and when you have not written one the slot invites you to.
 *
 * Anyone whose page you have not read yet keeps a lime ring, and they sort
 * to the front — the same rule the deck uses, through the same helpers, so
 * the two surfaces never disagree about who is new.
 */
export function PagesStrip({ pages }: { pages: DiaryEntry[] }) {
  // What you have not opened lives on this device, so it is read after
  // mount — the same way the deck reads it, so the two can never disagree
  // about who is new. The server draws the newest first and the order
  // settles here.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage; see above
    setFresh(new Set(unseen(pages, loadSeen()).map((e) => e.userId)));
  }, [pages]);

  const mine = pages.find((p) => p.isSelf) ?? null;
  const others = useMemo(() => storyOrder(pages, fresh), [pages, fresh]);

  return (
    <div className="no-scrollbar animate-strip-in flex gap-3.5 overflow-x-auto px-4 pb-1 pt-2">
      {mine ? (
        <Cell page={mine} label="You" />
      ) : (
        <Link
          href="/messages/spotlight"
          aria-label="Write your page"
          className="group flex shrink-0 flex-col items-center transition-transform active:scale-95"
          style={{ width: CELL }}
        >
          <Bubble faint>add a page…</Bubble>
          <span
            className="relative flex items-center justify-center rounded-[30%] border border-dashed border-border bg-surface text-faint"
            style={{ width: FACE, height: FACE }}
          >
            <Plus size={18} strokeWidth={2.4} />
          </span>
          <span className="mt-1 w-full truncate text-center text-[10px] font-semibold text-muted">You</span>
        </Link>
      )}

      {others.map((p) => (
        <Cell key={p.userId} page={p} fresh={fresh.has(p.userId)} />
      ))}
    </div>
  );
}

function Cell({ page, fresh = false, label }: { page: DiaryEntry; fresh?: boolean; label?: string }) {
  const name = label ?? page.name.split(" ")[0];
  return (
    <Link
      href={`/messages/spotlight?page=${encodeURIComponent(page.userId)}`}
      aria-label={`${label ? "Your page" : `${page.name}'s page`}: ${pageText(page.text)}`}
      className="flex shrink-0 flex-col items-center transition-transform active:scale-95"
      style={{ width: CELL }}
    >
      <Bubble track={!!page.track}>{pageText(page.text)}</Bubble>
      <span
        // Unread keeps a ring, with a gap between it and the picture so it
        // reads as a ring rather than a border the avatar grew.
        className={`relative rounded-[34%] ${fresh ? "p-[2px] ring-[1.5px] ring-accent" : ""}`}
      >
        <Avatar name={page.name} hue={page.hue} src={page.avatarUrl ?? undefined} size={FACE} />
      </span>
      <span className="mt-1 w-full truncate text-center text-[10px] font-semibold text-muted">{name}</span>
    </Link>
  );
}

/**
 * What they wrote, in a bubble over their face.
 *
 * No border and no shadow: the tail is a child painted in the bubble's own
 * colour, so the two read as one shape with no seam where the point meets
 * the body. Two lines at most — a page is a glance, and the whole of it is
 * one tap away on Spotlight.
 */
function Bubble({
  children,
  faint = false,
  track = false,
}: {
  children: React.ReactNode;
  faint?: boolean;
  track?: boolean;
}) {
  return (
    <span
      // Over the picture, not above it: z-10 puts it in front of the face,
      // which comes after it in the DOM.
      // ring-background is a knockout, not decoration: the tail crosses the
      // unread ring below, and without a gap in the ring's own colour the
      // ring looks sliced rather than interrupted.
      className={`relative z-10 w-full rounded-[11px] py-1 pl-1.5 text-center text-[9.5px] font-semibold leading-[1.25] ring-2 ring-background ${
        track ? "pr-3.5" : "pr-1.5"
      } ${faint ? "bg-surface text-faint" : "bg-elevated text-foreground/90"}`}
      // The overlap is padding, never text: the bottom of the bubble sits
      // over the face, and a second line running into it was being cut off
      // by the picture's top edge.
      style={{ marginBottom: -OVERLAP, paddingBottom: OVERLAP + 3 }}
    >
      {/* Always two lines tall, even for a page of two words. A bubble that
          shrank to its content made its whole cell shorter, and that one
          name sat higher than every other name in the row.

          The song mark sits in the corner, with padding keeping the words
          out of it — it is positioned, so it never changes the height. */}
      <span className="line-clamp-2 break-words" style={{ minHeight: "2.5em" }}>
        {children}
      </span>
      {/* In the corner, with room kept for it by the padding above. Inline
          after the words, a long page clamped the mark away with them. */}
      {track && <Music size={8} className="absolute right-1 top-1.5 text-accent" aria-hidden />}
      <span
        aria-hidden
        className={`absolute -bottom-[3px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] ring-2 ring-background ${
          faint ? "bg-surface" : "bg-elevated"
        }`}
      />
    </span>
  );
}

/**
 * The arrow that opens the strip, at the end of the filter row.
 *
 * It says how many pages are waiting rather than just "Pages", because the
 * strip is worth opening only when someone has written something — and with
 * nothing there at all it is not drawn.
 */
export function PagesTrigger({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${count} ${count === 1 ? "page" : "pages"} today. ${open ? "Hide" : "Show"}`}
      data-pages-trigger
      className="ml-auto flex shrink-0 items-center gap-1 self-center pl-2 pr-1 text-xs font-bold text-muted transition-colors active:text-accent"
    >
      <span className={open ? "text-accent" : ""}>Pages</span>
      {count > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black text-accent-ink">
          {count}
        </span>
      )}
      <ChevronDown
        size={15}
        strokeWidth={3}
        aria-hidden
        className={`transition-transform duration-200 ${open ? "rotate-180 text-accent" : ""}`}
      />
    </button>
  );
}

/** Unread pages, for the number on the arrow. Exported for tests. */
export function freshCount(pages: DiaryEntry[], seen: Record<string, string>): number {
  return unseen(pages, seen).length;
}
