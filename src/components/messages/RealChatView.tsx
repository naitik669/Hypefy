"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeBack } from "@/lib/safe-back";
import { ChevronLeft, Reply, Copy, Trash2, Flag, Users, Play, Phone, Video, MoreVertical, UserCircle, BellOff, Ban, X, Mic, Star, Paperclip, LogOut, Pencil, Eye, EyeOff, FileText, Download, Check, Camera, Image as ImageIcon } from "lucide-react";
import { Plane } from "@/components/ui/Plane";
import { createClient } from "@/lib/supabase/client";
import { useCallControls } from "@/components/calls/CallProvider";
import { useGroupCall } from "@/components/calls/GroupCallProvider";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { PageReplyEmbed, pageSnapshot } from "@/components/diary/PageReplyEmbed";
import { VoiceMessage } from "@/components/messages/VoiceMessage";
import { GifPicker } from "@/components/messages/GifPicker";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { FloatingMenu, MenuItem, MenuDivider } from "@/components/ui/FloatingMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CaptureGuard } from "@/components/native/CaptureGuard";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { useToast } from "@/components/ui/ToastProvider";
import { scheduleUndoable } from "@/lib/undoable";
import { presenceLabel } from "@/lib/presence";
import { haptics } from "@/lib/haptics";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { useMentionHashtag, applySuggestion, SuggestionDropdown } from "@/components/ui/MentionHashtagPicker";
import { one } from "@/lib/supabase/typed";
import { ForwardSheet } from "@/components/messages/ForwardSheet";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { bubbleCss, findChatTheme } from "@/lib/chat-themes";
import { ChatAmbient } from "@/components/messages/ChatAmbient";
import { resolveBubble } from "@/lib/bubble-styles";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { DisplayName } from "@/components/ui/DisplayName";
import { visibleDecoration } from "@/lib/cosmetics";
import { MediaFolder, AlbumViewer } from "@/components/messages/MediaFolder";
import { MediaPicker, type MediaPickerApi, type PickEntry } from "@/components/messages/MediaPicker";
import {
  ALBUM_CAPTION_MAX,
  albumSnippet,
  encodeAlbum,
  parseAlbum,
  type Album,
  type AlbumItem,
} from "@/lib/chat-album";
import { uploadAlbumFiles, type AlbumFile } from "@/lib/chat-album-upload";
import { leaveChatAnimated } from "@/lib/leave-chat";

type PostPreview = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
};
type ShotPreview = { id: string; media_url: string; caption: string | null };
type ShareProfile = { username: string | null; display_name: string | null; avatar_hue: number | null };

export type ChatMsg = {
  id: string;
  body: string | null;
  sender_id: string;
  kind: string;
  post_id: string | null;
  shot_id?: string | null;
  reply_to_id: string | null;
  is_unsent: boolean;
  edited_at?: string | null;
  created_at: string;
  post?: PostPreview | null;
  postProfile?: ShareProfile | null;
  shot?: ShotPreview | null;
  shotProfile?: ShareProfile | null;
  /** claim_oneshot writes { oneshot_opened, oneshot_opened_at } here — the
   *  only channel the sender has for "did they open it yet", since the
   *  oneshots table itself is unreadable by any client. */
  metadata?: {
    oneshot_opened?: boolean;
    oneshot_opened_at?: string;
    /** A reply to someone's page: the page as it was, copied by send_page_reply. */
    page?: unknown;
  } | null;
  /** Client-only: set on optimistic messages before server confirms */
  _status?: "pending" | "failed";
  /** Client-only: the OneShot's private storage path, kept so a failed send
   *  can be retried without re-uploading. Never comes back from the server. */
  _storagePath?: string;
  /** Client-only, folders: the album drawn from this device's files while
   *  it uploads, so nothing reloads when the real URLs arrive. */
  _preview?: string;
  /** Client-only, single photo or video: the file on this device, drawn
   *  while it uploads and after, so the picture never reloads. */
  _localUrl?: string;
  _caption?: string;
};

type MsgStatus = "pending" | "sent" | "seen" | "failed";

/**
 * One other participant's read state. A list rather than a scalar because a
 * group has no "the other person" — which is exactly why group read receipts
 * never appeared.
 */
export type Reader = {
  userId: string;
  lastReadAt: string | null;
  hideReadReceipts: boolean;
};

/**
 * Has everyone who could have read this message read it?
 *
 * Anyone with "Hide read receipts" on is left OUT of the test rather than
 * counted as unread — otherwise one member's privacy setting would
 * permanently withhold the tick from everyone else in the group. When they
 * are the only other participant there is nobody left to count, so the
 * message correctly never reads as seen.
 */
export function everyoneHasRead(readers: Reader[], createdAt: string): boolean {
  const counted = readers.filter((r) => !r.hideReadReceipts);
  if (counted.length === 0) return false;
  return counted.every((r) => !!r.lastReadAt && createdAt <= r.lastReadAt);
}

/** Width of a photo or video in the thread. */
const MEDIA_W = 280;

/** A folder as drawn: the photos from this device while it has them, so they
 *  never reload, and the caption as it now stands, which an edit may change. */
function albumOf(m: ChatMsg): Album | null {
  const shown = parseAlbum(m._preview ?? m.body);
  if (!shown) return null;
  const current = m._preview ? parseAlbum(m.body) : shown;
  return { ...shown, caption: current?.caption ?? shown.caption };
}

/** Short human snippet for quoting a message — never a raw URL. */
function msgSnippet(m: { is_unsent?: boolean; kind: string; body: string | null }): string {
  if (m.is_unsent) return "Unsent message";
  switch (m.kind) {
    case "gif": return "GIF";
    case "image": return "Photo";
    case "video": return "Video";
    case "voice": return "Voice note";
    case "shot": return "Shot";
    case "post": return "Post";
    case "oneshot": return "Photo";
    case "album": return albumSnippet(m.body);
    case "page_reply": return m.body ? `Page reply: ${m.body}` : "Page reply";
    case "document": {
      try { return JSON.parse(m.body ?? "")?.name ?? "Document"; } catch { return "Document"; }
    }
    default: return m.body ?? "Message";
  }
}

type ReactionRow = { message_id: string; user_id: string; emoji: string };
type Other = { id: string; name: string; username: string | null; hue: number; avatarUrl?: string | null; lastSeenAt?: string | null; showActivity?: boolean; hideReadReceipts?: boolean; verified?: boolean; cosmetics?: { is_premium: boolean; name_font: string | null; name_glow: string | null; avatar_decoration: string | null } | null };
type GroupMember = { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null; role: string };
type GroupMeta = { title: string; memberCount: number; avatarUrl?: string | null; members?: GroupMember[]; myRole?: string };

const REPORT_REASONS = ["Spam", "Harassment", "Hate or abuse", "Scam", "Inappropriate content", "Other"];
const QUICK = ["❤️", "🥰", "😂", "👍", "😮", "😢"];

/** Document mimes the chat-media bucket accepts (0034_chat_documents.sql).
 *  Kept in sync with that migration's allowlist — html/svg are deliberately
 *  absent since both can carry script. */
const DOC_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
];
/** Extensions too — some platforms' file pickers match on those, not mime. */
const DOC_ACCEPT = `${DOC_MIMES.join(",")},.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip`;

/** The paperclip's hold menu, in priority order. A tap opens the picker
 *  sheet; holding offers each kind directly.
 *
 *  Labels only — no descriptions. Every label already says what it does,
 *  and the one row that genuinely needs a caveat (View once) gets it at
 *  the point of sending, in the composer preview. */
const ATTACH_OPTIONS: {
  mode: "camera" | "media" | "oneshot" | "document" | "gif";
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: "camera", icon: <Camera size={16} />, label: "Camera" },
  { mode: "media", icon: <ImageIcon size={16} />, label: "Photo or video" },
  { mode: "oneshot", icon: <Eye size={16} />, label: "View once" },
  { mode: "document", icon: <FileText size={16} />, label: "Document" },
  { mode: "gif", icon: <span className="text-[9px] font-black tracking-wider">GIF</span>, label: "GIF" },
];

/** How long the paperclip is held before its menu opens instead. */
const ATTACH_HOLD_MS = 400;

/** "2.4 MB" / "812 KB" — for document bubbles. */
function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** How many messages per page (initial load + each scroll-up chunk). */
const MSG_PAGE = 30;
/** Select used for both the initial server load and client pagination. */
const MSG_SELECT =
  "id, body, sender_id, kind, post_id, shot_id, reply_to_id, is_unsent, metadata, created_at, post:posts(id, caption, image_url, image_urls, profiles!posts_user_id_fkey(username, display_name, avatar_hue)), shot:shots(id, media_url, caption, profiles(username, display_name, avatar_hue))";

