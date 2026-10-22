"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pin as PinIcon, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ChatImg, ChatVideo } from "@/components/messages/ChatMedia";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import { resamplePeaks } from "@/lib/voice-peaks";
import { fileSize, pinWhen, type Pin } from "@/lib/chat-pins";

/**
 * The pin board: a chat's noticeboard, one card per pinned message.
 *
 * Cards hang on the side the message was sent from — yours on the right,
 * everyone else's on the left — so the board reads with the same left/right
 * grammar as the thread it came out of, and you can see whose line you kept
 * without reading a name.
 *
 * Each card leans a degree or two and hangs from a pin at its outer top
 * corner. The lean comes from the message id rather than from a random
 * number, so a card never shifts between renders or between phones. A thread
 * runs from each pin to the next in the order things were pinned, which is
 * the order the board is in.
 *
 * Tapping a card goes back to the message in the thread, where the photo
 * viewer, the player and the replies already live. The board is an index of
 * the chat, not a second copy of it. Tapping the pin pulls it out.
 */

/**
 * Where a pin sits across the board, as a percentage of the column's width.
 *
 * The pin is 12px in from the card's outer edge and the card spans the full
 * column, so this is that offset over a phone's column width. Approximate on
 * purpose: it positions a hairline nobody measures, and keeping it a constant
 * means the thread needs no layout measurement to draw.
 */
const PIN_X = 5;

/** The thread from one pin to the next. */
function Thread({ from, to }: { from: "left" | "right"; to: "left" | "right" }) {
  const x = (s: "left" | "right") => (s === "left" ? PIN_X : 100 - PIN_X);
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="block h-7 w-full text-accent/25"
      aria-hidden
    >
      {/* Solid rather than dashed: the box is stretched to the column's width,
          which would smear a dash pattern out of shape. non-scaling-stroke
          keeps it a hairline through the same stretch. */}
      <line
        x1={x(from)}
        y1="0"
        x2={x(to)}
        y2="100"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The static shape of a voice note, from the loudness recorded with it. */
const BARS = 22;

function Waveform({ peaks }: { peaks: number[] | null }) {
  const heights = peaks?.length
    ? resamplePeaks(peaks, BARS)
    : // No shape was recorded with this one. A flat, quiet row says "a voice
      // note" without pretending to be its waveform.
      Array.from({ length: BARS }, () => 22);
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 rounded-full bg-accent"
          style={{ height: `${Math.max(10, Math.min(100, h))}%` }}
        />
      ))}
    </div>
  );
}

