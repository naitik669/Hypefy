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
const CELL = 74;
/**
 * The thought itself, narrower than the cell and pushed to its right edge.
 *
 * The margin that leaves is where the dots fall. At full width there was
 * nowhere for them to go: squeezed between the bubble and the face they
 * came out as two specks, and the thought stopped reading as a thought.
 */
const BUBBLE = 64;
/**
 * How far the thought sits over the face.
 *
 * Its words never enter that band — the overlap is padding — so nothing is
 * cut off by the picture's top edge. The dots fall down the cell's left
 * margin rather than across the face: a dark dot on a bright avatar reads
 * as a hole punched in it, and the margin is the one place they stay the
 * bubble's own colour.
 */
const OVERLAP = 9;

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
export function PagesStrip({
  pages,
  me,
}: {
  pages: DiaryEntry[];
  /** You, for the slot that invites you to write when you have no page. */
  me?: { name: string; hue: number; avatarUrl: string | null };
}) {
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
    <div className="no-scrollbar animate-strip-in flex gap-3.5 overflow-x-auto px-4 pb-1 pt-2.5">
      {mine ? (
        <Cell page={mine} label="You" />
      ) : (
        <Link
          href="/messages/spotlight"
          aria-label="Write your page"
          className="group flex shrink-0 flex-col items-end transition-transform active:scale-95"
          style={{ width: CELL }}
        >
          <Bubble faint>add a page…</Bubble>
          {/* Your own face, not an empty tile. A dashed square the size of a
              person said "something is missing here"; your face with a plus
              on its corner says the row is already yours to write in. */}
          <span className="relative mr-[3px]">
            {me ? (
              <Avatar name={me.name} hue={me.hue} src={me.avatarUrl ?? undefined} size={FACE} />
            ) : (
              <span
                className="flex items-center justify-center rounded-[30%] bg-surface text-faint"
                style={{ width: FACE, height: FACE }}
              >
                <Plus size={18} strokeWidth={2.4} />
              </span>
            )}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-accent-ink ring-2 ring-background">
              <Plus size={12} strokeWidth={3.2} />
            </span>
            <Dots faint />
          </span>
          <span className="mt-1 truncate text-center text-[10px] font-semibold text-muted" style={{ width: FACE }}>You</span>
        </Link>
      )}

      {others.map((p) => (
        <Cell key={p.userId} page={p} />
      ))}
    </div>
  );
}

function Cell({ page, label }: { page: DiaryEntry; label?: string }) {
  const name = label ?? page.name.split(" ")[0];
  return (
    <Link
      href={`/messages/spotlight?page=${encodeURIComponent(page.userId)}`}
      aria-label={`${label ? "Your page" : `${page.name}'s page`}: ${pageText(page.text)}`}
      className="flex shrink-0 flex-col items-end transition-transform active:scale-95"
      style={{ width: CELL }}
    >
      <Bubble track={!!page.track}>{pageText(page.text)}</Bubble>
      <span className="relative mr-[3px]">
        <Avatar name={page.name} hue={page.hue} src={page.avatarUrl ?? undefined} size={FACE} />
        <Dots />
      </span>
      <span className="mt-1 truncate text-center text-[10px] font-semibold text-muted" style={{ width: FACE }}>{name}</span>
    </Link>
  );
}

/**
 * What they wrote, as a thought over their face.
 *
 * A thought, not speech: no point, no border, no shadow — just the words on
 * a solid slab, with two shrinking dots below carrying it down to whoever
 * thought it. Two lines at most, since a page is a glance and the whole of
 * it is one tap away on Spotlight.
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
      // z-10 so it sits in front of the face, which follows it in the DOM.
      className={`relative z-10 ml-auto rounded-[13px] pt-1.5 pl-1.5 text-center text-[9.5px] font-semibold leading-[1.25] ${
        track ? "pr-3.5" : "pr-1.5"
      } ${faint ? "bg-surface text-faint" : "bg-elevated text-foreground/90"}`}
      // The band that covers the picture is padding, never words.
      style={{ width: BUBBLE, marginBottom: -OVERLAP, paddingBottom: OVERLAP + 3 }}
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
    </span>
  );
}

/**
 * The two dots rising from the face to the thought above it.
 *
 * They are a chain, not decoration: the small one rests on the picture's
 * rim, the large one tucks under the bubble's bottom corner, and each
 * overlaps the next. Spaced apart instead, they read as two dots hanging
 * in the air beside someone rather than a thought coming out of them,
 * which is the whole job of a thought bubble's tail.
 *
 * Both sit in the margin left of the picture, in the bubble's own colour.
 * On the face itself a dark dot needs an outline to survive the colours
 * underneath, and an outlined dark dot on a bright avatar reads as a hole.
 */
function Dots({ faint = false }: { faint?: boolean }) {
  const fill = faint ? "bg-surface" : "bg-elevated";
  return (
    <span aria-hidden>
      {/* Tucked under the bubble's bottom-left corner, which sits OVERLAP
          below the top of the picture. */}
      <span className={`absolute -left-[9px] top-[7px] h-[8px] w-[8px] rounded-full ${fill}`} />
      {/* Overlapping the one above it and resting on the picture's rim. */}
      <span className={`absolute -left-[3px] top-[14px] h-[5px] w-[5px] rounded-full ${fill}`} />
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
