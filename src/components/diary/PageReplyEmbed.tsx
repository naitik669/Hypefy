"use client";

import Link from "next/link";
import { Music } from "lucide-react";
import { diaryTheme } from "@/components/diary/DiaryPage";

/**
 * The page a DM answers, as send_page_reply copied it into the message —
 * so it still shows after the page itself has gone.
 */
export type PageSnapshot = {
  text: string;
  color: string | null;
  hue: number;
  track: { title: string; artist?: string | null } | null;
};

/** The snapshot from a message's metadata, or null if it has none. */
export function pageSnapshot(metadata: unknown): PageSnapshot | null {
  const page = (metadata as { page?: Record<string, unknown> } | null)?.page;
  if (!page || typeof page.text !== "string") return null;
  const track = page.track as { title?: unknown; artist?: unknown } | null;
  return {
    text: page.text,
    color: typeof page.color === "string" ? page.color : null,
    hue: typeof page.hue === "number" ? page.hue : 280,
    track: track && typeof track.title === "string" ? { title: track.title, artist: String(track.artist ?? "") } : null,
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

/**
 * A reply to a page, in a chat: the page, small and tilted, in its own
 * colour — so it is plain which page was answered — with the reply under
 * it. An emoji sits large on the page's corner instead of in a bubble, the
 * way a story reaction does.
 */
export function PageReplyEmbed({
  page,
  body,
  mine,
  footer,
}: {
  page: PageSnapshot;
  body: string | null;
  mine: boolean;
  /** Time and read tick, drawn by the chat. */
  footer?: React.ReactNode;
}) {
  const theme = diaryTheme(page.color, page.hue);
  const emoji = isEmojiReply(body);

  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <span className="mb-1 px-1 text-[11px] font-semibold text-muted">
        {mine ? "Replied to their page" : "Replied to your page"}
      </span>
      <div className="relative">
        <Link
          href="/messages/spotlight"
          aria-label={`Page: ${page.text}`}
          className={`block w-40 rounded-[18px] p-3 ${mine ? "rotate-2" : "-rotate-2"}`}
          style={{ background: theme.background, boxShadow: theme.shadow }}
        >
          <p className="line-clamp-4 break-words text-[15px] font-extrabold leading-[1.12] tracking-[-0.01em] text-white">
            {page.text}
          </p>
          {page.track && (
            <p className="mt-2 flex items-center gap-1 text-[10.5px] font-semibold text-white/70">
              <Music size={10} className="shrink-0" />
              <span className="truncate">{page.track.title}</span>
            </p>
          )}
          <span aria-hidden className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full opacity-80" style={{ background: theme.burn }} />
        </Link>
        {emoji && (
          <span
            className={`animate-react-pop absolute -bottom-5 text-[40px] leading-none drop-shadow-[0_4px_10px_rgb(0_0_0/0.5)] ${
              mine ? "-left-4" : "-right-4"
            }`}
          >
            {body}
          </span>
        )}
      </div>
      {emoji ? (
        <div className="h-6" />
      ) : (
        <div
          className={`mt-1.5 max-w-60 rounded-2xl px-3.5 py-2 text-sm ${
            mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface text-foreground"
          }`}
        >
          {body}
        </div>
      )}
      {footer}
    </div>
  );
}