/** Flatten Supabase's nested post/shot+profile joins into ChatMsg shape. */
function mapMessageRow(m: any): ChatMsg {
  const profOf = (x: any) => { const p = one<any>(x); return p ? one<any>(p.profiles) : null; };
  return {
    ...m,
    post: m.post ? { ...one(m.post), profiles: undefined } : null,
    postProfile: m.post ? profOf(m.post) : null,
    shot: m.shot ? { ...one(m.shot), profiles: undefined } : null,
    shotProfile: m.shot ? profOf(m.shot) : null,
  };
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function sameDay(a: string, b: string) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
function dayLabel(iso: string) {
  const d = new Date(iso), now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  if (diff > 1 && diff < 7)
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

export function RealChatView({
  conversationId,
  currentUserId,
  other,
  group,
  members,
  initialMessages,
  initialReactions = [],
  initialReaders = [],
  initialTheme = null,
  bubbleStyles = {},
}: {
  conversationId: string;
  currentUserId: string;
  other: Other;
  group?: GroupMeta | null;
  members?: Record<string, { name: string; hue: number }>;
  initialMessages: ChatMsg[];
  initialReactions?: ReactionRow[];
  initialReaders?: Reader[];
  /** The conversation's chat theme id, or null for the default look. */
  initialTheme?: string | null;
  /** Each member's bubble style they can show right now (user id → style id). */
  bubbleStyles?: Record<string, string | null>;
}) {
  const isGroup = !!group;
  const senderName = (id: string) => (id === currentUserId ? "You" : members?.[id]?.name ?? other.name);
  const supabase = createClient();
  const [themeId, setThemeId] = useState<string | null>(initialTheme);
  const theme = findChatTheme(themeId);
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [reactions, setReactions] = useState<ReactionRow[]>(initialReactions);
  const [readers, setReaders] = useState<Reader[]>(initialReaders);
  const [text, setText] = useState("");
  const [dmCursor, setDmCursor] = useState(0);
  const { suggestions: pickerSuggestions, reset: resetPicker } = useMentionHashtag(text, dmCursor);
  const [sending, setSending] = useState(false);

  // Prefill the composer when arriving from a Note reply ("?prefill=…"), so the
  // indirect-confession payoff lands as a quoted draft. Clears the param after.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get("prefill");
    if (prefill) {
      setText(prefill);
      const url = new URL(window.location.href);
      url.searchParams.delete("prefill");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [editing, setEditing] = useState<ChatMsg | null>(null);
  const [menu, setMenu] = useState<{ msg: ChatMsg; rect: DOMRect } | null>(null);
  const [reportMsg, setReportMsg] = useState<ChatMsg | null>(null);
  const [forwardMsg, setForwardMsg] = useState<ChatMsg | null>(null);
  // Message id whose reaction list ("who reacted with what") is open
  const [reactionSheet, setReactionSheet] = useState<string | null>(null);
  const [reportGroupOpen, setReportGroupOpen] = useState(false);
  // Other DM party's presence (last_seen_at), kept live via realtime + a ticker.
  const [otherLastSeen, setOtherLastSeen] = useState<string | null>(other.lastSeenAt ?? null);
  const [, forcePresenceTick] = useState(0);
  // User ids currently typing (others only) — driven by realtime broadcast.
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastTypingSent = useRef(0);
  // User ids currently recording a voice note (others only) — same channel,
  // a separate event so it doesn't interfere with the typing timers.
  const [recordingIds, setRecordingIds] = useState<string[]>([]);
  const recordingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const showToast = useToast();
  const [callChooser, setCallChooser] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [starBurstId, setStarBurstId] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [attachment, setAttachment] = useState<{
    file: File;
    /** Object URL for image/video thumbnails; empty for documents. */
    preview: string;
    type: "image" | "video" | "document";
    /** View-once only ever applies to images — the private bucket accepts
     *  image mimes only (see oneshot-media in 0033_oneshot.sql). */
    viewOnce: boolean;
  } | null>(null);
  // Which attachment sheet option was chosen — read by pickFile to validate
  // the file against that intent, since one hidden <input> serves all three.
  // The paperclip's sheet: camera, this chat's photos, your gallery.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attachMenu, setAttachMenu] = useState(false);
  const pickerApi = useRef<MediaPickerApi>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const attachHold = useRef<{ timer: ReturnType<typeof setTimeout> | null; opened: boolean }>({ timer: null, opened: false });
  const [albumView, setAlbumView] = useState<{ album: Album; start: number; senderId: string; at: string } | null>(null);
  // A sending folder's files, by its temp id, kept until they are uploaded so
  // a failed upload can be retried.
  const albumFiles = useRef(new Map<string, AlbumFile[]>());
  const pickMode = useRef<"oneshot" | "document">("document");
  const [uploading, setUploading] = useState(false);
  // Local-only, per-mount reveal state for OneShot bubbles: which message ids
  // the viewer has tapped to open. Not persisted — if they leave and come
  // back, tapping again just hits /api/oneshot again, which correctly 404s
  // once the server-side claim is already consumed (that's the guarantee).
  const [oneshotView, setOneshotView] = useState<Record<string, "loading" | "loaded" | "gone">>({});
  const [muted, setMuted] = useState(false);
  const { startCall } = useCallControls();
  const { startGroupCall } = useGroupCall();

  function placeGroupCall(type: "audio" | "video") {
    const others = (group?.members ?? [])
      .filter((m) => m.id !== currentUserId)
      .map((m) => ({ id: m.id, name: m.name, hue: m.hue, avatarUrl: m.avatarUrl }));
    if (others.length === 0) return;
    startGroupCall({ conversationId, title: group?.title ?? "Group call", type, members: others });
  }

  // Load my mute state for this conversation
  useEffect(() => {
    supabase
      .from("conversation_members")
      .select("muted_at")
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId)
      .maybeSingle()
      .then(({ data }) => setMuted(!!data?.muted_at));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId]);

  async function toggleMute() {
    setHeaderMenu(false);
    const next = !muted;
    setMuted(next);
    const { error } = await supabase
      .from("conversation_members")
      .update({ muted_at: next ? new Date().toISOString() : null })
      .eq("conversation_id", conversationId)
      .eq("user_id", currentUserId);
    if (error) {
      setMuted(!next);
      showToast("Couldn't update mute");
      return;
    }
    showToast(next ? "Notifications muted" : "Notifications unmuted");
  }

  async function blockUser() {
    setHeaderMenu(false);
    const { error } = await supabase.rpc("block_message_request", { p_conversation_id: conversationId });
    if (error) {
      showToast("Couldn't block user");
      return;
    }
    showToast("Blocked & reported");
    setTimeout(() => router.push("/messages"), 600);
  }

  const [confirmLeave, setConfirmLeave] = useState(false);

  async function leaveConversation() {
    const { error } = await supabase.rpc("leave_conversation", { p_conversation_id: conversationId });
    setConfirmLeave(false);
    if (error) {
      showToast(isGroup ? "Couldn't leave group" : "Couldn't delete chat");
      return;
    }
    showToast(isGroup ? "Left group" : "Chat deleted");
    setTimeout(() => router.push("/messages"), 500);
  }
  function placeCall(type: "audio" | "video") {
    startCall({ conversationId, peerId: other.id, peerName: other.name, peerHue: other.hue, type });
  }
  const endRef = useRef<HTMLDivElement>(null);

  // Android shortens the window when the keyboard opens, which leaves a chat
  // that was pinned to the newest message no longer showing it.
  useKeyboardInset(() => endRef.current?.scrollIntoView({ block: "end" }));
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const unreadDividerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);
  // null = not resolved yet. Resolved with a fresh client-side read of
  // last_read_at right before marking the thread read (see effect below),
  // so the unread boundary always reflects the true pre-visit state.
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  // Reverse pagination: load older messages in chunks as the user scrolls up.
  const [hasMore, setHasMore] = useState(initialMessages.length >= MSG_PAGE);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const loadingOlderRef = useRef(false);
  // scrollHeight captured right before a prepend, so the layout effect can
  // restore the viewport to the same message (no jump).
  const prependRestore = useRef<number | null>(null);
  // Set while a prepend is in flight so the auto-scroll effect knows this
  // messages change is older history, not a new message at the end.
  const justPrepended = useRef(false);
  // Last message id we've already auto-scrolled to — lets us tell a genuine
  // new message at the end from a prepend or an in-place hydration.
  const prevLastIdRef = useRef<string | null>(null);
  // Whether the user is near the bottom (updated on scroll) — gates whether
  // an incoming message yanks the view down.
  const nearBottomRef = useRef(true);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const idsRef = useRef<string[]>([]);
  const messagesRef = useRef<ChatMsg[]>(initialMessages);
  /** Tracks the last tap per message to detect double-tap (star reaction) */
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLInputElement>(null);
  idsRef.current = messages.map((m) => m.id);
  messagesRef.current = messages;

  // Ids present at load (or prepended as older history) — used to animate ONLY
  // messages that arrive live afterwards, so the initial history doesn't all
  // animate in a jarring cascade on open.
  const seenAtLoadRef = useRef<Set<string>>(new Set(initialMessages.map((m) => m.id)));

  const byId = useMemo(() => {
    const m = new Map<string, ChatMsg>();
    messages.forEach((x) => m.set(x.id, x));
    return m;
  }, [messages]);

  // emoji Ã¢â€ â€™ { count, mine } per message
  const reactionsByMsg = useMemo(() => {
    const out = new Map<string, { emoji: string; count: number; mine: boolean }[]>();
    const tmp = new Map<string, Map<string, { count: number; mine: boolean }>>();
    for (const r of reactions) {
      if (!tmp.has(r.message_id)) tmp.set(r.message_id, new Map());
      const em = tmp.get(r.message_id)!;
      const cur = em.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === currentUserId) cur.mine = true;
      em.set(r.emoji, cur);
    }
    for (const [mid, em] of tmp) out.set(mid, [...em.entries()].map(([emoji, v]) => ({ emoji, ...v })));
    return out;
  }, [reactions, currentUserId]);

  /** Derives the display status for one of my outgoing messages. */
  function getMsgStatus(m: ChatMsg): MsgStatus {
    if (m._status === "failed") return "failed";
    if (m._status === "pending") return "pending";
    // "Seen" means everyone who could have read it, has.
    //
    // This was gated on !isGroup, so a group message could only ever say
    // "sent" — and the realtime handler behind it stored ONE scalar for the
    // whole conversation, so in a group any single member's read would have
    // clobbered it anyway. Per-member state fixes both.
    //
    // Anyone with "Hide read receipts" on (migration 0032) is left out of the
    // test rather than counted as unread: otherwise one person's privacy
    // setting would permanently withhold the tick from everybody else. If they
    // are the only other participant there is nobody left to count, and the
    // message correctly never reads as seen.
    if (everyoneHasRead(readers, m.created_at)) return "seen";
    return "sent";
  }

  // Restore the viewport after older messages are prepended, before paint,
  // so the message the user was reading stays put instead of jumping.
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (prependRestore.current != null && container) {
      container.scrollTop = container.scrollHeight - prependRestore.current;
      prependRestore.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (firstUnreadIndex === null) return; // not resolved yet — see mark-as-read effect below

    // After the first landing, only auto-scroll for a genuinely new message
    // at the end — never for a prepend (older history) or an in-place
    // hydration (post/shot preview filling in).
    if (initialScrollDone.current) {
      // A prepend (older history) changed `messages` but added nothing at the
      // end — never auto-scroll; the layout effect restores the position.
      if (justPrepended.current) {
        justPrepended.current = false;
        prevLastIdRef.current = messages[messages.length - 1]?.id ?? null;
        return;
      }
      const lastId = messages[messages.length - 1]?.id ?? null;
      if (lastId !== prevLastIdRef.current) {
        const last = messages[messages.length - 1];
        prevLastIdRef.current = lastId;
        // Mine, or I'm already near the bottom → follow the conversation down.
        if (last && (last.sender_id === currentUserId || nearBottomRef.current)) {
          endRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      }
      return;
    }

    // Initial landing. Pin to the unread divider (if any) or the bottom.
    // Media (images, GIFs, videos, shared post/shot cards) loads async and
    // grows the layout downward — a single pin lands on a not-yet-grown
    // layout (i.e. near the top), so we re-pin across a few frames and on
    // every media load until things settle.
    const container = scrollContainerRef.current;
    if (!container) return;

    const pin = () => {
      const divider = unreadDividerRef.current;
      if (divider) divider.scrollIntoView({ behavior: "auto", block: "center" });
      else container.scrollTop = container.scrollHeight;
    };

    pin();
    const raf = requestAnimationFrame(pin);
    const media = Array.from(container.querySelectorAll("img, video"));
    media.forEach((m) => { m.addEventListener("load", pin); m.addEventListener("loadeddata", pin); });
    const settle = setTimeout(() => {
      pin();
      initialScrollDone.current = true;
      prevLastIdRef.current = messages[messages.length - 1]?.id ?? null;
      media.forEach((m) => { m.removeEventListener("load", pin); m.removeEventListener("loadeddata", pin); });
    }, 600);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      media.forEach((m) => { m.removeEventListener("load", pin); m.removeEventListener("loadeddata", pin); });
    };
  }, [messages, firstUnreadIndex]);

  // Close the long-press menu on Escape.
  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenu(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  useEffect(() => {
    let active = true;
    async function resolveUnreadThenMarkRead() {
      // Re-fetch my own read position fresh — don't trust the server-rendered
      // prop alone, since Next's client router cache can serve a stale RSC
      // snapshot from before a previous visit already marked this read.
      const { data } = await supabase
        .from("conversation_members")
        .select("last_read_at")
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId)
        .maybeSingle();
      const lastReadAt = (data as any)?.last_read_at ?? null;
      const idx = initialMessages.findIndex(
        (m) => m.sender_id !== currentUserId && (!lastReadAt || m.created_at > lastReadAt),
      );
      if (active) setFirstUnreadIndex(idx);
      await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    }
    resolveUnreadThenMarkRead();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function hydratePost(msgId: string, postId: string) {
    const { data } = await supabase
      .from("posts")
      .select("id, caption, image_url, image_urls, profiles!posts_user_id_fkey(username, display_name, avatar_hue, avatar_url)")
      .eq("id", postId)
      .maybeSingle();
    if (!data) return;
    const d = data as any;
    const pr = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === msgId
          ? { ...x, post: { id: d.id, caption: d.caption, image_url: d.image_url, image_urls: d.image_urls }, postProfile: pr }
          : x,
      ),
    );
  }

  async function hydrateShot(msgId: string, shotId: string) {
    const { data } = await supabase
      .from("shots")
      .select("id, media_url, caption, profiles(username, display_name, avatar_hue, avatar_url)")
      .eq("id", shotId)
      .maybeSingle();
    if (!data) return;
    const d = data as any;
    const pr = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === msgId ? { ...x, shot: { id: d.id, media_url: d.media_url, caption: d.caption }, shotProfile: pr } : x,
      ),
    );
  }

  /** Fetch the next older page and prepend it, preserving scroll position. */
  async function loadOlder() {
    if (loadingOlderRef.current || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

    const container = scrollContainerRef.current;
    const prevHeight = container ? container.scrollHeight : 0;

    const { data, error } = await supabase
      .from("messages")
      .select(MSG_SELECT)
      .eq("conversation_id", conversationId)
      .lt("created_at", oldest.created_at)
      .order("created_at", { ascending: false })
      .limit(MSG_PAGE);

    if (error) {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
      return;
    }

    const older = (data ?? []).slice().reverse().map(mapMessageRow);
    if (older.length < MSG_PAGE) setHasMore(false);

    if (older.length > 0) {
      // Older history should appear instantly (no entrance animation).
      older.forEach((o) => seenAtLoadRef.current.add(o.id));
      prependRestore.current = prevHeight; // layout effect restores position
      justPrepended.current = true; // auto-scroll effect skips this change
      setMessages((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const fresh = older.filter((o) => !existing.has(o.id));
        return [...fresh, ...prev];
      });

      const ids = older.map((o) => o.id);
      const { data: rx } = await supabase
        .from("message_reactions")
        .select("message_id, user_id, emoji")
        .in("message_id", ids);
      if (rx && rx.length) {
        setReactions((prev) => {
          const have = new Set(prev.map((p) => `${p.message_id}|${p.user_id}|${p.emoji}`));
          const add = (rx as ReactionRow[]).filter((r) => !have.has(`${r.message_id}|${r.user_id}|${r.emoji}`));
          return add.length ? [...prev, ...add] : prev;
        });
      }
    }

    loadingOlderRef.current = false;
    setLoadingOlder(false);
  }

  // Track scroll position: load older near the top, remember near-bottom.
  function onMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (initialScrollDone.current && el.scrollTop < 200 && hasMore && !loadingOlderRef.current) {
      loadOlder();
    }
  }

  // Realtime: messages
  useEffect(() => {
    // Pull whatever arrived after the newest message on screen, and append it.
    // Never replaces what is already shown, so nothing jumps.
    function catchUp() {
      const latest = messagesRef.current.reduce(
        (max, m) => (m.created_at > max ? m.created_at : max),
        "1970-01-01T00:00:00Z",
      );
      supabase
        .from("messages")
        .select(MSG_SELECT)
        .eq("conversation_id", conversationId)
        .gt("created_at", latest)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          const rows = (data ?? []).map(mapMessageRow);
          if (!rows.length) return;
          setMessages((prev) => {
            const have = new Set(prev.map((p) => p.id));
            const add = rows.filter((r) => !have.has(r.id));
            return add.length ? [...prev, ...add] : prev;
          });
        });
    }
    // Back from the background: the socket may not have noticed it was
    // dropped yet, so ask directly instead of waiting for it to rejoin.
    function onVisible() {
      if (document.visibilityState === "visible") catchUp();
    }
    document.addEventListener("visibilitychange", onVisible);

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ChatMsg;
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev; // already have the real row
            // Reconcile my own optimistic temp if the realtime echo wins the
            // race against the send RPC's return — replace it instead of
            // appending a duplicate.
            if (m.sender_id === currentUserId) {
              const tempIdx = prev.findIndex((x) => x.id.startsWith("temp-") && x.kind === m.kind && x.body === m.body);
              if (tempIdx !== -1) {
                const copy = [...prev];
                copy[tempIdx] = { ...m, post: null, _preview: prev[tempIdx]._preview, _localUrl: prev[tempIdx]._localUrl };
                return copy;
              }
            }
            return [...prev, { ...m, post: null }];
          });
          if (m.kind === "post" && m.post_id) hydratePost(m.id, m.post_id);
          if (m.kind === "shot" && m.shot_id) hydrateShot(m.id, m.shot_id);
          if (m.sender_id !== currentUserId) supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId }).then(() => {});
          // Theme changes are announced as a system message; that is the cue
          // to redraw, for whoever did not make the change.
          if (m.kind === "system") {
            supabase.from("conversations").select("theme").eq("id", conversationId).maybeSingle()
              .then(({ data }) => { if (data) setThemeId(data.theme ?? null); });
          }
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ChatMsg;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        })
      .subscribe((status) => {
        // On (re)subscribe — including after a dropped connection — pull any
        // messages that arrived while we were offline so nothing is missed.
        if (status === "SUBSCRIBED") catchUp();
      });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  // Realtime: reactions (refetch the affected set on any change)
  useEffect(() => {
    const ch = supabase
      .channel(`reacts:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        const ids = idsRef.current;
        if (!ids.length) return;
        supabase
          .from("message_reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", ids)
          .then(({ data }) => setReactions((data ?? []) as ReactionRow[]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, supabase]);

  // Realtime: everyone else's read receipts -- drives the "Seen" double-tick.
  //
  // The old version early-returned unless other.id was set, which is empty in
  // a group, and then wrote whichever member's row arrived into a single
  // shared value. Now each member is tracked separately, so three people
  // reading at different times can't overwrite each other.
  useEffect(() => {
    const ch = supabase
      .channel(`read:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string | null };
          if (row.user_id === currentUserId) return;
          setReaders((prev) => {
            const i = prev.findIndex((r) => r.userId === row.user_id);
            // A member who joined after this page loaded still counts.
            if (i === -1) {
              return [
                ...prev,
                { userId: row.user_id, lastReadAt: row.last_read_at ?? null, hideReadReceipts: false },
              ];
            }
            const next = [...prev];
            next[i] = { ...next[i], lastReadAt: row.last_read_at ?? null };
            return next;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, currentUserId, supabase]);

  // Realtime: typing indicators (ephemeral broadcast, no DB writes)
  useEffect(() => {
    const ch = supabase.channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } });
    const forget = (uid: string) => {
      setTypingIds((prev) => prev.filter((x) => x !== uid));
      const t = typingTimers.current.get(uid);
      if (t) { clearTimeout(t); typingTimers.current.delete(uid); }
    };
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      const uid = (payload as { userId?: string })?.userId;
      if (!uid || uid === currentUserId) return;
      setTypingIds((prev) => (prev.includes(uid) ? prev : [...prev, uid]));
      const existing = typingTimers.current.get(uid);
      if (existing) clearTimeout(existing);
      typingTimers.current.set(uid, setTimeout(() => forget(uid), 4000));
    });
    ch.on("broadcast", { event: "stop" }, ({ payload }) => {
      const uid = (payload as { userId?: string })?.userId;
      if (uid) forget(uid);
    });
    const forgetRecording = (uid: string) => {
      setRecordingIds((prev) => prev.filter((x) => x !== uid));
      const t = recordingTimers.current.get(uid);
      if (t) { clearTimeout(t); recordingTimers.current.delete(uid); }
    };
    // Single event carries both start and stop (payload.recording), unlike
    // typing/stop — recording state changes are explicit transitions (start,
    // pause, resume, send, cancel), not a per-keystroke stream, so there's no
    // need for two event names.
    ch.on("broadcast", { event: "recording" }, ({ payload }) => {
      const p = payload as { userId?: string; recording?: boolean };
      if (!p.userId || p.userId === currentUserId) return;
      if (p.recording) {
        setRecordingIds((prev) => (prev.includes(p.userId!) ? prev : [...prev, p.userId!]));
        const existing = recordingTimers.current.get(p.userId!);
        if (existing) clearTimeout(existing);
        // Longer grace period than typing — voice notes can run a couple
        // minutes, and this timer is only a safety net for a missed "stop".
        recordingTimers.current.set(p.userId!, setTimeout(() => forgetRecording(p.userId!), 8000));
      } else {
        forgetRecording(p.userId);
      }
    });
    ch.subscribe();
    typingChannelRef.current = ch;
    return () => {
      typingTimers.current.forEach((t) => clearTimeout(t));
      typingTimers.current.clear();
      recordingTimers.current.forEach((t) => clearTimeout(t));
      recordingTimers.current.clear();
      supabase.removeChannel(ch);
      typingChannelRef.current = null;
    };
  }, [conversationId, currentUserId, supabase]);

  // Realtime: the other DM party's last_seen_at (presence). Plus a 30s ticker
  // so "Active 4m ago" stays current without new events.
  useEffect(() => {
    if (isGroup || !other.id || other.showActivity === false) return;
    const ch = supabase
      .channel(`presence:${other.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${other.id}` },
        (payload) => {
          const row = payload.new as { last_seen_at?: string | null; show_activity?: boolean };
          if (row.show_activity === false) { setOtherLastSeen(null); return; }
          if (row.last_seen_at) setOtherLastSeen(row.last_seen_at);
        })
      .subscribe();
    const ticker = setInterval(() => forcePresenceTick((n) => n + 1), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(ticker); };
  }, [isGroup, other.id, other.showActivity, supabase]);

  // When someone starts typing or recording and you're already near the
  // bottom, nudge the view down so the indicator is visible.
  useEffect(() => {
    if ((typingIds.length > 0 || recordingIds.length > 0) && nearBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [typingIds.length, recordingIds.length]);

  function emitTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < 1500) return; // throttle
    lastTypingSent.current = now;
    typingChannelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: currentUserId } });
  }
  function emitStopTyping() {
    lastTypingSent.current = 0;
    typingChannelRef.current?.send({ type: "broadcast", event: "stop", payload: { userId: currentUserId } });
  }
  function emitRecording(recording: boolean) {
    typingChannelRef.current?.send({ type: "broadcast", event: "recording", payload: { userId: currentUserId, recording } });
  }

  /** Resolve a typing user's display name (group member, the other DM party). */
  function typingLabel(ids: string[]) {
    const names = ids.map((id) => members?.[id]?.name ?? (id === other.id ? other.name : "Someone"));
    if (names.length === 1) return `${names[0]} is typing…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
    return `${names[0]} and ${names.length - 1} others are typing…`;
  }

  function recordingLabel(ids: string[]) {
    const names = ids.map((id) => members?.[id]?.name ?? (id === other.id ? other.name : "Someone"));
    if (names.length === 1) return `${names[0]} is recording a voice message…`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are recording voice messages…`;
    return `${names[0]} and ${names.length - 1} others are recording…`;
  }

  function toggleReaction(messageId: string, emoji: string) {
    setReactions((prev) => {
      const mineRow = prev.find((r) => r.message_id === messageId && r.user_id === currentUserId);
      const without = prev.filter((r) => !(r.message_id === messageId && r.user_id === currentUserId));
      if (mineRow && mineRow.emoji === emoji) return without;
      return [...without, { message_id: messageId, user_id: currentUserId, emoji }];
    });
    supabase.rpc("toggle_reaction", { p_message_id: messageId, p_emoji: emoji }).then(() => {});
  }

  async function send() {
    if (editing) { await saveEdit(); return; }
    const body = text.trim();
    if (!body || sending) return;
    haptics.tap();
    setSending(true);
    setText("");
    emitStopTyping();
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body, sender_id: currentUserId, kind: "text",
      post_id: null, reply_to_id: replyId, is_unsent: false, created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: body ?? undefined, p_kind: "text", p_post_id: undefined, p_reply_to_id: replyId ?? undefined,
    });
    if (error || !data) {
      // Keep message visible but mark it failed
      setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, _status: "failed" as const } : m)));
      showToast("Couldn't send. Try again.");
    } else {
      const real = data as ChatMsg;
      // If the realtime echo already added the real row, just drop the temp.
      setMessages((p) =>
        p.some((m) => m.id === real.id)
          ? p.filter((m) => m.id !== tempId)
          : p.map((m) => (m.id === tempId ? { ...m, ...real, _status: undefined } : m)),
      );
    }
    setSending(false);
  }

  /**
   * Re-send a message that previously failed (tap the failed bubble).
   *
   * This used to bail on anything that wasn't text, and the retry affordance
   * was gated the same way — so a photo, video, document, GIF or voice note
   * that failed showed a red tick with nothing to do about it. The file had
   * already uploaded successfully in every one of those cases; only the RPC
   * had failed, which is the easiest thing in the world to retry.
   *
   * Nothing is re-uploaded: the body already holds the public URL (or the
   * JSON wrapper for documents and voice notes), and a OneShot's private
   * storage path is carried on the optimistic message for exactly this.
   */
  async function retrySend(failed: ChatMsg) {
    const files = albumFiles.current.get(failed.id);
    if (files) {
      void deliverMedia(failed.id, files, failed._caption ?? "", failed.reply_to_id);
      return;
    }
    // A OneShot has no body by design — the image is private.
    if (!failed.body && failed.kind !== "oneshot") return;
    setMessages((p) => p.map((m) => (m.id === failed.id ? { ...m, _status: "pending" as const } : m)));
    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: failed.body ?? undefined,
      p_kind: failed.kind,
      p_post_id: failed.post_id ?? undefined,
      p_shot_id: failed.shot_id ?? undefined,
      p_reply_to_id: failed.reply_to_id ?? undefined,
      p_storage_path: failed._storagePath ?? undefined,
    });
    if (error || !data) {
      setMessages((p) => p.map((m) => (m.id === failed.id ? { ...m, _status: "failed" as const } : m)));
      showToast("Still couldn't send. Check your connection.");
    } else {
      const real = data as ChatMsg;
      setMessages((p) =>
        p.some((m) => m.id === real.id)
          ? p.filter((m) => m.id !== failed.id)
          : p.map((m) => (m.id === failed.id ? { ...m, ...real, _status: undefined } : m)),
      );
    }
  }

  /** Upload voice blob to Supabase Storage and send as a voice message. */
  async function sendVoice(blob: Blob, durationSecs: number) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setVoiceMode(false); return; }

    const ext = blob.type.includes("ogg") ? "ogg" : "webm";
    const path = `${user.id}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("voice-notes")
      .upload(path, blob, { contentType: blob.type, upsert: false });

    if (uploadErr) {
      showToast("Couldn't upload voice note. Try again.");
      setVoiceMode(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("voice-notes")
      .getPublicUrl(path);

    // Store as JSON so the player knows the pre-stored duration (avoids
    // waiting for audio metadata to load before showing a duration).
    const body = JSON.stringify({ url: publicUrl, duration: durationSecs });
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);

    // Voice was the only send path with no optimistic message at all. On a
    // failure it showed a toast and dropped the recording — which was
    // unrecoverable, since the blob is gone once the recorder resets, while
    // the uploaded file stayed orphaned in the bucket. Now it behaves like
    // every other kind: a bubble you can tap to retry, pointing at the audio
    // that is already uploaded.
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body, sender_id: currentUserId, kind: "voice",
      post_id: null, reply_to_id: replyId, is_unsent: false,
      created_at: new Date().toISOString(), _status: "pending",
    };
    setMessages((p) => [...p, optimistic]);
    setVoiceMode(false);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: body ?? undefined,
      p_kind: "voice",
      p_post_id: undefined,
      p_reply_to_id: replyId ?? undefined,
    });

    if (error || !data) {
      setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, _status: "failed" as const } : m)));
      showToast("Couldn't send voice note. Tap it to retry.");
      return;
    }
    const real = data as ChatMsg;
    setMessages((p) =>
      p.some((m) => m.id === real.id)
        ? p.filter((m) => m.id !== tempId)
        : p.map((m) => (m.id === tempId ? { ...m, ...real, _status: undefined } : m)),
    );
  }

  /** Send a GIF (selected from the picker) as a message. */
  async function sendGif(gifUrl: string) {
    setGifPickerOpen(false);
    if (sending) return;
    setSending(true);
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body: gifUrl, sender_id: currentUserId, kind: "gif",
      post_id: null, reply_to_id: replyId, is_unsent: false,
      created_at: new Date().toISOString(), _status: "pending",
    };
    setMessages((p) => [...p, optimistic]);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: gifUrl, p_kind: "gif",
      p_post_id: undefined, p_reply_to_id: replyId ?? undefined,
    });
    if (error || !data) {
      setMessages((p) => p.map((m) => m.id === tempId ? { ...m, _status: "failed" as const } : m));
      showToast("Couldn't send GIF.");
    } else {
      const real = data as ChatMsg;
      setMessages((p) => p.some((m) => m.id === real.id) ? p.filter((m) => m.id !== tempId) : p.map((m) => m.id === tempId ? { ...m, ...real, _status: undefined } : m));
    }
    setSending(false);
  }

  /** Handle file input change — validate against the chosen mode, build a
   *  preview, and stage the attachment. */
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    if (!file) return;
    setGifPickerOpen(false);

    const mode = pickMode.current;
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (mode === "document") {
      // accept="" filters most of this in the picker, but a determined user
      // can still choose "All files" on some platforms — and the bucket's
      // mime allowlist would reject it server-side with a cryptic error, so
      // catch it here with a message that actually says what happened.
      if (isImage || isVideo) {
        showToast("That's a photo or video — use Photo or video instead.");
        return;
      }
      if (!DOC_MIMES.includes(file.type)) {
        showToast("That file type can't be sent.");
        return;
      }
      if (file.size > 25 * 1024 * 1024) {
        showToast("Document is too large (max 25MB).");
        return;
      }
      setAttachment({ file, preview: "", type: "document", viewOnce: false });
      return;
    }

    if (!isVideo && !isImage) { showToast("Only photos and videos can be sent."); return; }
    if (mode === "oneshot" && !isImage) {
      showToast("View once works with photos only.");
      return;
    }
    const maxMb = isVideo ? 50 : 10;
    if (file.size > maxMb * 1024 * 1024) {
      showToast(`${isVideo ? "Video" : "Photo"} is too large (max ${maxMb}MB).`);
      return;
    }
    const preview = URL.createObjectURL(file);
    setAttachment({
      file, preview,
      type: isVideo ? "video" : "image",
      viewOnce: mode === "oneshot",
    });
  }

  /** Recent photos and videos in this chat, newest first, for the picker. */
  const chatMedia = useMemo(() => {
    const seen = new Set<string>();
    const out: AlbumItem[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < 60; i--) {
      const m = messages[i];
      if (m.is_unsent || m.id.startsWith("temp-")) continue;
      const items: AlbumItem[] =
        m.kind === "album"
          ? parseAlbum(m.body)?.items ?? []
          : (m.kind === "image" || m.kind === "video") && m.body?.startsWith("http")
            ? [{ url: m.body, type: m.kind }]
            : [];
      for (const it of items) {
        if (seen.has(it.url)) continue;
        seen.add(it.url);
        out.push(it);
      }
    }
    return out;
  }, [messages]);

  /**
   * Send what was chosen in the picker or taken with the camera. It lands in
   * the thread straight away, drawn from this device with the sending dots,
   * and uploads behind the message. Two or more go as a folder with the
   * caption on it; one goes as a photo or video, with the caption as a
   * message after it.
   */
  function sendMedia(entries: PickEntry[], caption: string) {
    if (!entries.length) return;
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);
    const tempId = `temp-${Date.now()}`;
    const files: AlbumFile[] = entries.map((e) => ({ file: e.file, type: e.type, url: e.url }));
    const now = new Date().toISOString();
    if (entries.length > 1) {
      const local = encodeAlbum({ caption, items: entries.map((e) => ({ url: e.url ?? e.preview, type: e.type })) });
      setMessages((p) => [...p, {
        id: tempId, body: local, sender_id: currentUserId, kind: "album",
        post_id: null, reply_to_id: replyId, is_unsent: false,
        created_at: now, _status: "pending", _preview: local, _caption: caption,
      }]);
    } else {
      const e = entries[0];
      setMessages((p) => [...p, {
        id: tempId, body: e.url ?? e.preview, sender_id: currentUserId, kind: e.type,
        post_id: null, reply_to_id: replyId, is_unsent: false,
        created_at: now, _status: "pending", _localUrl: e.preview, _caption: caption,
      }]);
    }
    albumFiles.current.set(tempId, files);
    void deliverMedia(tempId, files, caption, replyId);
  }

  /** Upload what still needs uploading, then send. Also what Retry runs when
   *  the upload never finished. */
  async function deliverMedia(
    tempId: string,
    files: AlbumFile[],
    caption: string,
    replyId: string | null,
  ) {
    const mark = (patch: Partial<ChatMsg>) =>
      setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, ...patch } : m)));
    mark({ _status: "pending" });

    const uploads = await uploadAlbumFiles(files, supabase.storage.from("chat-media"), currentUserId);
    if (!uploads) {
      mark({ _status: "failed" });
      showToast(files.length > 1 ? "Photos didn't upload. Tap Retry." : "Didn't upload. Tap Retry.");
      return;
    }

    const single = uploads.length === 1;
    const kind = single ? uploads[0].type : "album";
    // The real body goes on before the send, so the realtime echo can find
    // this message by it; the picture keeps drawing from the device.
    const body = single ? uploads[0].url : encodeAlbum({ caption, items: uploads });
    mark({ body });
    albumFiles.current.delete(tempId);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: body, p_kind: kind,
      p_post_id: undefined, p_reply_to_id: replyId ?? undefined,
    });
    if (error || !data) {
      mark({ _status: "failed" });
      showToast("Couldn't send. Try again.");
      return;
    }
    const real = data as ChatMsg;
    setMessages((p) => p.some((m) => m.id === real.id) ? p.filter((m) => m.id !== tempId) : p.map((m) => m.id === tempId ? { ...m, ...real, _status: undefined } : m));

    if (single && caption.trim()) {
      const { data: note } = await supabase.rpc("send_message", {
        p_conversation_id: conversationId, p_body: caption.trim(), p_kind: "text",
        p_post_id: undefined, p_reply_to_id: undefined,
      });
      const n = note as ChatMsg | null;
      if (n) setMessages((p) => (p.some((m) => m.id === n.id) ? p : [...p, n]));
    }
  }

  /** Open the OS picker for one of the sheet's options. */
  function cancelAttachHold() {
    const h = attachHold.current;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
  }

  function openPicker(mode: "oneshot" | "document") {
    pickMode.current = mode;
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = mode === "document" ? DOC_ACCEPT : "image/*";
    input.click();
  }

  /** Upload the staged attachment to Supabase Storage and send as a message. */
  async function sendAttachment() {
    if (!attachment || uploading) return;
    setUploading(true);

    const ext = attachment.file.name.split(".").pop()
      ?? (attachment.type === "video" ? "mp4" : "jpg");
    const path = `${currentUserId}/${Date.now()}.${ext}`;
    const isOneShot = attachment.viewOnce && attachment.type === "image";

    // OneShot goes to the private bucket (no public URL exists for it — the
    // whole point). Everything else keeps the existing public-bucket path.
    const { error: uploadErr } = await supabase.storage
      .from(isOneShot ? "oneshot-media" : "chat-media")
      .upload(path, attachment.file, { contentType: attachment.file.type });

    if (uploadErr) {
      showToast("Upload failed. Try again.");
      setUploading(false);
      return;
    }

    const publicUrl = isOneShot
      ? null
      : supabase.storage.from("chat-media").getPublicUrl(path).data.publicUrl;

    const replyId = replyTo?.id ?? null;
    setReplyTo(null);
    const kind = isOneShot ? "oneshot" : attachment.type; // "oneshot" | "image" | "video" | "document"

    // Documents carry filename + size alongside the URL, mirroring how voice
    // notes already pack {url, duration} into body — no schema change needed.
    const outgoingBody = isOneShot
      ? null
      : attachment.type === "document"
        ? JSON.stringify({ url: publicUrl, name: attachment.file.name, size: attachment.file.size })
        : publicUrl;

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      // The sender's bubble never renders actual image bytes for a OneShot —
      // even they don't get to re-view it after sending (claim_oneshot blocks
      // sender_id === auth.uid()), so there's nothing to preview locally.
      id: tempId, body: outgoingBody, sender_id: currentUserId, kind,
      post_id: null, reply_to_id: replyId, is_unsent: false,
      created_at: new Date().toISOString(), _status: "pending",
      // Kept so a failed OneShot can be retried against the file already in
      // the private bucket, rather than being stranded there.
      _storagePath: isOneShot ? path : undefined,
    };
    setMessages((p) => [...p, optimistic]);
    if (attachment.preview) URL.revokeObjectURL(attachment.preview);
    setAttachment(null);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: outgoingBody ?? undefined,
      p_kind: kind,
      p_post_id: undefined, p_reply_to_id: replyId ?? undefined,
      p_storage_path: isOneShot ? path : undefined,
    });
    if (error || !data) {
      setMessages((p) => p.map((m) => m.id === tempId ? { ...m, _status: "failed" as const } : m));
      showToast("Couldn't send. Try again.");
    } else {
      const real = data as ChatMsg;
      setMessages((p) => p.some((m) => m.id === real.id) ? p.filter((m) => m.id !== tempId) : p.map((m) => m.id === tempId ? { ...m, ...real, _status: undefined } : m));
    }
    setUploading(false);
  }

  function unsend(m: ChatMsg) {
    // Deferred rather than reversed, and here that is not a preference:
    // unsend_message overwrites the body with null. After it runs the text
    // is gone from the server, and the only copy left is the one in this
    // browser — which is exactly what the undo puts back.
    setMessages((p) =>
      p.map((x) => (x.id === m.id ? { ...x, is_unsent: true, body: null } : x))
    );

    const cancel = scheduleUndoable(async () => {
      const { error } = await supabase.rpc("unsend_message", {
        p_message_id: m.id,
      });
      if (error) {
        showToast("Couldn't unsend");
        setMessages((p) => p.map((x) => (x.id === m.id ? m : x)));
      }
    });

    showToast("Unsent", "plain", {
      label: "Undo",
      onClick: () => {
        cancel();
        // Restores the original row wholesale — body, metadata and all.
        setMessages((p) => p.map((x) => (x.id === m.id ? m : x)));
      },
    });
  }

  function startEdit(m: ChatMsg) {
    setEditing(m);
    setReplyTo(null);
    setText(m.kind === "album" ? albumOf(m)?.caption ?? "" : m.body ?? "");
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  async function saveEdit() {
    if (editing?.kind === "album") return saveCaption(editing);
    if (!editing || !text.trim()) return;
    const id = editing.id;
    const newBody = text.trim();
    setMessages((p) => p.map((x) => (x.id === id ? { ...x, body: newBody, edited_at: new Date().toISOString() } : x)));
    setEditing(null);
    setText("");
    const { error } = await supabase.rpc("edit_message", { p_message_id: id, p_body: newBody });
    if (error) showToast("Couldn't edit message");
  }

  /** A folder's caption, which may be cleared. Only the caption changes on
   *  the server; the photos stay what was sent. */
  async function saveCaption(m: ChatMsg) {
    const caption = text.trim().slice(0, ALBUM_CAPTION_MAX);
    const album = parseAlbum(m.body);
    setEditing(null);
    setText("");
    if (!album || caption === album.caption) return;
    const before = messages.find((x) => x.id === m.id);
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, body: encodeAlbum({ ...album, caption }), edited_at: new Date().toISOString() } : x)));
    const { data, error } = await supabase.rpc("edit_album_caption", { p_message_id: m.id, p_caption: caption });
    if (error) {
      if (before) setMessages((p) => p.map((x) => (x.id === m.id ? before : x)));
      showToast("Couldn't change the caption");
    } else if (typeof data === "string") {
      setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, body: data } : x)));
    }
  }

  async function submitReport(reason: string) {
    if (!reportMsg) return;
    const m = reportMsg;
    setReportMsg(null);
    const { error } = await supabase.rpc("report_message", { p_message_id: m.id, p_reason: reason, p_details: undefined });
    showToast(error ? "Report already sent" : "Report sent");
  }

  function copy(m: ChatMsg) {
    if (m.body) { navigator.clipboard.writeText(m.body).catch(() => {}); showToast("Copied"); }
  }

  // Long-press Ã¢â€ â€™ context menu
  function onPressStart(m: ChatMsg, e: React.PointerEvent) {
    if (m.is_unsent) return;

    // ── Double-tap → ⭐ star reaction ────────────────────────────────────────
    // 300ms window fires before the 420ms long-press, so no conflict.
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && last.id === m.id && now - last.time < 300) {
      lastTapRef.current = null;
      if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
      toggleReaction(m.id, "⭐");
      setStarBurstId(m.id);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
      setTimeout(() => setStarBurstId(null), 700);
      return;
    }
    lastTapRef.current = { id: m.id, time: now };

    // ── Long-press → context menu ────────────────────────────────────────────
    suppressClick.current = false;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      suppressClick.current = true;
      setMenu({ msg: m, rect });
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
    }, 420);
  }
  function onPressEnd() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  return (
    <div data-chat-view className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
      {/* Header */}
      <header className="flex h-[calc(3.5rem+var(--sat))] items-center gap-2 border-b border-border/60 chrome-bar px-2 pt-[var(--sat)]">
        <button type="button" onClick={() => leaveChatAnimated(() => safeBack(router, "/messages"))} aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5">
          <ChevronLeft size={24} />
        </button>
        {isGroup ? (
          <Link href={`/messages/${conversationId}/info`} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[30%]"
              style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}>
              <Users size={18} className="text-white/95" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{group!.title}</p>
              <p className="truncate text-xs text-muted">{group!.memberCount} members</p>
            </div>
          </Link>
        ) : (
          <Link href={`/messages/${conversationId}/info`} className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative shrink-0">
              <AvatarFrame id={other.cosmetics ? visibleDecoration(other.cosmetics) : null} size={36}>
                <Avatar name={other.name} hue={other.hue} size={36} src={other.avatarUrl ?? undefined} />
              </AvatarFrame>
              <PresenceDot lastSeenAt={otherLastSeen} size="sm" />
            </div>
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                <DisplayName name={other.name} profile={other.cosmetics} className="truncate" />
                {other.verified && <VerifiedStar className="h-3.5 w-3.5 shrink-0 text-verified" />}
              </p>
              {(() => {
                const pres = presenceLabel(otherLastSeen);
                if (pres) return <p className={`truncate text-xs ${pres.status === "online" ? "text-green-500" : pres.status === "idle" ? "text-yellow-400" : "text-muted"}`}>{pres.text}</p>;
                return other.username ? <p className="truncate text-xs text-muted">@{other.username}</p> : null;
              })()}
            </div>
          </Link>
        )}

        {/* Right actions: call + options */}
        <div className="relative flex shrink-0 items-center gap-0.5">
          {(!isGroup || (group?.members?.length ?? 0) > 1) && (
            <button type="button" onClick={() => { setHeaderMenu(false); setCallChooser((v) => !v); }} aria-label="Call"
              className={`flex h-10 w-10 items-center justify-center rounded-full hover:bg-white/5 ${callChooser ? "text-accent" : "text-foreground"}`}>
              <Phone size={20} />
            </button>
          )}
          <button type="button" onClick={() => { setCallChooser(false); setHeaderMenu((v) => !v); }} aria-label="Options"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5">
            <MoreVertical size={20} />
          </button>

          {/* Call type popover -- anchored to the phone icon */}
          <FloatingMenu
            open={callChooser}
            onClose={() => setCallChooser(false)}
            className="absolute right-9 top-12 w-44"
          >
            <MenuItem icon={Phone} active label="Audio call" onClick={() => { setCallChooser(false); isGroup ? placeGroupCall("audio") : placeCall("audio"); }} />
            <MenuItem icon={Video} active label="Video call" onClick={() => { setCallChooser(false); isGroup ? placeGroupCall("video") : placeCall("video"); }} />
          </FloatingMenu>

          <FloatingMenu
            open={headerMenu}
            onClose={() => setHeaderMenu(false)}
            className="absolute right-1 top-12 w-52"
          >
            {!isGroup && other.username && (
              <MenuItem icon={UserCircle} label="View profile" onClick={() => { setHeaderMenu(false); router.push(`/u/${other.username}`); }} />
            )}
            {isGroup && (
              <MenuItem icon={Users} label="Group info" onClick={() => { setHeaderMenu(false); router.push(`/messages/${conversationId}/info`); }} />
            )}
            <MenuItem
              icon={BellOff}
              active={muted}
              label={muted ? "Unmute notifications" : "Mute notifications"}
              onClick={toggleMute}
            />
            <MenuItem
              icon={LogOut}
              label={isGroup ? "Leave group" : "Delete chat"}
              onClick={() => { setHeaderMenu(false); setConfirmLeave(true); }}
            />
            <MenuDivider />
            {isGroup ? (
              <MenuItem icon={Ban} danger label="Report group" onClick={() => { setHeaderMenu(false); setReportGroupOpen(true); }} />
            ) : (
              <MenuItem icon={Ban} danger label="Block user" onClick={blockUser} />
            )}
          </FloatingMenu>
        </div>
      </header>

      {/* Messages — clicking here closes the GIF picker */}
      <div
        ref={scrollContainerRef}
        onScroll={onMessagesScroll}
        className="relative isolate flex-1 overflow-y-auto px-4 py-4"
        style={theme ? { background: theme.background } : undefined}
        onClick={() => { if (gifPickerOpen) setGifPickerOpen(false); }}
      >
        {theme?.ambient && <ChatAmbient kind={theme.ambient} />}
        {/* Older-history loader — appears at the top while a chunk loads in */}
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            {isGroup ? (
              <span className="flex h-16 w-16 items-center justify-center rounded-[30%]"
                style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}>
                <Users size={30} className="text-white/95" />
              </span>
            ) : (
              <Avatar name={other.name} hue={other.hue} size={64} src={other.avatarUrl ?? undefined} />
            )}
            <p className="mt-2 text-sm font-semibold">{isGroup ? group!.title : other.name}</p>
            <p className="text-xs text-muted">
              {isGroup ? `${group!.memberCount} members` : "This is the start of your conversation."}
            </p>
            {!isGroup && (
              <button
                type="button"
                onClick={() => { setText("hey 👋"); composerRef.current?.focus(); }}
                className="mt-2 rounded-pill border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-transform active:scale-95"
              >
                Say hi 👋
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m, i) => {
              const mine = m.sender_id === currentUserId;
              const prev = messages[i - 1];
              const next = messages[i + 1];
              const replied = m.reply_to_id ? byId.get(m.reply_to_id) : null;
              const newDay = !prev || !sameDay(prev.created_at, m.created_at);
              const showSender = isGroup && !mine && (!prev || prev.sender_id !== m.sender_id || newDay);
              const showTime =
                !next ||
                next.sender_id !== m.sender_id ||
                !sameDay(next.created_at, m.created_at) ||
                new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60 * 1000;
              const reacts = reactionsByMsg.get(m.id) ?? [];
              // The sender's own bubble style, else this side of the chat theme.
              const look = resolveBubble({ mine, senderStyleId: bubbleStyles[m.sender_id], theme });
              const lookCss = look ? bubbleCss(look.bubble) : null;
              // Animate only messages that arrived after the initial load.
              const isNew = !seenAtLoadRef.current.has(m.id);

              return (
                <div key={m.id} className={isNew ? "animate-msg-in" : undefined}>
                  {i === firstUnreadIndex && (
                    <div ref={unreadDividerRef} className="flex items-center gap-2 py-2">
                      <span className="h-px flex-1 bg-accent/30" />
                      <span className="rounded-full bg-accent/15 px-3 py-1 text-[11px] font-bold text-accent">
                        Unread messages
                      </span>
                      <span className="h-px flex-1 bg-accent/30" />
                    </div>
                  )}
                  {newDay && (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-muted">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  {m.kind === "system" ? (
                    /* Chat-settings notices (screenshot alert / vanish mode /
                       auto-delete) — an event the THREAD reports, not something
                       either person "said". No sender chrome, no bubble tail,
                       no read tick: it isn't a message, so it can't be unsent,
                       replied to, or "seen". Centered and bold like Instagram's
                       system notices, but in Hypefy's own voice — the accent
                       lime dot instead of a generic gray box. */
                    <div className="flex justify-center px-6 py-1">
                      <p className="max-w-[85%] text-center text-[11px] font-bold leading-snug text-muted">
                        <span className="mr-1 text-accent">•</span>
                        {m.body}
                      </p>
                    </div>
                  ) : (
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
                      {showSender && (
                        <span className="mb-0.5 px-1 text-[11px] font-semibold text-muted">{senderName(m.sender_id)}</span>
                      )}
                      {replied && (
                        <div className="mb-0.5 max-w-full truncate rounded-lg border-l-2 border-accent/60 bg-surface px-2 py-1 text-[11px] text-muted">
                          <span className="font-semibold">{senderName(replied.sender_id)}</span>
                          {": "}
                          {msgSnippet(replied)}
                        </div>
                      )}

                      {/* Bubble */}
                      {m.is_unsent ? (
                        /* Unsent — time embedded inside at bottom-right */
                        <div className={`relative min-w-[80px] rounded-2xl border border-border px-3.5 pt-2 pb-5 text-sm italic text-faint ${mine ? "rounded-br-md" : "rounded-bl-md"}`}>
                          {mine ? "You unsent this message" : "This message was unsent"}
                          <span className="absolute bottom-1.5 right-2.5 text-[9px] font-medium leading-none text-faint/60">
                            {timeLabel(m.created_at)}
                          </span>
                        </div>
                      ) : m.kind === "post" && m.post ? (
                        <Link
                          href={`/p/${m.post.id}`}
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onClick={(e) => { if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; } }}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="block w-56 overflow-hidden rounded-2xl border border-border bg-surface"
                        >
                          {(m.post.image_urls?.[0] || m.post.image_url) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.post.image_urls?.[0] || m.post.image_url || ""} alt="" className="aspect-square w-full object-cover" />
                          )}
                          <div className="p-2.5">
                            {m.postProfile?.username && <p className="text-xs font-semibold">@{m.postProfile.username}</p>}
                            {m.post.caption && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{m.post.caption}</p>}
                          </div>
                        </Link>
                      ) : m.kind === "shot" && m.shot ? (
                        <Link
                          href={`/shots/${m.shot.id}`}
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onClick={(e) => { if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; } }}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative block w-40 overflow-hidden rounded-2xl border border-border bg-black"
                        >
                          <video src={m.shot.media_url} className="aspect-[3/4] w-full object-cover" muted playsInline preload="metadata" />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />
                          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                            <Play size={9} className="fill-white" /> Shot
                          </span>
                          <div className="absolute inset-x-0 bottom-0 p-2.5">
                            {m.shotProfile?.username && <p className="text-xs font-bold text-white drop-shadow">@{m.shotProfile.username}</p>}
                            {m.shot.caption && <p className="line-clamp-1 text-[11px] text-white/85 drop-shadow">{m.shot.caption}</p>}
                          </div>
                        </Link>
                      ) : m.kind === "page_reply" && pageSnapshot(m.metadata) ? (
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative select-none"
                        >
                          <PageReplyEmbed
                            page={pageSnapshot(m.metadata)!}
                            body={m.body}
                            mine={mine}
                            // Your reply is to their page; theirs, to yours.
                            owner={mine ? { name: other.name, hue: other.hue, avatarUrl: other.avatarUrl } : null}
                          />
                        </div>
                      ) : m.kind === "oneshot" ? (
                        <OneShotBubble
                          m={m}
                          mine={mine}
                          // Local state (set while this component is mounted)
                          // always wins — a genuinely in-flight "loading" must
                          // not be clobbered by the realtime metadata update
                          // that claim_oneshot fires partway through the same
                          // load. Only fall back to metadata when there's no
                          // local state at all: a fresh mount/reload after a
                          // claim already happened in an earlier session must
                          // not show "Tap to view" for something already spent.
                          view={oneshotView[m.id] ?? (!mine && m.metadata?.oneshot_opened ? "gone" : undefined)}
                          onReveal={() => {
                            setOneshotView((v) => ({ ...v, [m.id]: "loading" }));
                            haptics.tap();
                          }}
                          onLoaded={() => setOneshotView((v) => ({ ...v, [m.id]: "loaded" }))}
                          onGone={() => setOneshotView((v) => ({ ...v, [m.id]: "gone" }))}
                          timeLabel={timeLabel(m.created_at)}
                          statusTick={mine ? <MsgStatusTick status={getMsgStatus(m)} /> : null}
                        />
                      ) : m.kind === "document" && m.body ? (() => {
                        // body is JSON { url, name, size } — same packing as voice.
                        let docUrl = m.body, docName = "Document", docSize: number | undefined;
                        try {
                          const p = JSON.parse(m.body);
                          docUrl = p.url ?? m.body;
                          docName = p.name ?? "Document";
                          docSize = typeof p.size === "number" ? p.size : undefined;
                        } catch { /* pre-JSON row — fall back to the raw URL */ }
                        return (
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onPointerDown={(e) => onPressStart(m, e)}
                            onPointerUp={onPressEnd}
                            onPointerMove={onPressEnd}
                            onPointerLeave={onPressEnd}
                            onClick={(e) => { if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; } }}
                            onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                            className={`relative flex items-center gap-2.5 rounded-2xl px-3 py-2.5 ${
                              mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface text-foreground"
                            }`}
                            style={{ maxWidth: 240 }}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${mine ? "bg-accent-ink/15" : "bg-elevated"}`}>
                              <FileText size={17} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">{docName}</span>
                              <span className={`block text-[10px] ${mine ? "text-accent-ink/70" : "text-muted"}`}>
                                {docSize !== undefined ? fileSize(docSize) : "Tap to open"}
                              </span>
                            </span>
                            <Download size={15} className={`shrink-0 ${mine ? "text-accent-ink/70" : "text-muted"}`} />
                          </a>
                        );
                      })() : (m.kind === "gif" || m.kind === "image") && m.body ? (
                        /* GIF / image — media bubble with time+status pill overlay */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative overflow-hidden rounded-2xl"
                          style={{ width: m.kind === "image" ? MEDIA_W : undefined, maxWidth: MEDIA_W }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m._localUrl ?? m.body} alt={m.kind === "gif" ? "GIF" : ""} className="w-full rounded-2xl object-cover" />
                          {/* GIF badge */}
                          {m.kind === "gif" && (
                            <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white backdrop-blur-sm">
                              GIF
                            </span>
                          )}
                          {/* Time + status pill — dark backdrop ensures readability on any image */}
                          <span className="absolute bottom-1.5 right-2 flex items-center gap-[3px] rounded-full bg-black/50 px-1.5 py-[3px] backdrop-blur-sm">
                            <span className="text-[9px] font-medium leading-none text-white/85">{timeLabel(m.created_at)}</span>
                            {mine && <MsgStatusTick status={getMsgStatus(m)} />}
                          </span>
                          {starBurstId === m.id && (
                            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                              <Star size={44} className="animate-hype-pop fill-current text-hype drop-shadow-[0_2px_12px_rgba(255,208,0,0.7)]" />
                            </span>
                          )}
                        </div>
                      ) : m.kind === "album" && albumOf(m) ? (
                        /* Several photos and videos sent together — the folder */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative"
                        >
                          <MediaFolder
                            album={editing?.id === m.id ? { ...albumOf(m)!, caption: text } : albumOf(m)!}
                            mine={mine}
                            editing={editing?.id === m.id}
                            onOpen={(start) => setAlbumView({ album: albumOf(m)!, start, senderId: m.sender_id, at: m.created_at })}
                          />
                          {starBurstId === m.id && (
                            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                              <Star size={44} className="animate-hype-pop fill-current text-hype drop-shadow-[0_2px_12px_rgba(255,208,0,0.7)]" />
                            </span>
                          )}
                        </div>
                      ) : m.kind === "video" && m.body ? (
                        /* Video bubble — player with time+status overlay */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative overflow-hidden rounded-2xl bg-black"
                          style={{ width: MEDIA_W, maxWidth: "100%" }}
                        >
                          <video src={m._localUrl ?? m.body} className="w-full rounded-2xl" controls playsInline preload="metadata" />
                          <span className="absolute bottom-1.5 right-2 flex items-center gap-[3px] rounded-full bg-black/60 px-1.5 py-[3px] backdrop-blur-sm">
                            <span className="text-[9px] font-medium leading-none text-white/85">{timeLabel(m.created_at)}</span>
                            {mine && <MsgStatusTick status={getMsgStatus(m)} />}
                          </span>
                          {starBurstId === m.id && (
                            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                              <Star size={44} className="animate-hype-pop fill-current text-hype drop-shadow-[0_2px_12px_rgba(255,208,0,0.7)]" />
                            </span>
                          )}
                        </div>
                      ) : m.kind === "voice" && m.body ? (() => {
                        // Parse stored JSON: { url, duration }
                        let voiceUrl = m.body;
                        let voiceDuration: number | undefined;
                        try {
                          const p = JSON.parse(m.body);
                          voiceUrl = p.url ?? m.body;
                          voiceDuration = typeof p.duration === "number" ? p.duration : undefined;
                        } catch {}
                        return (
                          <div
                            onPointerDown={(e) => onPressStart(m, e)}
                            onPointerUp={onPressEnd}
                            onPointerMove={onPressEnd}
                            onPointerLeave={onPressEnd}
                            onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                            className="relative"
                          >
                            <VoiceMessage url={voiceUrl} storedDuration={voiceDuration} mine={mine} />
                            {starBurstId === m.id && (
                              <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                                <Star size={44} className="animate-hype-pop fill-current text-hype drop-shadow-[0_2px_12px_rgba(255,208,0,0.7)]" />
                              </span>
                            )}
                          </div>
                        );
                      })() : (
                        /* Plain text — time + status tick live inside bubble, bottom-right */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className={`relative min-w-[80px] max-w-full cursor-default select-none rounded-2xl px-3.5 pt-2 pb-5 text-sm ${
                            mine ? "rounded-br-md" : "rounded-bl-md"
                          } ${lookCss ? lookCss.className : mine ? "bg-accent text-accent-ink" : "bg-surface text-foreground"} ${
                            look?.decor && showTime ? "mt-3" : ""
                          }`}
                          style={lookCss?.style}
                        >
                          {look?.decor && showTime && <ChatThemeDecor decor={look.decor} mine={mine} />}
                          {m.body}
                          {/* Time + status always at bottom-right inside the bubble */}
                          <span className="absolute bottom-1.5 right-2.5 flex items-center gap-[3px]">
                            {m.edited_at && (
                              <span className={`text-[9px] font-medium italic leading-none ${look ? "" : mine ? "text-accent-ink/45" : "text-faint"}`} style={look ? { color: look.bubble.meta } : undefined}>
                                edited ·
                              </span>
                            )}
                            <span className={`text-[9px] font-medium leading-none ${look ? "" : mine ? "text-accent-ink/45" : "text-faint"}`} style={look ? { color: look.bubble.meta } : undefined}>
                              {timeLabel(m.created_at)}
                            </span>
                            {mine && <MsgStatusTick status={getMsgStatus(m)} />}
                          </span>
                          {/* Double-tap star burst — reuses Hypefy hype-pop keyframe */}
                          {starBurstId === m.id && (
                            <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                              <Star size={44} className="animate-hype-pop fill-current text-hype drop-shadow-[0_2px_12px_rgba(255,208,0,0.7)]" />
                            </span>
                          )}
                        </div>
                      )}

                      {/* Reaction chips */}
                      {reacts.length > 0 && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : "justify-start"}`}>
                          {reacts.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => setReactionSheet(m.id)}
                              className={`animate-react-pop flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[13px] leading-none shadow-sm transition-transform active:scale-90 ${
                                r.mine
                                  ? "bg-accent text-accent-ink ring-1 ring-accent"
                                  : "bg-elevated text-foreground ring-1 ring-white/10"
                              }`}
                            >
                              <span>{r.emoji}</span>
                              {r.count > 1 && <span className="ml-0.5 text-[11px] font-bold">{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* External time+status — for voice, document, post, and shot cards.
                          Plain text, gif, image, and video bubbles embed the time+tick inside themselves. */}
                      {(m.kind === "voice" || m.kind === "document" || m.kind === "album" || m.kind === "page_reply" || (m.kind === "post" && m.post) || (m.kind === "shot" && m.shot)) &&
                        (showTime || (mine && (m._status === "failed" || (m.kind === "album" && m._status === "pending")))) && (
                        <div className={`flex items-center gap-1 px-1 pt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
                          {showTime && (
                            <span className="text-[10px] text-faint">{timeLabel(m.created_at)}</span>
                          )}
                          {mine && <MsgStatusTick status={getMsgStatus(m)} />}
                        </div>
                      )}

                      {/* Tap-to-retry. Was gated on kind === "text", so every
                          failed photo, video, document, GIF and voice note
                          rendered a dead red tick. */}
                      {mine && m._status === "failed" && (
                        <button
                          type="button"
                          onClick={() => retrySend(m)}
                          className="px-1 pt-0.5 text-right text-[10px] font-semibold text-danger hover:underline"
                        >
                          Failed · Tap to retry
                        </button>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}

            {/* Recording indicator takes priority — mutually exclusive with typing
                on the sender's side (voiceMode replaces the text composer). */}
            {recordingIds.length > 0 ? (
              <div className="flex flex-col items-start gap-0.5">
                {isGroup && (
                  <span className="px-1 text-[11px] font-semibold text-muted">{recordingLabel(recordingIds)}</span>
                )}
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3">
                  <Mic size={14} className="text-accent" />
                  <div className="flex h-3 items-end gap-[3px]">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-[3px] animate-mic-wave rounded-full bg-accent"
                        style={{ animationDelay: `${i * 0.12}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Typing indicator — a real incoming chat bubble with bouncing dots */
              typingIds.length > 0 && (
                <div className="flex flex-col items-start gap-0.5">
                  {isGroup && (
                    <span className="px-1 text-[11px] font-semibold text-muted">{typingLabel(typingIds)}</span>
                  )}
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3">
                    {[0, 0.15, 0.3].map((d, i) => (
                      <span key={i} className="h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: `${d}s` }} />
                    ))}
                  </div>
                </div>
              )
            )}

            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background px-3 py-2 pb-[calc(var(--sab)+8px)]">

        {/* ── GIF picker panel — slides in just above the input row ── */}
        {gifPickerOpen && !voiceMode && (
          <div className="mb-2">
            <GifPicker onSelect={sendGif} />
          </div>
        )}

        {/* ── Attachment preview ── */}
        {attachment && !voiceMode && (
          <div className="mb-2 flex flex-col gap-2 rounded-xl border border-border/60 bg-surface p-2">
            <div className="flex items-start gap-2">
              <div className="relative shrink-0">
                {attachment.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : attachment.type === "video" ? (
                  <video src={attachment.preview} className="h-16 w-16 rounded-lg bg-black object-cover" muted playsInline preload="metadata" />
                ) : (
                  /* Documents have no visual preview — show the file glyph. */
                  <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-elevated text-hashtag">
                    <FileText size={24} />
                  </span>
                )}
                {attachment.viewOnce && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink ring-2 ring-surface">
                    <Eye size={11} strokeWidth={2.5} />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 py-1">
                <p className="truncate text-xs font-semibold">{attachment.file.name}</p>
                <p className="text-[10px] text-faint">
                  {attachment.viewOnce
                    ? "View once photo"
                    : `${attachment.type === "document" ? "Document" : attachment.type === "video" ? "Video" : "Photo"} · ${fileSize(attachment.file.size)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { if (attachment.preview) URL.revokeObjectURL(attachment.preview); setAttachment(null); }}
                aria-label="Remove attachment"
                className="shrink-0 text-faint hover:text-muted"
              >
                <X size={16} />
              </button>
            </div>

            {/* Honest disclosure at the point of sending, not hidden behind a
                settings page — the web build has no way to detect or block a
                screenshot at all. */}
            {attachment.viewOnce && (
              <p className="px-0.5 text-[10px] leading-snug text-faint">
                Opens once, then it's gone. Hypefy can't stop someone from screenshotting their screen.
              </p>
            )}
          </div>
        )}

        {/* ── Reply-to banner ── */}
        {replyTo && !voiceMode && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs">
            <Reply size={13} className="text-accent" />
            <span className="min-w-0 flex-1 truncate text-muted">
              Replying to{" "}
              <span className="font-semibold text-foreground">
                {replyTo.sender_id === currentUserId ? "yourself" : senderName(replyTo.sender_id)}
              </span>
              : {msgSnippet(replyTo)}
            </span>
            <button onClick={() => setReplyTo(null)} className="text-faint hover:text-muted"><X size={14} /></button>
          </div>
        )}

        {/* Editing banner */}
        {editing && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs">
            <Pencil size={13} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-muted">
              {editing.kind === "album" ? "Editing caption" : <>Editing: <span className="text-foreground">{editing.body}</span></>}
            </span>
            <button onClick={() => { setEditing(null); setText(""); }} className="text-faint hover:text-muted"><X size={14} /></button>
          </div>
        )}

        {voiceMode ? (
          /* ── Voice recorder ── replaces the input row entirely */
          <VoiceRecorder onSend={sendVoice} onCancel={() => setVoiceMode(false)} onStatusChange={emitRecording} />
        ) : (
          /* ── Text / GIF / attachment composer ── */
          <div className="flex items-center gap-1.5">

            {/* Attachment button. A tap opens the picker sheet (camera, this
                chat's photos, the gallery); holding it, or a right-click,
                opens the quick menu of each kind instead. relative, so the
                menu anchors to the clip itself. */}
            <div className="relative shrink-0">
              <button
                type="button"
                onPointerDown={() => {
                  const h = attachHold.current;
                  h.opened = false;
                  if (h.timer) clearTimeout(h.timer);
                  h.timer = setTimeout(() => {
                    h.opened = true;
                    h.timer = null;
                    haptics.tap();
                    setGifPickerOpen(false);
                    setAttachMenu(true);
                  }, ATTACH_HOLD_MS);
                }}
                onPointerUp={cancelAttachHold}
                onPointerLeave={cancelAttachHold}
                onPointerCancel={cancelAttachHold}
                onContextMenu={(e) => {
                  e.preventDefault();
                  attachHold.current.opened = true;
                  setAttachMenu(true);
                }}
                onClick={() => {
                  // The press that opened the menu doesn't also open the sheet.
                  if (attachHold.current.opened) { attachHold.current.opened = false; return; }
                  setGifPickerOpen(false);
                  if (attachMenu) { setAttachMenu(false); return; }
                  setPickerOpen(true);
                }}
                aria-label="Attach"
                aria-haspopup="dialog"
                aria-expanded={pickerOpen || attachMenu}
                className={`flex h-11 w-10 select-none items-center justify-center rounded-full transition active:scale-90 ${
                  pickerOpen || attachMenu || attachment ? "text-accent" : "text-muted hover:bg-surface hover:text-foreground"
                }`}
                style={{ WebkitTouchCallout: "none" }}
              >
                <Paperclip size={19} className={`transition-transform duration-200 ${attachMenu ? "rotate-45" : ""}`} />
              </button>

              <FloatingMenu
                open={attachMenu}
                onClose={() => setAttachMenu(false)}
                origin="bottom-left"
                exitMs={130}
                bare
                className="absolute bottom-[calc(100%+10px)] left-0 flex w-[190px] flex-col gap-1.5"
              >
                {ATTACH_OPTIONS.map((o, i) => (
                  <button
                    key={o.label}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAttachMenu(false);
                      if (o.mode === "gif") setGifPickerOpen(true);
                      else if (o.mode === "camera") pickerApi.current?.openCamera();
                      else if (o.mode === "media") mediaInputRef.current?.click();
                      else openPicker(o.mode);
                    }}
                    // Staggered bottom-up: the tile nearest the clip appears
                    // first, so the stack reads as rising out of the button.
                    style={{ animationDelay: `${(ATTACH_OPTIONS.length - 1 - i) * 45}ms` }}
                    className="attach-tile animate-row-in group flex items-stretch overflow-hidden rounded-xl border border-border bg-elevated text-left shadow-[0_6px_16px_rgba(0,0,0,0.4)] transition-colors hover:bg-border"
                  >
                    <span className="flex w-9 shrink-0 items-center justify-center border-r border-white/[0.08] text-muted transition-colors group-hover:text-accent">
                      {o.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate px-2.5 py-[9px] text-[13px] font-medium text-foreground">
                      {o.label}
                    </span>
                  </button>
                ))}
              </FloatingMenu>
            </div>

            {/* Text input */}
            <div className="relative flex-1">
              <input
                ref={composerRef}
                value={text}
                onChange={(e) => { setText(e.target.value); setDmCursor(e.target.selectionStart ?? 0); if (e.target.value) emitTyping(); }}
                onSelect={(e) => setDmCursor((e.target as HTMLInputElement).selectionStart ?? 0)}
                onBlur={() => setTimeout(resetPicker, 150)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                placeholder={editing?.kind === "album" ? "Add a caption…" : "Message…"}
                maxLength={editing?.kind === "album" ? ALBUM_CAPTION_MAX : undefined}
                className="h-11 w-full rounded-2xl bg-surface px-4 text-sm outline-none placeholder:text-faint focus:border-white/25"
              />
              <SuggestionDropdown suggestions={pickerSuggestions} onSelect={(s) => {
                const { newValue, newCursor } = applySuggestion(text, dmCursor, s);
                setText(newValue);
                setDmCursor(newCursor);
                resetPicker();
              }} />
            </div>

            {/* GIF toggle — only when no text and no attachment */}
            {!text.trim() && !attachment && !editing && (
              <button
                type="button"
                onClick={() => setGifPickerOpen((v) => !v)}
                aria-label="GIF picker"
                className={`flex h-9 shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] font-black tracking-wider transition active:scale-90 ${
                  gifPickerOpen
                    ? "bg-accent text-accent-ink"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                GIF
              </button>
            )}

            {/* Mic — only when no text and no attachment */}
            {!text.trim() && !attachment && !editing && (
              <button
                type="button"
                onClick={() => { setGifPickerOpen(false); setVoiceMode(true); }}
                aria-label="Record voice note"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition hover:bg-elevated hover:text-foreground active:scale-90"
              >
                <Mic size={20} />
              </button>
            )}

            {/* Send — text (takes priority) or attachment */}
            {(text.trim() || attachment || editing) && (
              <button
                type="button"
                onClick={editing || text.trim() ? send : sendAttachment}
                disabled={sending || uploading}
                aria-label={editing ? "Save changes" : "Send"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
              >
                {uploading ? (
                  <span className="flex gap-[3px]">
                    {[0, 0.1, 0.2].map((d, i) => (
                      <span key={i} className="h-[5px] w-[5px] rounded-full bg-accent-ink animate-dot-bounce"
                        style={{ animationDelay: `${d}s` }} />
                    ))}
                  </span>
                ) : (
                  editing ? <Check size={20} strokeWidth={2.75} /> : <Plane size={18} weight="fill" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Hidden file input — `accept` is set per-option by openPicker() */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={pickFile}
        />
      </div>


      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recents={chatMedia}
        onSend={sendMedia}
        onFile={() => openPicker("document")}
        onGif={() => setGifPickerOpen(true)}
        onViewOnce={() => openPicker("oneshot")}
        onRejected={(msg) => showToast(msg)}
        apiRef={pickerApi}
      />
      {/* Photo or video from the hold menu: several at once, then the
          picker opens with them picked, for a caption and Send. */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        data-attach-media-input
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          pickerApi.current?.addFiles(files);
          setPickerOpen(true);
        }}
      />

      {albumView && (
        <AlbumViewer
          album={albumView.album}
          start={albumView.start}
          onClose={() => setAlbumView(null)}
          sender={
            albumView.senderId === currentUserId
              ? { name: "You" }
              : isGroup
                ? { name: senderName(albumView.senderId), hue: members?.[albumView.senderId]?.hue }
                : { name: other.name, hue: other.hue, avatarUrl: other.avatarUrl }
          }
          sentAt={`${dayLabel(albumView.at)}, ${timeLabel(albumView.at)}`}
        />
      )}

      {/* Long-press context menu (reactions + actions), anchored to the message */}
      {menu && (() => {
        const r = menu.rect;
        const mine = menu.msg.sender_id === currentUserId;
        const above = r.top > 240;
        const vw = typeof window !== "undefined" ? window.innerWidth : 480;
        const pos: React.CSSProperties = { top: above ? r.top : r.bottom };
        if (mine) pos.right = Math.max(8, vw - r.right);
        else pos.left = Math.max(8, r.left);
        return (
          <>
            <div
              className="fixed inset-0 z-[205]"
              onPointerDown={() => setMenu(null)}
              onClick={() => setMenu(null)}
            />
            <div className="fixed z-[206]" style={pos}>
              <div className={above ? "-translate-y-full pb-2" : "pt-2"}>
                {/* Quick reactions */}
                <div className={`mb-2 flex w-fit gap-0.5 rounded-pill bg-elevated p-1 shadow-xl ring-1 ring-border ${mine ? "ml-auto" : ""}`}>
                  {QUICK.map((e) => (
                    <button key={e} type="button"
                      onClick={() => { toggleReaction(menu.msg.id, e); setMenu(null); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 active:scale-110">
                      {e}
                    </button>
                  ))}
                </div>
                {/* Actions */}
                <div className={`w-44 overflow-hidden rounded-2xl bg-elevated p-1 shadow-xl ring-1 ring-border ${mine ? "ml-auto" : ""}`}>
                  <CtxItem icon={<Reply size={17} />} label="Reply" onClick={() => { setReplyTo(menu.msg); setMenu(null); }} />
                  {!menu.msg.is_unsent && (
                    <CtxItem icon={<Plane size={17} weight="bold" />} label="Forward" onClick={() => { setForwardMsg(menu.msg); setMenu(null); }} />
                  )}
                  {menu.msg.body && menu.msg.kind !== "album" && <CtxItem icon={<Copy size={17} />} label="Copy" onClick={() => { copy(menu.msg); setMenu(null); }} />}
                  {menu.msg.sender_id === currentUserId && menu.msg.kind === "text" && !menu.msg.is_unsent && (
                    <CtxItem icon={<Pencil size={17} />} label="Edit" onClick={() => { startEdit(menu.msg); setMenu(null); }} />
                  )}
                  {menu.msg.sender_id === currentUserId && menu.msg.kind === "album" && !menu.msg.is_unsent && !menu.msg.id.startsWith("temp-") && (
                    <CtxItem icon={<Pencil size={17} />} label="Edit caption" onClick={() => { startEdit(menu.msg); setMenu(null); }} />
                  )}
                  {mine ? (
                    <CtxItem danger icon={<Trash2 size={17} />} label="Unsend" onClick={() => { unsend(menu.msg); setMenu(null); }} />
                  ) : (
                    <CtxItem danger icon={<Flag size={17} />} label="Report" onClick={() => { setReportMsg(menu.msg); setMenu(null); }} />
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Reaction details — who reacted with what */}
      {reactionSheet && (() => {
        const rows = reactions.filter((r) => r.message_id === reactionSheet);
        return (
          <BottomSheet open onClose={() => setReactionSheet(null)} title="Reactions">
            <div className="flex flex-col pb-3">
              {rows.length === 0 ? (
                <EmptyState variant="compact" icon={Star} title="No reactions yet" text="Long-press a message to drop the first one." />
              ) : (
                rows.map((r) => {
                  const isMine = r.user_id === currentUserId;
                  const name = senderName(r.user_id);
                  const hue = isMine ? 280 : members?.[r.user_id]?.hue ?? other.hue;
                  return (
                    <button
                      key={`${r.user_id}-${r.emoji}`}
                      type="button"
                      onClick={() => {
                        if (isMine) { toggleReaction(reactionSheet, r.emoji); setReactionSheet(null); }
                      }}
                      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 text-left ${isMine ? "hover:bg-white/5" : "cursor-default"}`}
                    >
                      <Avatar name={name} hue={hue} size={40} src={isMine ? undefined : members?.[r.user_id] ? undefined : other.avatarUrl ?? undefined} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        {isMine && <p className="text-xs text-muted">Tap to remove</p>}
                      </div>
                      <span className="text-xl leading-none">{r.emoji}</span>
                    </button>
                  );
                })
              )}
            </div>
          </BottomSheet>
        );
      })()}

      {/* Forward picker */}
      <ForwardSheet open={!!forwardMsg} onClose={() => setForwardMsg(null)} msg={forwardMsg} />

      {/* Report reason sheet */}
      {reportMsg && (
        <BottomSheet open onClose={() => setReportMsg(null)} title="Report message">
          <div className="flex flex-col gap-1 pb-3">
            <p className="pb-1 text-xs text-muted">Why are you reporting this?</p>
            {REPORT_REASONS.map((rr) => (
              <button key={rr} type="button" onClick={() => submitReport(rr)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm hover:bg-white/5">
                {rr}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* Report group → writes a real row to public.reports */}
      {reportGroupOpen && (
        <ReportSheet
          open
          onClose={() => setReportGroupOpen(false)}
          targetType="conversation"
          targetId={conversationId}
          currentUserId={currentUserId}
          onReported={() => showToast("Group reported")}
        />
      )}

      {/* Confirm leave / delete chat */}
      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        onConfirm={async () => { await leaveConversation(); }}
        icon={LogOut}
        title={isGroup ? "Leave this group" : "Delete this chat"}
        body={
          isGroup
            ? "You'll stop receiving messages and the chat disappears from your inbox."
            : "The conversation disappears from your inbox. The other person keeps their copy."
        }
        confirmLabel={isGroup ? "Leave group" : "Delete chat"}
      />
    </div>
  );
}


function CtxItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/5 ${danger ? "text-danger" : "text-foreground"}`}>
      {icon}
      {label}
    </button>
  );
}

/**
 * OneShot bubble — a view-once photo. The sender never sees actual image
 * bytes here (their own bubble is a status card, matching that they can't
 * re-view it either); the recipient gets a tap-to-reveal card that, on tap,
 * points an <img> at the same-origin proxy route. The proxy claims the photo
 * server-side on that request — this component never touches storage_path or
 * any RPC directly, it only reacts to the fetch's own success/failure.
 */
function OneShotBubble({
  m, mine, view, onReveal, onLoaded, onGone, timeLabel, statusTick,
}: {
  m: ChatMsg;
  mine: boolean;
  view: "loading" | "loaded" | "gone" | undefined;
  onReveal: () => void;
  onLoaded: () => void;
  onGone: () => void;
  timeLabel: string;
  statusTick: React.ReactNode;
}) {
  if (mine) {
    const opened = !!m.metadata?.oneshot_opened;
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface px-3.5 py-2.5" style={{ maxWidth: 220 }}>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${opened ? "bg-elevated text-faint" : "bg-accent/15 text-accent"}`}>
          {opened ? <Eye size={15} /> : <EyeOff size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Photo</p>
          <p className="truncate text-[11px] text-muted">
            {m._status === "pending" ? "Sending…" : opened ? "Opened" : "View once · Delivered"}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-[3px]">
          <span className="text-[9px] font-medium text-faint">{timeLabel}</span>
          {statusTick}
        </span>
      </div>
    );
  }

  if (view === "gone") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-surface px-3.5 py-2.5 text-muted" style={{ maxWidth: 220 }}>
        <EyeOff size={15} className="shrink-0" />
        <p className="text-sm">This photo is no longer available.</p>
      </div>
    );
  }

  if (view === "loading" || view === "loaded") {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-black" style={{ maxWidth: 240 }}>
        {/* Blocks screenshots and screen recording for as long as the photo is
            on screen. Only does anything in the native app — the web has no
            capture API to prevent, which is why the send-time copy still says
            so plainly rather than promising protection everywhere. */}
        <CaptureGuard />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/oneshot/${m.id}`}
          alt="View once photo"
          className={`w-full rounded-2xl object-cover transition-opacity ${view === "loaded" ? "opacity-100" : "opacity-0"}`}
          onLoad={onLoaded}
          onError={onGone}
        />
        {view === "loading" && (
          <div className="absolute inset-0 flex min-h-[160px] items-center justify-center">
            <span className="flex items-end gap-[3px]" aria-label="Loading">
              {[0, 0.15, 0.3].map((delay, i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: `${delay}s` }} />
              ))}
            </span>
          </div>
        )}
        <span className="absolute bottom-1.5 right-2 rounded-full bg-black/50 px-1.5 py-[3px] text-[9px] font-medium text-white/85 backdrop-blur-sm">
          {timeLabel}
        </span>
      </div>
    );
  }

  // Unrevealed — tap to claim + load.
  return (
    <button
      type="button"
      onClick={onReveal}
      className="flex items-center gap-2 rounded-2xl border border-accent/30 bg-accent/[0.08] px-3.5 py-2.5 text-left active:scale-[0.98]"
      style={{ maxWidth: 220 }}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
        <Eye size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">Tap to view</p>
        <p className="truncate text-[11px] text-muted">Opens once, then it's gone</p>
      </div>
    </button>
  );
}

/**
 * Hypefy-branded message status indicator — shown only on outgoing (mine) messages.
 *
 * pending → three bouncing micro-dots (same brand loader used across Hypefy)
 * sent    → single geometric tick, muted
 * seen    → double geometric tick, electric lime + glow drop-shadow
 * failed  → clean × mark, danger red
 */
function MsgStatusTick({ status }: { status: MsgStatus }) {
  // ── Pending: Hypefy's brand loader — three staggered bouncing dots ──────────
  if (status === "pending") {
    return (
      <span className="flex items-end gap-[2.5px]" aria-label="Sending">
        {[0, 0.15, 0.3].map((delay, i) => (
          <span
            key={i}
            className="h-[4px] w-[4px] rounded-[1.5px] bg-faint animate-dot-bounce"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </span>
    );
  }

  // ── Failed: clean × mark ─────────────────────────────────────────────────────
  if (status === "failed") {
    return (
      <svg
        width="11" height="11" viewBox="0 0 11 11" fill="none"
        aria-label="Failed to send" className="text-danger"
      >
        <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5"
          stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  // ── Seen: double geometric tick — electric lime + brand glow ─────────────────
  if (status === "seen") {
    return (
      <svg
        width="20" height="9" viewBox="0 0 20 9" fill="none"
        aria-label="Seen"
        style={{ filter: "drop-shadow(0 0 4px rgb(200 255 0 / 0.7))" }}
        className="text-accent"
      >
        {/* first tick */}
        <path d="M1.5 4.5L4.5 7.5L10.5 1"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        {/* second tick — offset right */}
        <path d="M8 4.5L11 7.5L17 1"
          stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // ── Sent: single geometric tick, muted ───────────────────────────────────────
  return (
    <svg
      width="13" height="9" viewBox="0 0 13 9" fill="none"
      aria-label="Sent" className="text-muted/70"
    >
      <path d="M1.5 4.5L4.5 7.5L11 1"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
