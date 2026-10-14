"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Music, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { loadSeen, pageText, storyOrder, unseen, type DiaryEntry } from "@/lib/diary";
import { NoteEditorSheet, type MyNote } from "@/components/notes/NoteEditorSheet";
import { ThoughtDots } from "@/components/diary/ThoughtBubble";

/** The face. */
const FACE = 64;
/**
 * The cell, which is wider than the face.
 *
 * The bubble takes the cell's full width while the face stays centred in it,
 * so a page gets a few more words before it has to trail off. At the face's
 * own width most pages read "bored out of…", which is not worth a row.
 */
const CELL = 90;
/**
 * The thought itself, narrower than the cell and pushed to its right edge.
 *
 * The margin that leaves is where the dots fall. At full width there was
 * nowhere for them to go: squeezed between the bubble and the face they
 * came out as two specks, and the thought stopped reading as a thought.
 */
const BUBBLE = 78;
/**
 * How far the thought sits over the face.
 *
 * Its words never enter that band — the overlap is padding — so nothing is
 * cut off by the picture's top edge. The dots fall down the cell's left
 * margin rather than across the face: a dark dot on a bright avatar reads
 * as a hole punched in it, and the margin is the one place they stay the
 * bubble's own colour.
 */
const OVERLAP = 11;

/**
 * Today's UpDates: a row of faces, each with what they wrote over it.
 *
 * The same rows Spotlight calls pages — one per person, gone in 24 hours —
 * under the name they go by in Messages. Spotlight is somewhere you go to
 * read; this is a line across the top of your chats saying what the people
 * you talk to are up to, so it is named for that and not for the table.
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

  const serverMine = pages.find((p) => p.isSelf) ?? null;
  const others = useMemo(() => storyOrder(pages, fresh), [pages, fresh]);

  /**
   * Yours is written in a popup over this row, never by leaving for
   * Spotlight. Writing an UpDate and reading other people's are different
   * acts, and sending someone to another screen to do the first was what
   * made the two feel like one feature.
   */
  const [composing, setComposing] = useState(false);
  /**
   * What the save said, until the server catches up.
   *
   * `undefined` means "nothing written this session, use the server's".
   * null is a real value — it is how a cleared UpDate is held — so the two
   * cannot share one slot.
   */
  const [justSaved, setJustSaved] = useState<MyNote | undefined>(undefined);

  const current: MyNote =
    justSaved !== undefined
      ? justSaved
      : serverMine
        ? { text: serverMine.text, audience: serverMine.audience, track: serverMine.track }
        : null;

  // The row draws from the save the moment it lands, so the bubble changes
  // under your thumb rather than after a round trip.
  const mine: DiaryEntry | null = current
    ? {
        ...(serverMine ?? {
          userId: "me",
          isSelf: true,
          name: me?.name ?? "You",
          username: null,
          hue: me?.hue ?? 280,
          avatarUrl: me?.avatarUrl ?? null,
          createdAt: new Date().toISOString(),
          color: null,
          imageUrl: null,
        }),
        text: current.text,
        audience: current.audience,
        track: current.track,
      }
    : null;

  return (
    <div className="no-scrollbar animate-strip-in flex gap-4 overflow-x-auto px-4 pb-1.5 pt-3">
      {mine ? (
        <Cell page={mine} label="You" onPress={() => setComposing(true)} />
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          aria-label="Write your UpDate"
          className="group flex shrink-0 flex-col items-end transition-transform active:scale-95"
          style={{ width: CELL }}
        >
          <Bubble faint>add yours…</Bubble>
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
            <span className="absolute -bottom-0.5 -right-0.5 flex h-[21px] w-[21px] items-center justify-center rounded-full bg-accent text-accent-ink ring-2 ring-background">
              <Plus size={14} strokeWidth={3.2} />
            </span>
            <ThoughtDots faint />
          </span>
          <span className="mt-1.5 truncate text-center text-[11px] font-semibold text-muted" style={{ width: FACE }}>You</span>
        </button>
      )}

      {others.map((p) => (
        <Cell key={p.userId} page={p} />
      ))}

      <NoteEditorSheet
        open={composing}
        onClose={() => setComposing(false)}
        current={current}
        onSaved={setJustSaved}
        me={me}
        title="Your UpDate"
        subtitle="everyone you talk to sees it for 24 hours"
        noun="UpDate"
      />
    </div>
  );
}

function Cell({
  page,
  label,
  /** Yours: opens the composer here instead of leaving for Spotlight. */
  onPress,
}: {
  page: DiaryEntry;
  label?: string;
  onPress?: () => void;
}) {
  const name = label ?? page.name.split(" ")[0];
  const body = (
    <>
      <Bubble track={!!page.track}>{pageText(page.text)}</Bubble>
      <span className="relative mr-[3px]">
        <Avatar name={page.name} hue={page.hue} src={page.avatarUrl ?? undefined} size={FACE} />
        <ThoughtDots />
      </span>
      <span className="mt-1.5 truncate text-center text-[11px] font-semibold text-muted" style={{ width: FACE }}>{name}</span>
    </>
  );
  const shell = "flex shrink-0 flex-col items-end transition-transform active:scale-95";
  const label_ = `${label ? "Your UpDate" : `${page.name}'s UpDate`}: ${pageText(page.text)}`;

  return onPress ? (
    <button type="button" onClick={onPress} aria-label={`${label_}. Edit`} className={shell} style={{ width: CELL }}>
      {body}
    </button>
  ) : (
    <Link
      href={`/messages/spotlight?page=${encodeURIComponent(page.userId)}`}
      aria-label={label_}
      className={shell}
      style={{ width: CELL }}
    >
      {body}
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
      className={`relative z-10 ml-auto rounded-[15px] pt-2 pl-2 text-center text-[11px] font-semibold leading-[1.25] ${
        track ? "pr-4" : "pr-2"
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
      {track && <Music size={9} className="absolute right-1.5 top-2 text-accent" aria-hidden />}
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
      aria-label={`${count} new ${count === 1 ? "UpDate" : "UpDates"}. ${open ? "Hide" : "Show"}`}
      data-pages-trigger
      className="ml-auto flex shrink-0 items-center gap-1 self-center pl-2 pr-1 text-xs font-bold text-muted transition-colors active:text-accent"
    >
      <span className={open ? "text-accent" : ""}>UpDates</span>
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
