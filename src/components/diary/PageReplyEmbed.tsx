"use client";

import { useState } from "react";
import Link from "next/link";
import { Music } from "lucide-react";
import { SpotlightIcon } from "@/components/diary/SpotlightIcon";
import { Avatar } from "@/components/ui/Avatar";
import { diaryTheme, fillSize } from "@/components/diary/DiaryPage";
import { DIARY_HOURS, pageText } from "@/lib/diary";

/**
 * The page a DM answers, as send_page_reply copied it into the message —
 * so it still shows after the page itself has gone.
 */
export type PageSnapshot = {
  text: string;
  color: string | null;
  hue: number;
  writtenAt: string | null;
  /** The page's photo, when it had one. */
  imageUrl: string | null;
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
    // Only a stored picture: this came out of a message, so it is not trusted to be one.
    imageUrl: typeof page.image_url === "string" && page.image_url.startsWith("https://") ? page.image_url : null,
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
  // Pictographs, skin tones, the joiner that builds combined emoji, the
  // variation selector that makes ❤ into ❤️, and the letter pairs of a flag.
  return s.length > 0 && s.length <= 8 && /^(\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|\s)+$/u.test(s);
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
 * disc — leaning slightly, as if laid on the conversation. A photo page is its
 * photo, filling the card, with the words on a dark label at its foot — the
 * same as in the spotlight. A reply in words hangs off its foot as a speech
 * bubble; an emoji is stuck on its corner like a sticker, tilted.
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
  // A photo that no longer loads falls back to the page as words.
  const [broken, setBroken] = useState(false);
  const photo = page.imageUrl && !broken ? page.imageUrl : null;
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

  // Whose page it is, and whether it has ended — at the top of either card.
  const head = (
    <div className="flex min-w-0 items-center gap-1.5">
      {owner ? (
        <Avatar name={owner.name} hue={owner.hue} size={18} src={owner.avatarUrl ?? undefined} />
      ) : (
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-white/15">
          <SpotlightIcon size={12} strokeWidth={2.6} className="text-white" />
        </span>
      )}
      <span className="truncate text-[11px] font-bold text-white/90">{owner ? owner.name : "Your page"}</span>
      {over && (
        <span className="ml-auto shrink-0 rounded-full bg-black/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-white/70">
          Ended
        </span>
      )}
    </div>
  );

  const card = photo ? (
    <div
      className={`relative h-[240px] w-[200px] overflow-hidden rounded-[22px] text-left transition-transform active:scale-[0.98] ${
        mine ? "rotate-[1.5deg]" : "-rotate-[1.5deg]"
      } ${over ? "saturate-[0.55]" : ""}`}
      style={{ background: theme.background, boxShadow: theme.shadow }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo}
        alt=""
        loading="lazy"
        draggable={false}
        onError={() => setBroken(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.5),transparent_32%,transparent_58%,rgba(0,0,0,.55))]"
      />
      <div className="absolute inset-x-3 top-3">{head}</div>
      {(page.text || page.track) && (
        <div className="absolute inset-x-2 bottom-2 rounded-[14px] bg-black/60 px-2.5 py-2 backdrop-blur-md">
          {page.text && (
            <p className="line-clamp-2 break-words text-[13px] font-extrabold leading-[1.15] tracking-[-0.01em] text-white">
              {page.text}
            </p>
          )}
          {page.track && (
            <p className={`truncate text-[10.5px] text-white/75 ${page.text ? "mt-1" : ""}`}>
              <span className="font-semibold text-white/90">♪ {page.track.title}</span>
              {page.track.artist && <span> · {page.track.artist}</span>}
            </p>
          )}
        </div>
      )}
      <span aria-hidden className="absolute bottom-0 left-0 h-[3px] w-full opacity-80" style={{ background: theme.burn }} />
    </div>
  ) : (
    <div
      className={`relative w-[200px] overflow-hidden rounded-[22px] p-3.5 pb-4 text-left transition-transform active:scale-[0.98] ${
        mine ? "rotate-[1.5deg]" : "-rotate-[1.5deg]"
      } ${over ? "saturate-[0.55]" : ""}`}
      style={{ background: theme.background, boxShadow: theme.shadow }}
    >
      {head}

      <p
        className="mt-2.5 break-words font-extrabold leading-[1.06] tracking-[-0.02em] text-white"
        // A card's sizing, a size down: this is a keepsake of the page, not the page.
        style={{ fontSize: Math.min(44, Math.round(fillSize(page.text, 172) * 0.72)), display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {/* A photo page whose photo no longer loads has only its caption, if that. */}
        {pageText(page.text)}
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

      <div className={`relative ${emoji ? "mb-2" : ""}`}>
        {over ? (
          <div aria-label={`Page: ${pageText(page.text)} (ended)`}>{card}</div>
        ) : (
          <Link href="/messages/spotlight" aria-label={`Page: ${pageText(page.text)}`} className="block">
            {card}
          </Link>
        )}

        {emoji && (
          // The reaction, stuck on the page's corner like a sticker: big,
          // tilted away from the card, with a shadow under it. The tilt is on
          // the inner span, because the pop it lands with animates transform.
          <span
            className={`animate-react-pop pointer-events-none absolute -bottom-1 ${mine ? "-left-5" : "-right-5"}`}
          >
            <span
              className={`block text-[46px] leading-none [filter:drop-shadow(0_10px_12px_rgb(0_0_0/0.85))_drop-shadow(0_2px_3px_rgb(0_0_0/0.6))] ${
                mine ? "-rotate-[14deg]" : "rotate-[14deg]"
              }`}
            >
              {body}
            </span>
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
