"use client";

import Link from "next/link";
import { BookOpenText, Music } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { diaryTheme, fillSize } from "@/components/diary/DiaryPage";
import { DIARY_HOURS } from "@/lib/diary";

/**
 * The page a DM answers, as send_page_reply copied it into the message —
 * so it still shows after the page itself has gone.
 */
export type PageSnapshot = {
  text: string;
  color: string | null;
  hue: number;
  writtenAt: string | null;
  track: { title: string; artist?: string | null; artwork?: string | null } | null;
};

/** The snapshot from a message's metadata, or null if it has none. */
export function pageSnapshot(metadata: unknown): PageSnapshot | null {
  const page = (metadata as { page?: Record<string, unknown> } | null)?.page;
  if (!page || typeof page.text !== "string") return null;
  const track = page.track as { title?: unknown; artist?: unknown; artwork?: unknown } | null;
  return {
    text: page.text,
    color: typeof page.color === "string" ? page.color : null,
    hue: typeof page.hue === "number" ? page.hue : 280,
    writtenAt: typeof page.written_at === "string" ? page.written_at : null,
    track:
      track && typeof track.title === "string"
        ? {
            title: track.title,
            artist: String(track.artist ?? ""),
            artwork: typeof track.artwork === "string" && track.artwork ? track.artwork : null,
          }
        : null,
  };
}

/** Just emoji, and not many — sent from the row of six, drawn large. */
export function isEmojiReply(body: string | null): boolean {
  if (!body) return false;
  const s = body.trim();
  // Pictographs, skin tones, the joiner that builds combined emoji, and the
  // variation selector that makes ❤ into ❤️.
  return s.length > 0 && s.length <= 8 && /^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s)+$/u.test(s);
}

/** Whether the page has run its 24 hours. */
function ended(writtenAt: string | null, now = Date.now()) {
  return !!writtenAt && now > new Date(writtenAt).getTime() + DIARY_HOURS * 3_600_000;
}

/**
 * A reply to a page, in a chat.
 *
 * The page it answers, drawn as a small copy of its card — its colour, whose
 * it is, the words as large as they fit, the song with its cover on a little
 * disc — leaning slightly, as if laid on the conversation. A reply in words
 * hangs off its foot as a speech bubble; an emoji lands big on its corner.
 * A line above says what happened, from where you sit. A page that has run
 * its day says so and stays put; one still up opens Spotlight.
 */
export function PageReplyEmbed({
  page,
  body,
  mine,
  owner,
  now,
}: {
  page: PageSnapshot;
  body: string | null;
  /** You sent the reply (so the page is theirs). */
  mine: boolean;
  /** Whose page it is, when it is not yours. */
  owner?: { name: string; hue: number; avatarUrl?: string | null } | null;
  /** For tests; the time the chat is drawn at. */
  now?: number;
}) {
  const theme = diaryTheme(page.color, page.hue);
  const emoji = isEmojiReply(body);
  const over = ended(page.writtenAt, now);
  const whose = owner ? `${owner.name.split(" ")[0]}'s page` : "your page";
  const what = emoji
    ? mine
      ? `You reacted to ${whose}`
      : `Reacted to ${whose}`
    : mine
      ? `You replied to ${whose}`
      : `Replied to ${whose}`;

  const card = (
    <div
      className={`relative w-[200px] overflow-hidden rounded-[22px] p-3.5 ${emoji ? "pb-7" : "pb-4"} text-left transition-transform active:scale-[0.98] ${
        mine ? "rotate-[1.5deg]" : "-rotate-[1.5deg]"
      } ${over ? "saturate-[0.55]" : ""}`}
      style={{ background: theme.background, boxShadow: theme.shadow }}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {owner ? (
          <Avatar name={owner.name} hue={owner.hue} size={18} src={owner.avatarUrl ?? undefined} />
        ) : (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/15">
            <BookOpenText size={10} className="text-white" />
          </span>
        )}
        <span className="truncate text-[11px] font-bold text-white/90">{owner ? owner.name : "Your page"}</span>
        {over && (
          <span className="ml-auto shrink-0 rounded-full bg-black/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-white/70">
            Ended
          </span>
        )}
      </div>

      <p
        className="mt-2.5 break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white"
        // A card's sizing, a size down: this is a keepsake of the page, not the page.
        style={{ fontSize: Math.min(44, Math.round(fillSize(page.text, 172) * 0.72)), display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {page.text}
      </p>

      {page.track && (
        <div className="mt-3 flex min-w-0 items-center gap-2 rounded-full bg-black/25 py-1 pl-1 pr-2.5">
          {/* The song on a little CD, its cover in the middle. */}
          <span
            aria-hidden
            className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle, #1e1e24 0%, #0c0c0f 72%, #16161b 100%)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.14)" }}
          >
            {page.track.artwork ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={page.track.artwork} alt="" className="h-[60%] w-[60%] rounded-full object-cover" />
            ) : (
              <Music size={9} className="text-white/70" />
            )}
            <span className="absolute h-[3px] w-[3px] rounded-full bg-background" />
          </span>
          <span className="min-w-0 truncate text-[10.5px] text-white/75">
            <span className="font-semibold text-white/90">{page.track.title}</span>
            {page.track.artist && <span> · {page.track.artist}</span>}
          </span>
        </div>
      )}

      <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-full opacity-80" style={{ background: theme.burn }} />
    </div>
  );

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="mb-1.5 px-1 text-[11px] font-semibold text-muted">{what}</span>

      <div className={`relative ${emoji ? "mb-6" : ""}`}>
        {over ? (
          <div aria-label={`Page: ${page.text} (ended)`}>{card}</div>
        ) : (
          <Link href="/messages/spotlight" aria-label={`Page: ${page.text}`} className="block">
            {card}
          </Link>
        )}

        {emoji && (
          // The reaction, landed on the page's corner.
          <span
            className={`animate-react-pop absolute -bottom-7 flex h-12 w-12 items-center justify-center rounded-full bg-background/80 text-[30px] leading-none shadow-[0_6px_18px_-4px_rgb(0_0_0/0.7)] ring-2 ring-background ${
              mine ? "-left-4" : "-right-4"
            }`}
          >
            {body}
          </span>
        )}
      </div>

      {!emoji && (
        // The words hang off the page's foot, like a speech bubble.
        <div
          className={`relative z-10 -mt-3 max-w-60 rounded-2xl px-3.5 py-2 text-sm shadow-[0_8px_20px_-8px_rgb(0_0_0/0.8)] ${
            mine ? "mr-2 rounded-tr-md bg-accent text-accent-ink" : "ml-2 rounded-tl-md bg-elevated text-foreground"
          }`}
        >
          {body}
        </div>
      )}
    </div>
  );
}
