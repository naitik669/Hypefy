"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, FileText, Pin as PinIcon, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ChatImg, ChatVideo } from "@/components/messages/ChatMedia";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { resamplePeaks } from "@/lib/voice-peaks";
import {
  MAX_PINNED_MESSAGES,
  PIN_SELECT,
  fileSize,
  pinWhen,
  toPins,
  type Pin,
  type PinRow,
} from "@/lib/chat-pins";

/**
 * The pin board: a chat's noticeboard, one card per pinned message.
 *
 * Cards hang on the side the message was sent from — yours on the right,
 * everyone else's on the left — so the board reads with the same left/right
 * grammar as the thread it came out of, and you can see whose line you kept
 * without reading a name.
 *
 * Each card hangs from a pin at its outer top corner and leans a degree or
 * two, the lean taken from the message id so it never shifts between
 * renders or between phones. A string runs from each pin to the next in the
 * order things were pinned, which is the order the board is in, and it sags
 * between them rather than running straight — a straight hairline reads as a
 * stray border, a sagging one reads as string.
 *
 * Tapping a card goes to the message in the thread, where the photo viewer,
 * the player and the replies already live: the board is an index of the
 * chat, not a second copy of it. Tapping the pin pulls it out, and the card
 * drops rather than disappearing.
 */

/**
 * Where a pin sits across the board, as a percentage of the column's width.
 *
 * The pin is a fixed inset from the card's outer edge and the card spans the
 * column, so this is that offset over a phone's column width. Approximate on
 * purpose: it places the ends of a piece of string, and keeping it a constant
 * means the string needs no layout measurement.
 */
const PIN_X = 6;
/** How far the string dips between two pins, in the same percentage units. */
const SAG = 34;

/** The string from one pin to the next. */
function Thread({ from, to, short = false }: { from: "left" | "right"; to: "left" | "right"; short?: boolean }) {
  const x = (s: "left" | "right") => (s === "left" ? PIN_X : 100 - PIN_X);
  const [x1, x2] = [x(from), x(to)];
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`block w-full text-accent/30 ${short ? "h-5" : "h-8"}`}
      aria-hidden
    >
      {/* Solid, because the box is stretched to the column's width and that
          would smear a dash pattern out of shape; non-scaling-stroke keeps it
          a hairline through the same stretch. The control point sits below
          the span, which is what puts the dip in it. */}
      <path
        d={`M ${x1} 0 Q ${(x1 + x2) / 2} ${100 + SAG} ${x2} 100`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * A pin, seen slightly from above: a lime head with its light catching the
 * top left, and a short stem going into the card under it.
 */
function PinHead({ side }: { side: "left" | "right" }) {
  return (
    <span className="relative block h-3 w-3" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-accent shadow-[0_2px_5px_rgba(0,0,0,0.6)]" />
      <span className="absolute left-[2px] top-[2px] h-1 w-1 rounded-full bg-white/60" />
      <span
        className={`absolute top-[9px] h-2 w-px bg-accent/50 ${side === "left" ? "left-1.5" : "right-1.5"}`}
      />
    </span>
  );
}

/** The static shape of a voice note, from the loudness recorded with it. */
const BARS = 24;

function Waveform({ peaks }: { peaks: number[] | null }) {
  const heights = peaks?.length
    ? resamplePeaks(peaks, BARS)
    : // No shape was recorded with this one. A flat, quiet row says "a voice
      // note" without pretending to be its waveform.
      Array.from({ length: BARS }, () => 20);
  return (
    <div className="flex h-7 items-center gap-[3px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-accent"
          style={{ height: `${Math.max(12, Math.min(100, h))}%` }}
        />
      ))}
    </div>
  );
}

