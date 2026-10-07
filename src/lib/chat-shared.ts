import { parseAlbum } from "@/lib/chat-album";

/**
 * Everything shared in one conversation, sorted into the three places it is
 * looked for: photos and videos, posts and Shots, and the rest (voice notes,
 * files, links).
 *
 * Pure: the page reads the rows, this decides what they are.
 */

export type SharedTab = "media" | "posts" | "more";
export const SHARED_TABS: SharedTab[] = ["media", "posts", "more"];

export function isSharedTab(v: unknown): v is SharedTab {
  return typeof v === "string" && (SHARED_TABS as string[]).includes(v);
}

type Base = {
  /** Unique in its list. A photo inside a folder is `<message>-<index>`. */
  id: string;
  /** The message it was sent in. */
  messageId: string;
  senderId: string;
  at: string;
};

/** Photos and videos people took or chose. GIFs are reactions, not media, and are left out. */
export type SharedMedia = Base & { kind: "image" | "video"; url: string };
export type SharedPost = Base & {
  kind: "post" | "shot";
  /** Null when the post or Shot is gone, or can no longer be seen. */
  targetId: string | null;
  thumb: string | null;
  /** A Shot with no poster shows its first frame instead. */
  video: string | null;
  username: string | null;
};
export type SharedOther =
  | (Base & { kind: "voice"; url: string; duration?: number; peaks?: number[] })
  | (Base & { kind: "file"; url: string; name: string; size?: number })
  | (Base & { kind: "link"; url: string; host: string });

export type Shared = { media: SharedMedia[]; posts: SharedPost[]; more: SharedOther[] };

/** A message row, as the page selects it. */
export type SharedRow = {
  id: string;
  kind: string;
  body: string | null;
  sender_id: string;
  created_at: string;
  post_id?: string | null;
  shot_id?: string | null;
  post?: unknown;
  shot?: unknown;
};

const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] : v) as T | null) ?? null;

/** Voice notes and documents pack their details into the body as JSON; old rows hold the bare URL. */
function unpack(body: string | null): Record<string, unknown> & { url: string } {
  if (!body) return { url: "" };
  try {
    const raw = JSON.parse(body) as Record<string, unknown>;
    if (raw && typeof raw === "object" && typeof raw.url === "string") return raw as Record<string, unknown> & { url: string };
  } catch {
    /* a bare URL */
  }
  return { url: body };
}

const LINK = /https?:\/\/[^\s<>"')\]]+/gi;

/** The web links in a message, each once, without the full stop that ended the sentence. */
export function linksIn(body: string | null | undefined): { url: string; host: string }[] {
  if (!body) return [];
  const seen = new Set<string>();
  const out: { url: string; host: string }[] = [];
  for (const raw of body.match(LINK) ?? []) {
    const url = raw.replace(/[.,!?;:]+$/, "");
    if (seen.has(url)) continue;
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (!host) continue;
      seen.add(url);
      out.push({ url, host });
    } catch {
      /* not a link after all */
    }
  }
  return out;
}

/** Sort a conversation's rows (newest first, as given) into the three lists. */
export function sortShared(rows: SharedRow[]): Shared {
  const media: SharedMedia[] = [];
  const posts: SharedPost[] = [];
  const more: SharedOther[] = [];

  for (const m of rows) {
    const base = { messageId: m.id, senderId: m.sender_id, at: m.created_at };
    if (m.kind === "album") {
      // A folder of photos shows each of them, not the folder.
      (parseAlbum(m.body)?.items ?? []).forEach((it, i) => media.push({ ...base, id: `${m.id}-${i}`, kind: it.type, url: it.url }));
    } else if (m.kind === "image" || m.kind === "video") {
      if (m.body) media.push({ ...base, id: m.id, kind: m.kind, url: m.body });
    } else if (m.kind === "post") {
      const p = one<{ id: string; image_url?: string | null; image_urls?: string[] | null; profiles?: unknown }>(m.post);
      posts.push({
        ...base,
        id: m.id,
        kind: "post",
        targetId: p?.id ?? null,
        thumb: p?.image_urls?.[0] ?? p?.image_url ?? null,
        video: null,
        username: one<{ username?: string | null }>(p?.profiles)?.username ?? null,
      });
    } else if (m.kind === "shot") {
      const s = one<{ id: string; media_url?: string | null; poster_url?: string | null; profiles?: unknown }>(m.shot);
      const isVideo = !!s?.media_url && !/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(s.media_url);
      posts.push({
        ...base,
        id: m.id,
        kind: "shot",
        targetId: s?.id ?? null,
        thumb: s?.poster_url ?? (isVideo ? null : (s?.media_url ?? null)),
        video: !s?.poster_url && isVideo ? (s?.media_url ?? null) : null,
        username: one<{ username?: string | null }>(s?.profiles)?.username ?? null,
      });
    } else if (m.kind === "voice") {
      const v = unpack(m.body);
      if (v.url)
        more.push({
          ...base,
          id: m.id,
          kind: "voice",
          url: v.url,
          duration: typeof v.duration === "number" ? v.duration : undefined,
          peaks: Array.isArray(v.peaks) ? (v.peaks as number[]) : undefined,
        });
    } else if (m.kind === "document") {
      const d = unpack(m.body);
      if (d.url)
        more.push({
          ...base,
          id: m.id,
          kind: "file",
          url: d.url,
          name: typeof d.name === "string" && d.name ? d.name : "Document",
          size: typeof d.size === "number" ? d.size : undefined,
        });
    } else if (m.kind === "text") {
      linksIn(m.body).forEach((l, i) => more.push({ ...base, id: `${m.id}-${i}`, kind: "link", ...l }));
    }
  }
  return { media, posts, more };
}

export type SenderFilter = "all" | "mine" | "theirs";

export function bySender<T extends { senderId: string }>(items: T[], filter: SenderFilter, me: string): T[] {
  if (filter === "all") return items;
  return items.filter((i) => (i.senderId === me) === (filter === "mine"));
}

/** "October", or "October 2025" for another year. */
export function monthLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en", { month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** Runs of items from the same month, in the order given. */
export function byMonth<T extends { at: string }>(items: T[], now = new Date()): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = monthLabel(item.at, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** "1.2 MB", "340 KB". */
export function fileSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** The columns the Shared screens read. Kept here so the two pages ask for the same thing. */
export const SHARED_SELECT =
  "id, kind, body, sender_id, created_at, post_id, shot_id, post:posts(id, image_url, image_urls, profiles!posts_user_id_fkey(username)), shot:shots(id, media_url, poster_url, profiles(username))";
export const SHARED_KINDS = ["image", "video", "album", "post", "shot", "voice", "document"];
