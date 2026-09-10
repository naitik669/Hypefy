import { Music, Star } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DIARY_HOURS, type DiaryEntry } from "@/lib/diary";

/**
 * One Diary, drawn as a page.
 *
 * The words are the page. The first version put a large avatar, a name and a
 * countdown on top of a grey box with the note inside it, so every card read
 * as a profile card — and a two-word note sat in a box three-quarters empty
 * while a longer one was cut off mid-sentence. Here the note is set as large
 * as it can be while still fitting, and the person is a signature at the foot.
 *
 * Each page is tinted in its author's own hue, so a screen of them reads as
 * a quilt of your people rather than a stack of identical grey cards, and the
 * app's lime is left for the only two things that should shout: what is new,
 * and the button to write your own.
 *
 * Along the bottom edge runs the page's burn line: its width is how much of
 * its 24 hours is left. Nothing else on the page says "this disappears", and
 * nothing needs to.
 */

/** Share of the 24 hours remaining, 0..1. */
export function lifeLeft(createdAt: string, now = Date.now()): number {
  const ms = new Date(createdAt).getTime() + DIARY_HOURS * 3_600_000 - now;
  return Math.max(0, Math.min(1, ms / (DIARY_HOURS * 3_600_000)));
}

/** "22h", "40m", "now" — for the signature line, where "left" is implied. */
export function shortLeft(createdAt: string, now = Date.now()): string {
  const ms = new Date(createdAt).getTime() + DIARY_HOURS * 3_600_000 - now;
  if (!(ms > 0)) return "now";
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
}

/**
 * The note's type size, from its length.
 *
 * A two-word note set at the size of a paragraph looks like a mistake; a
 * paragraph set at the size of two words does not fit. Counted in grapheme-
 * ish units (Array.from) so an emoji counts once, not as two UTF-16 halves.
 */
export function noteSize(text: string): { size: number; clamp: number } {
  const n = Array.from(text.trim()).length;
  if (n <= 6) return { size: 44, clamp: 2 };
  if (n <= 14) return { size: 30, clamp: 3 };
  if (n <= 28) return { size: 22, clamp: 4 };
  if (n <= 44) return { size: 18, clamp: 5 };
  return { size: 15, clamp: 6 };
}

/** The page colours for an author's hue. */
export function pageTint(hue: number) {
  return {
    // A soft light from the top corner, kept low so warm hues stay their own
    // colour instead of going muddy — the first pass at 55%/0.9 turned gold
    // into olive.
    background: `radial-gradient(110% 80% at 0% 0%, hsl(${hue} 45% 24% / 0.5), transparent 65%), linear-gradient(165deg, hsl(${hue} 30% 13%), hsl(${hue} 26% 8%))`,
    borderColor: `hsl(${hue} 40% 26% / 0.55)`,
    burn: `hsl(${hue} 80% 62%)`,
  };
}

export function DiaryPage({
  entry,
  label,
  fresh = false,
  size = "grid",
}: {
  entry: DiaryEntry;
  /** Who signs it — their name, or "You". */
  label: string;
  fresh?: boolean;
  /** "grid" fills a card; "open" is the larger page in the viewer. */
  size?: "grid" | "open";
}) {
  const tint = pageTint(entry.hue);
  const { size: fontSize, clamp } = noteSize(entry.text);
  const open = size === "open";

  return (
    <div
      className={`relative flex flex-col overflow-hidden border ${
        open ? "min-h-[260px] rounded-[32px] p-5" : "aspect-[4/5] rounded-[26px] p-3.5"
      }`}
      style={{ background: tint.background, borderColor: tint.borderColor }}
    >
      {/* On an open page the song gets a full, playable chip beneath it, so
          the page itself does not repeat the title. */}
      {entry.track && !open && (
        <span className="mb-2 flex max-w-full items-center gap-1.5 self-start rounded-pill bg-black/35 py-1 pl-1.5 pr-2.5 text-[11px] font-semibold text-white/85 backdrop-blur-sm">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/15">
            <Music size={9} />
          </span>
          <span className="truncate">{entry.track.title}</span>
        </span>
      )}

      {/* The note. Bottom-aligned within the space above the signature, the
          way writing sits on a page rather than floating in the middle of it. */}
      <p
        className="mt-auto break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
        style={{
          fontSize: open ? Math.min(Math.round(fontSize * 1.3), 54) : fontSize,
          display: "-webkit-box",
          WebkitLineClamp: open ? undefined : clamp,
          WebkitBoxOrient: "vertical",
          overflow: open ? "visible" : "hidden",
        }}
      >
        {entry.text}
      </p>

      {/* The signature. */}
      <div className={`flex min-w-0 items-center gap-1.5 ${open ? "mt-5" : "mt-3"}`}>
        <Avatar
          name={entry.name}
          hue={entry.hue}
          size={open ? 26 : 20}
          src={entry.avatarUrl ?? undefined}
        />
        <span className={`truncate font-semibold text-white/90 ${open ? "text-sm" : "text-xs"}`}>
          {label}
        </span>
        {entry.audience === "close" && (
          <Star
            size={open ? 12 : 10}
            className="shrink-0 fill-accent text-accent"
            aria-label="Close friends"
          />
        )}
        {fresh && (
          <span
            aria-label="New"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
          />
        )}
        <span
          className={`ml-auto shrink-0 tabular-nums text-white/45 ${open ? "text-xs" : "text-[11px]"}`}
          suppressHydrationWarning
        >
          {shortLeft(entry.createdAt)}
        </span>
      </div>

      {/* The burn line — how much of the day this page has left. */}
      <span
        aria-hidden
        className="absolute bottom-0 left-0 h-[3px] rounded-r-full opacity-80"
        style={{
          width: `${lifeLeft(entry.createdAt) * 100}%`,
          background: tint.burn,
        }}
        suppressHydrationWarning
      />
    </div>
  );
}