function CardBody({ pin }: { pin: Pin }) {
  const c = pin.card;
  if (c.shape === "photo") {
    return (
      <div className="relative overflow-hidden rounded-[10px] bg-surface">
        {c.motion ? (
          <ChatVideo
            url={c.url}
            fragment="#t=0.1"
            muted
            playsInline
            preload="metadata"
            className="block aspect-[4/3] w-full object-cover"
          />
        ) : (
          <ChatImg url={c.url} alt="" className="block aspect-[4/3] w-full object-cover" />
        )}
        {c.motion && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55">
              <Play size={14} className="translate-x-px fill-white text-white" />
            </span>
          </span>
        )}
        {c.more > 0 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-pill bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white">
            +{c.more}
          </span>
        )}
      </div>
    );
  }
  if (c.shape === "note") {
    return (
      <p className="line-clamp-6 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
        {c.text}
      </p>
    );
  }
  if (c.shape === "voice") {
    return <Waveform peaks={c.peaks} />;
  }
  if (c.shape === "share") {
    return (
      <div className="relative overflow-hidden rounded-[10px] bg-surface">
        {c.thumb || c.video ? (
          c.video ? (
            <ChatVideo url={c.video} fragment="#t=0.1" muted playsInline preload="metadata" className="block aspect-square w-full object-cover" />
          ) : (
            <ChatImg url={c.thumb} alt="" className="block aspect-square w-full object-cover" />
          )
        ) : (
          // The post or Shot is gone, or can no longer be seen. Said plainly,
          // because a blank tile reads as a failed image.
          <p className="flex aspect-square items-center justify-center px-3 text-center text-xs text-muted">
            No longer available
          </p>
        )}
        {c.username && (
          <span className="absolute bottom-1.5 left-1.5 rounded-pill bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white">
            @{c.username}
          </span>
        )}
      </div>
    );
  }
  if (c.shape === "track") {
    return (
      <div className="flex items-center gap-2.5">
        {c.track.artwork ? (
          <ChatImg url={c.track.artwork} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-md bg-surface" />
        )}
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">{c.track.title}</p>
          {c.track.artist && <p className="truncate text-xs text-muted">{c.track.artist}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface">
        <FileText size={16} className="text-accent" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{c.name}</p>
        {fileSize(c.size) && <p className="text-xs text-muted">{fileSize(c.size)}</p>}
      </div>
    </div>
  );
}

function PinCard({
  pin,
  senderName,
  pinnerName,
  onOpen,
  onUnpin,
}: {
  pin: Pin;
  senderName: string | null;
  pinnerName: string | null;
  onOpen: () => void;
  onUnpin: () => void;
}) {
  const right = pin.side === "right";
  // Who, what and when, in the app's eyebrow idiom. The side already says
  // whose it is in a one-to-one chat, so the name only earns its place in a
  // group — and the pinner only when it was not the sender.
  const caption = [pin.label, senderName, pinnerName && `pinned by ${pinnerName}`, pinWhen(pin.at)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={`flex ${right ? "justify-end" : "justify-start"}`}>
      <div className="relative w-[72%]" style={{ transform: `rotate(${pin.tilt}deg)` }}>
        <button
          type="button"
          onClick={onOpen}
          className="block w-full rounded-xl border border-border bg-elevated p-2.5 text-left active:scale-[0.98] transition-transform"
        >
          <CardBody pin={pin} />
          <p className="mt-2 truncate text-[10px] font-bold uppercase tracking-widest text-faint">{caption}</p>
        </button>
        {/* The pin is the unpin button: pulling it out is what takes the card
            down. 28px of hit area around a 10px head, centred on the head so
            the thread still meets it. */}
        <button
          type="button"
          onClick={onUnpin}
          aria-label="Unpin"
          className="absolute flex h-7 w-7 items-center justify-center"
          style={{ top: -14, ...(right ? { right: 3 } : { left: 3 }) }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" />
        </button>
      </div>
    </div>
  );
}

export function PinBoard({
  threadId,
  pins: initial,
  me,
  people,
  isGroup,
}: {
  threadId: string;
  pins: Pin[];
  me: string;
  /** Everyone in the chat, for the name on a group's cards. */
  people: Record<string, { name: string }>;
  isGroup: boolean;
}) {
  const [pins, setPins] = useState(initial);
  const router = useRouter();
  const toast = useToast();
  const supabase = createClient();

  async function unpin(id: string) {
    haptics.select();
    const before = pins;
    setPins((p) => p.filter((x) => x.id !== id));
    const { error } = await supabase.rpc("set_message_pinned", { p_id: id, p_pinned: false });
    if (error) {
      // Put it back: the board has to show what is actually pinned, or the
      // next person to open it sees something different.
      setPins(before);
      toast("Couldn't unpin that");
    }
  }

  if (pins.length === 0) {
    return (
      <EmptyState
        icon={PinIcon}
        title="Nothing pinned yet"
        text="Hold a message in the chat and pin it. Photos, voice notes, posts — anything worth keeping where you can both find it."
      />
    );
  }

  return (
    <div className="px-4 pb-28 pt-4">
      {pins.map((pin, i) => (
        <div key={pin.id}>
          <PinCard
            pin={pin}
            senderName={isGroup && !pin.mine ? (people[pin.senderId]?.name ?? "User") : null}
            pinnerName={
              isGroup && pin.pinnedBy && pin.pinnedBy !== pin.senderId
                ? pin.pinnedBy === me
                  ? "you"
                  : (people[pin.pinnedBy]?.name ?? "someone")
                : null
            }
            onOpen={() => router.push(`/messages/${threadId}?m=${pin.id}`)}
            onUnpin={() => unpin(pin.id)}
          />
          {i < pins.length - 1 && <Thread from={pin.side} to={pins[i + 1].side} />}
        </div>
      ))}
    </div>
  );
}
