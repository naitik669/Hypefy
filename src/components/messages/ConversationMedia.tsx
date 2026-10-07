"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { EyeOff, FileText, Images, LayoutGrid, Link2, Paperclip, Play } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChatImg, ChatLink, ChatVideo } from "@/components/messages/ChatMedia";
import { AlbumViewer } from "@/components/messages/MediaFolder";
import { VoiceMessage } from "@/components/messages/VoiceMessage";
import { BLANK_POSTER } from "@/lib/blank-poster";
import {
  byMonth,
  bySender,
  fileSize,
  type SenderFilter,
  type Shared,
  type SharedMedia,
  type SharedOther,
  type SharedPost,
  type SharedTab,
} from "@/lib/chat-shared";

export type SharedPerson = { name: string; hue: number; avatarUrl: string | null };

/** The three tabs are icons: what each holds is said to a screen reader, and by the count beside it. */
export const SHARED_TAB_ICONS: { id: SharedTab; label: string; Icon: typeof Images }[] = [
  { id: "media", label: "Photos and videos", Icon: Images },
  { id: "posts", label: "Posts and Shots", Icon: LayoutGrid },
  { id: "more", label: "Voice notes, files and links", Icon: Paperclip },
];

const EMPTY: Record<SharedTab, { title: string; text: string }> = {
  media: { title: "No photos or videos yet", text: "Photos, videos and GIFs sent in this chat collect here." },
  posts: { title: "No posts or Shots yet", text: "Posts and Shots shared into this chat collect here." },
  more: { title: "Nothing here yet", text: "Voice notes, files and links sent in this chat collect here." },
};

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
}
function sentAt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}`;
}

function MonthHeading({ label }: { label: string }) {
  return <p className="px-4 pb-1.5 pt-4 text-[11px] font-bold tracking-wide text-faint">{label}</p>;
}

/**
 * Everything shared in one conversation, in three tabs: photos and videos;
 * posts and Shots; voice notes, files and links.
 *
 * Three because they are looked for differently. You scan for a photo, you
 * remember who made a post, and you look for a file or a link by roughly
 * when it was sent. Each tab can be narrowed to what you sent or what they
 * did, and runs newest first under the month it was sent in.
 */
export function ConversationMedia({
  shared,
  me,
  people,
  isGroup = false,
  initialTab = "media",
}: {
  shared: Shared;
  me: string;
  /** Everyone in the chat by id, the reader included, for the viewer and the lists. */
  people: Record<string, SharedPerson>;
  isGroup?: boolean;
  initialTab?: SharedTab;
}) {
  const [tab, setTab] = useState<SharedTab>(initialTab);

  return (
    <div className="flex flex-col pb-10">
      <div className="sticky top-14 z-10 chrome-bar border-b border-border/60 px-4 pb-2.5 pt-2">
        <div role="tablist" aria-label="Shared in this chat" className="flex gap-1 rounded-pill bg-surface p-1">
          {SHARED_TAB_ICONS.map(({ id, label, Icon }) => {
            const on = id === tab;
            const count = shared[id].length;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`${label}, ${count}`}
                data-shared-tab={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-pill py-2 text-xs font-bold tabular-nums transition-colors ${
                  on ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={18} strokeWidth={2.2} aria-hidden />
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <SharedPanel shared={shared} me={me} people={people} isGroup={isGroup} tab={tab} />
    </div>
  );
}

/**
 * One tab's worth of what was shared: who-sent-it filter, the months, and
 * the viewer. The Shared screen shows it under its tabs; the chat details
 * screen opens it in place, under the same three icons.
 */
export function SharedPanel({
  shared,
  me,
  people,
  isGroup = false,
  tab,
}: {
  shared: Shared;
  me: string;
  people: Record<string, SharedPerson>;
  isGroup?: boolean;
  tab: SharedTab;
}) {
  const [from, setFrom] = useState<SenderFilter>("all");
  const [open, setOpen] = useState<SharedMedia | null>(null);

  const media = useMemo(() => bySender(shared.media, from, me), [shared.media, from, me]);
  const posts = useMemo(() => bySender(shared.posts, from, me), [shared.posts, from, me]);
  const more = useMemo(() => bySender(shared.more, from, me), [shared.more, from, me]);
  const shownCount = tab === "media" ? media.length : tab === "posts" ? posts.length : more.length;

  const who = (id: string) => (id === me ? "You" : (people[id]?.name ?? "Them"));
  const theirs = isGroup ? "Others" : (Object.entries(people).find(([id]) => id !== me)?.[1].name ?? "Them");

  // The photo that was tapped, with the others sent alongside it.
  const album = useMemo(() => {
    if (!open) return null;
    const together = shared.media.filter((m) => m.messageId === open.messageId);
    return {
      album: { caption: "", items: together.map((m) => ({ url: m.url, type: m.kind === "video" ? ("video" as const) : ("image" as const) })) },
      start: Math.max(0, together.findIndex((m) => m.id === open.id)),
    };
  }, [open, shared.media]);

  return (
    <div data-shared-panel={tab} className="flex flex-col">
      <div className="flex gap-1.5 px-4 pt-2.5">
        {(
          [
            ["all", "All"],
            ["mine", "You"],
            ["theirs", theirs],
          ] as [SenderFilter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={from === id}
            onClick={() => setFrom(id)}
            className={`max-w-[9rem] truncate rounded-pill px-3 py-1 text-[11px] font-semibold transition-colors ${
              from === id ? "bg-white/15 text-foreground" : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shownCount === 0 ? (
        <div className="pt-10">
          <EmptyState
            icon={SHARED_TAB_ICONS.find((t) => t.id === tab)!.Icon}
            title={from === "all" ? EMPTY[tab].title : "Nothing from them here"}
            text={from === "all" ? EMPTY[tab].text : "Try All to see everything shared in this chat."}
            variant="compact"
          />
        </div>
      ) : tab === "media" ? (
        byMonth(media).map((group) => (
          <section key={group.label}>
            <MonthHeading label={group.label} />
            <div className="grid grid-cols-3 gap-0.5 px-0.5">
              {group.items.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  aria-label={`${i.kind === "video" ? "Video" : "Photo"} from ${who(i.senderId)}, ${shortDate(i.at)}`}
                  onClick={() => setOpen(i)}
                  className="relative aspect-square overflow-hidden bg-surface"
                >
                  {i.kind === "video" ? (
                    <>
                      <ChatVideo url={i.url} fragment="#t=0.1" preload="metadata" muted playsInline className="h-full w-full object-cover" />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Play size={22} className="text-white drop-shadow" fill="currentColor" />
                      </span>
                    </>
                  ) : (
                    <ChatImg url={i.url} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          </section>
        ))
      ) : tab === "posts" ? (
        byMonth(posts).map((group) => (
          <section key={group.label}>
            <MonthHeading label={group.label} />
            <div className="grid grid-cols-3 gap-1 px-3">
              {group.items.map((p) => (
                <PostTile key={p.id} post={p} />
              ))}
            </div>
          </section>
        ))
      ) : (
        byMonth(more).map((group) => (
          <section key={group.label}>
            <MonthHeading label={group.label} />
            <div className="flex flex-col divide-y divide-border/50">
              {group.items.map((o) => (
                <OtherRow key={o.id} item={o} mine={o.senderId === me} who={who(o.senderId)} />
              ))}
            </div>
          </section>
        ))
      )}

      {open && album && (
        <AlbumViewer
          album={album.album}
          start={album.start}
          onClose={() => setOpen(null)}
          sender={{
            name: who(open.senderId),
            hue: people[open.senderId]?.hue,
            avatarUrl: people[open.senderId]?.avatarUrl ?? null,
          }}
          sentAt={sentAt(open.at)}
        />
      )}
    </div>
  );
}

/** A post or Shot that was shared: its picture and who made it. Gone ones say so and go nowhere. */
function PostTile({ post }: { post: SharedPost }) {
  const frame = "relative block aspect-[9/14] overflow-hidden rounded-xl bg-surface";
  if (!post.targetId) {
    return (
      <div className={`${frame} flex flex-col items-center justify-center gap-1.5 border border-dashed border-border px-2 text-center`}>
        <EyeOff size={16} className="text-faint" aria-hidden />
        <span className="text-[10px] font-semibold leading-tight text-faint">No longer available</span>
      </div>
    );
  }
  return (
    <Link
      href={post.kind === "shot" ? `/shots/${post.targetId}` : `/p/${post.targetId}`}
      prefetch={false}
      aria-label={`${post.kind === "shot" ? "Shot" : "Post"}${post.username ? ` by @${post.username}` : ""}`}
      className={frame}
    >
      {post.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : post.video ? (
        <video src={`${post.video}#t=0.1`} poster={BLANK_POSTER} preload="metadata" muted playsInline className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-faint">
          <FileText size={20} aria-hidden />
        </span>
      )}
      {post.kind === "shot" && (
        <Play size={14} className="absolute right-1.5 top-1.5 text-white drop-shadow" fill="currentColor" aria-hidden />
      )}
      {post.username && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-semibold text-white">
          @{post.username}
        </span>
      )}
    </Link>
  );
}

function OtherRow({ item, mine, who }: { item: SharedOther; mine: boolean; who: string }) {
  const meta = `${who} · ${shortDate(item.at)}`;
  if (item.kind === "voice") {
    // Plays where it is: it used to open the raw file in a new tab.
    return (
      <div className="px-4 py-3">
        <VoiceMessage url={item.url} storedDuration={item.duration} peaks={item.peaks} mine={mine} />
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </div>
    );
  }
  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-muted">
        {item.kind === "file" ? <FileText size={18} aria-hidden /> : <Link2 size={18} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.kind === "file" ? item.name : item.host}</span>
        <span className="block truncate text-xs text-muted">
          {item.kind === "file" ? [fileSize(item.size), meta].filter(Boolean).join(" · ") : item.url}
        </span>
        {item.kind === "link" && <span className="block text-xs text-faint">{meta}</span>}
      </span>
    </>
  );
  const cls = "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]";
  return item.kind === "file" ? (
    <ChatLink url={item.url} target="_blank" rel="noreferrer" className={cls}>
      {body}
    </ChatLink>
  ) : (
    <a href={item.url} target="_blank" rel="noreferrer noopener" className={cls}>
      {body}
    </a>
  );
}