/** A photo or a video sits in a well, so the card reads as a mount around it. */
function Well({ children, square = false }: { children: React.ReactNode; square?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-background ring-1 ring-inset ring-black/50 ${
        square ? "aspect-square" : "aspect-[4/3]"
      }`}
    >
      {children}
    </div>
  );
}

function CardBody({ pin }: { pin: Pin }) {
  const c = pin.card;
  if (c.shape === "photo") {
    return (
      <Well>
        {c.motion ? (
          <ChatVideo
            url={c.url}
            fragment="#t=0.1"
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : (
          <ChatImg url={c.url} alt="" className="h-full w-full object-cover" />
        )}
        {c.motion && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/15">
              <Play size={15} className="translate-x-px fill-white text-white" />
            </span>
          </span>
        )}
        {c.more > 0 && (
          <span className="absolute bottom-2 right-2 rounded-pill bg-black/70 px-2 py-0.5 text-[11px] font-bold text-white ring-1 ring-white/10">
            +{c.more}
          </span>
        )}
      </Well>
    );
  }
  if (c.shape === "note") {
    return (
      <p className="line-clamp-6 whitespace-pre-wrap break-words px-0.5 text-[13.5px] leading-[1.55] text-foreground">
        {c.text}
      </p>
    );
  }
  if (c.shape === "voice") {
    return (
      <div className="flex items-center gap-2.5 px-0.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/25">
          <Play size={13} className="translate-x-px fill-accent text-accent" />
        </span>
        <Waveform peaks={c.peaks} />
      </div>
    );
  }
  if (c.shape === "share") {
    return (
      <Well square>
        {c.thumb || c.video ? (
          c.video ? (
            <ChatVideo url={c.video} fragment="#t=0.1" muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            <ChatImg url={c.thumb} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          // The post or Shot is gone, or can no longer be seen. Said plainly,
          // because a blank tile reads as a failed image.
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted">
            No longer available
          </p>
        )}
        {c.username && (
          <span className="absolute bottom-2 left-2 rounded-pill bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white ring-1 ring-white/10">
            @{c.username}
          </span>
        )}
      </Well>
    );
  }
  if (c.shape === "track") {
    return (
      <div className="flex items-center gap-2.5 px-0.5">
        {c.track.artwork ? (
          <ChatImg url={c.track.artwork} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-inset ring-black/40" />
        ) : (
          <span className="h-11 w-11 shrink-0 rounded-lg bg-background" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold">{c.track.title}</p>
          {c.track.artist && <p className="truncate text-xs text-muted">{c.track.artist}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 px-0.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 ring-1 ring-accent/25">
        <FileText size={17} className="text-accent" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold">{c.name}</p>
        {fileSize(c.size) && <p className="text-xs text-muted">{fileSize(c.size)}</p>}
      </div>
    </div>
  );
}

/**
 * How wide a card is, as a share of the column.
 *
 * Not one width for everything: a line of text in a 74% box is mostly empty
 * box, and a column of identically sized rectangles reads as a form rather
 * than a board. Media earns the room; words take what they need.
 */
function cardWidth(pin: Pin): string {
  switch (pin.card.shape) {
    case "photo":
    case "share":
      return "74%";
    case "note":
      return pin.card.text.length > 60 ? "72%" : "62%";
    default:
      return "68%";
  }
}

function PinCard({
  pin,
  index,
  falling,
  senderName,
  pinnerName,
  onOpen,
  onUnpin,
}: {
  pin: Pin;
  index: number;
  falling: boolean;
  senderName: string | null;
  pinnerName: string | null;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  const right = pin.side === "right";
  // Two tones rather than one grey line: the kind of thing it is in lime,
  // and who and when behind it. One flat caption was the sloppiest part of
  // the first board — it read as a filename.
  const rest = [senderName, pinnerName && `pinned by ${pinnerName}`, pinWhen(pin.at)].filter(Boolean).join(" · ");
  return (
    <div className={`flex ${right ? "justify-end" : "justify-start"}`}>
      <div
        className={`pin-card relative ${falling ? "animate-pin-drop" : "animate-pin-up"}`}
        style={{
          width: cardWidth(pin),
          // The lean is a variable because the keyframes have to end on it;
          // see .pin-card in globals.css.
          ["--tilt" as string]: `${pin.tilt}deg`,
          // Staggered, so the board goes up pin by pin instead of all at once.
          animationDelay: falling ? undefined : `${Math.min(index, 8) * 45}ms`,
        }}
      >
        <button
          type="button"
          onClick={onOpen}
          className="block w-full rounded-2xl border border-border bg-elevated p-2.5 text-left shadow-[0_12px_28px_-10px_rgba(0,0,0,0.85)] transition-transform active:scale-[0.97]"
        >
          <CardBody pin={pin} />
          <p className="mt-2.5 flex items-baseline gap-1.5 truncate border-t border-border/70 pt-2 text-[10px] font-bold uppercase tracking-[0.14em]">
            <span className="shrink-0 text-accent">{pin.label}</span>
            {rest && <span className="truncate text-faint">· {rest}</span>}
          </p>
        </button>
        {/* The pin is the unpin button: pulling it out is what takes the card
            down. 36px of hit area around a 12px head, centred on the head so
            the string still meets it. */}
        <button
          type="button"
          onClick={onUnpin}
          aria-label="Unpin"
          className="absolute flex h-9 w-9 items-center justify-center"
          style={{ top: -18, ...(right ? { right: -2 } : { left: -2 }) }}
        >
          <PinHead side={pin.side} />
        </button>
      </div>
    </div>
  );
}

/** Nothing pinned: one bare pin with nothing hanging off it. */
function EmptyBoard() {
  return (
    <div className="animate-rise flex flex-col items-center px-10 pt-16 text-center">
      <span className="h-3 w-3 rounded-full bg-accent/70 shadow-[0_2px_5px_rgba(0,0,0,0.6)]" />
      <span className="h-14 w-px bg-accent/20" />
      <p className="mt-3 text-[15px] font-bold">The board is empty</p>
      <p className="mt-1.5 max-w-[16rem] text-[13px] leading-relaxed text-muted">
        Hold anything in the chat — a photo, a voice note, that one message — and pin it here.
      </p>
    </div>
  );
}

export function PinBoard({
  conversationId,
  me,
  people,
  isGroup,
  onOpenMessage,
  onBack,
}: {
  conversationId: string;
  me: string;
  /** Everyone in the chat, for the name on a group's cards. */
  people: Record<string, { name: string }>;
  isGroup: boolean;
  /**
   * Go to a pinned message. The pane hands in a function that closes the
   * board and reaches the message in the thread behind it; without one the
   * board navigates, for the times it is a screen of its own.
   */
  onOpenMessage?: (messageId: string) => void;
  /** Shown as a back chevron when the board is a pane rather than a route. */
  onBack?: () => void;
}) {
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [falling, setFalling] = useState<string[]>([]);
  const toast = useToast();
  const supabase = useMemo(() => createClient(), []);
  /** The drop finishes after the request does, so the timer can outlive the pane. */
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Read when opened rather than handed down: the board is a pane of the
  // chat, which is already rendered by the time anyone asks for it.
  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select(PIN_SELECT)
        .eq("conversation_id", conversationId)
        .not("pinned_at", "is", null)
        .eq("is_unsent", false)
        .is("removed_at", null)
        .order("pinned_at", { ascending: false })
        .limit(MAX_PINNED_MESSAGES);
      if (live) setPins(toPins((data ?? []) as unknown as PinRow[], me));
    })();
    return () => {
      live = false;
    };
  }, [supabase, conversationId, me]);

  async function unpin(id: string) {
    haptics.select();
    const before = pins ?? [];
    // Let it fall before it goes, rather than blinking out from under the
    // finger that just pulled its pin.
    setFalling((f) => [...f, id]);
    const { error } = await supabase.rpc("set_message_pinned", { p_id: id, p_pinned: false });
    if (error) {
      // The board has to show what is actually pinned, or the next person to
      // open it sees something different.
      setFalling((f) => f.filter((x) => x !== id));
      setPins(before);
      toast("Couldn't unpin that");
      return;
    }
    setTimeout(() => {
      if (!live.current) return;
      setPins((p) => (p ?? []).filter((x) => x.id !== id));
      setFalling((f) => f.filter((x) => x !== id));
    }, 240);
  }

  const count = pins?.length ?? 0;

  return (
    <div className="pin-board relative flex h-full flex-col bg-background">
      {/* The board's own ground: a faint light from above and a grid, so it
          reads as somewhere else rather than the chat with the messages
          taken out. */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(120% 60% at 50% -10%, rgba(163,230,53,0.07), transparent 60%), repeating-linear-gradient(0deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(255,255,255,0.016) 0 1px, transparent 1px 22px)",
        }}
      />

      <header
        className="relative z-10 flex shrink-0 items-center gap-2 px-2 pb-2.5"
        style={{ paddingTop: "calc(var(--sat) + 0.625rem)" }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the chat"
            className="-ml-0.5 flex h-9 w-9 items-center justify-center rounded-full text-foreground active:scale-90"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <h1 className={`text-[17px] font-extrabold -tracking-tight ${onBack ? "" : "pl-2"}`}>Pinned</h1>
        {count > 0 && (
          <span className="ml-auto mr-2 flex items-center gap-1.5 rounded-pill bg-accent/12 px-2.5 py-1 text-[11px] font-bold text-accent ring-1 ring-accent/20">
            <PinIcon size={11} />
            {/* The cap only earns a mention once it is close enough to matter. */}
            {count >= MAX_PINNED_MESSAGES - 4 ? `${count} / ${MAX_PINNED_MESSAGES}` : count}
          </span>
        )}
      </header>

      {/* The rail the first pin hangs from, which is what ties the board to
          its own header instead of leaving the top card floating. */}
      <div className="relative z-10 h-px shrink-0 bg-border" />

      <div
        data-pin-scroll
        className="relative z-10 flex-1 overflow-y-auto overscroll-contain px-4 pb-28 pt-1"
      >
        {pins === null ? (
          <div className="flex justify-center pt-10">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        ) : pins.length === 0 ? (
          <EmptyBoard />
        ) : (
          pins.map((pin, i) => (
            <div key={pin.id}>
              {/* The first card hangs off the rail under the header, so the
                  board starts at something rather than in mid-air. */}
              {i === 0 && <Thread short from={pin.side} to={pin.side} />}
              <PinCard
                pin={pin}
                index={i}
                falling={falling.includes(pin.id)}
                senderName={isGroup && !pin.mine ? (people[pin.senderId]?.name ?? "User") : null}
                pinnerName={
                  isGroup && pin.pinnedBy && pin.pinnedBy !== pin.senderId
                    ? pin.pinnedBy === me
                      ? "you"
                      : (people[pin.pinnedBy]?.name ?? "someone")
                    : null
                }
                onOpen={() => onOpenMessage?.(pin.id)}
                onUnpin={() => void unpin(pin.id)}
              />
              {i < pins.length - 1 && <Thread from={pin.side} to={pins[i + 1].side} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
