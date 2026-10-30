"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { safeBack } from "@/lib/safe-back";
import { ChevronLeft, Reply, Copy, Trash2, Flag, Users, Phone, Video, MoreVertical, UserCircle, BellOff, Ban, X, Mic, Star, Paperclip, LogOut, Pencil, Eye, EyeOff, FileText, Download, Check, Camera, Music, Image as ImageIcon, Lock, Unlock, AlertCircle, Search, Pin as PinIcon, BarChart2 } from "lucide-react";
import { SendIcon, ShareIcon } from "@/components/ui/ShareIcon";
import { FACES_SHOWN, lastMine, readMarkers, receiptFor } from "@/lib/chat-receipts";
import { ChatSearch, type FoundMessage } from "@/components/messages/ChatSearch";
import { createClient } from "@/lib/supabase/client";
import { useCallControls } from "@/components/calls/CallProvider";
import { useGroupCall } from "@/components/calls/GroupCallProvider";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { PageReplyEmbed, pageSnapshot } from "@/components/diary/PageReplyEmbed";
import { VoiceMessage } from "@/components/messages/VoiceMessage";
import { GifPicker } from "@/components/messages/GifPicker";
import { TrackPicker } from "@/components/music/TrackPicker";
import { TrackChip } from "@/components/music/TrackChip";
import { packTrack, unpackTrack } from "@/lib/music-message";
import { EmptyThread } from "@/components/messages/EmptyThread";
import type { Track } from "@/lib/music";
import { ReportSheet } from "@/components/ui/ReportSheet";
import { FloatingMenu, MenuItem, MenuDivider } from "@/components/ui/FloatingMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { CaptureGuard } from "@/components/native/CaptureGuard";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { useToast } from "@/components/ui/ToastProvider";
import { scheduleUndoable } from "@/lib/undoable";
import { removeChat } from "@/lib/chat-removal";
import { presenceLabel, presenceTopic } from "@/lib/presence";
import { ScheduleSendSheet } from "@/components/messages/ScheduleSendSheet";
import { ScheduledStrip } from "@/components/messages/ScheduledStrip";
import { haptics } from "@/lib/haptics";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { useMentionHashtag, applySuggestion, SuggestionDropdown } from "@/components/ui/MentionHashtagPicker";
import { one } from "@/lib/supabase/typed";
import { LinkCard } from "./LinkCard";
import { PollBubble } from "./PollBubble";
import { SwipeRow } from "./SwipeRow";
import { canEdit, swipeAction, type SwipeAction } from "@/lib/chat-gestures";
import { PollComposer } from "./PollComposer";
import { readPoll } from "@/lib/chat-poll";
import { firstPreviewable } from "@/lib/link-preview";
import { ForwardSheet } from "@/components/messages/ForwardSheet";
import { canPin } from "@/lib/chat-pins";
import { randomObjectName } from "@/lib/object-name";
import { PinPane, usePinPane } from "@/components/messages/PinPane";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { bubbleCss, findChatTheme } from "@/lib/chat-themes";
import { ChatAmbient } from "@/components/messages/ChatAmbient";
import { resolveBubble } from "@/lib/bubble-styles";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { Nameplate } from "@/components/ui/Nameplate";
import { useFrameCatalog } from "@/components/ui/FrameCatalogProvider";
import { canShow } from "@/lib/cosmetics";
import type { FrameAsset } from "@/lib/frames";
import { frameIdOf, frameReaction, reactionLabel } from "@/lib/chat-reactions";
import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { DisplayName } from "@/components/ui/DisplayName";
import { MediaFolder, AlbumViewer } from "@/components/messages/MediaFolder";
import { MediaPicker, type MediaPickerApi, type PickEntry } from "@/components/messages/MediaPicker";
import {
  ALBUM_CAPTION_MAX,
  encodeAlbum,
  parseAlbum,
  type Album,
  type AlbumItem,
} from "@/lib/chat-album";
import { uploadAlbumFiles, type AlbumFile } from "@/lib/chat-album-upload";
import { leaveChatAnimated } from "@/lib/leave-chat";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { canEncrypt, isEncrypted, openEnvelope, sealFor, useEnvelopeReader } from "@/lib/e2ee/chat";
import { openEncryptionSetup } from "@/lib/e2ee/open-setup";
import { E2EE_ENABLED } from "@/lib/e2ee/flag";
import { ChatImg, ChatLink, ChatVideo } from "@/components/messages/ChatMedia";
import { readDraft, writeDraft } from "@/lib/chat-drafts";
import { displayNameFor } from "@/lib/nicknames";
import { forwardedBody, isForwarded } from "@/lib/chat-forward";
import { useNicknames } from "@/components/messages/useNicknames";
import {
  dropOutbox,
  isTerminal,
  outboxFor,
  queueOutbox,
  recordAttempt,
  restoredMessage,
  toRestore,
} from "@/lib/chat-outbox";
import { mediaUrlsOf, prefetchChatMedia } from "@/lib/chat-media-url";
import { SharedShotCard } from "@/components/messages/SharedShotCard";
import { ShowReplyCard } from "@/components/messages/ShowReplyCard";
import { SharedPostCard } from "@/components/messages/SharedPostCard";
import {
  ForwardedCommentOverlay,
  ForwardedLabel,
  type ForwardedComment,
} from "@/components/messages/ForwardedComment";
import { EmbedLabel } from "@/components/ui/EmbedLabel";
import {
  DOC_ACCEPT,
  DOC_MIMES,
  MEDIA_W,
  MSG_PAGE,
  MSG_SELECT,
  QUICK,
  REPORT_REASONS,
  SEARCH_REACH_PAGES,
  albumOf,
  dayLabel,
  everyoneHasRead,
  faceLift,
  fileSize,
  mapMessageRow,
  msgSnippet,
  sameDay,
  showsFace,
  timeLabel,
  type ChatMsg,
  type GroupMeta,
  type MsgStatus,
  type Other,
  type ReactionRow,
  type Reader,
} from "@/lib/chat-thread";

// Re-exported because callers and tests already import these from here.
// Keeping their import sites untouched is what makes the unchanged suite
// meaningful evidence that this move changed no behaviour.
export {
  SEARCH_REACH_PAGES,
  everyoneHasRead,
  faceLift,
  showsFace,
  type ChatMsg,
  type Reader,
};


/** The paperclip's hold menu, in priority order. A tap opens the picker
 *  sheet; holding offers each kind directly.
 *
 *  Labels only — no descriptions. Every label already says what it does,
 *  and the one row that genuinely needs a caveat (View once) gets it at
 *  the point of sending, in the composer preview. */
const ATTACH_OPTIONS: {
  mode: "camera" | "media" | "oneshot" | "document" | "gif" | "music" | "poll";
  icon: React.ReactNode;
  label: string;
}[] = [
  { mode: "camera", icon: <Camera size={16} />, label: "Camera" },
  { mode: "media", icon: <ImageIcon size={16} />, label: "Photo or video" },
  { mode: "oneshot", icon: <Eye size={16} />, label: "View once" },
  { mode: "document", icon: <FileText size={16} />, label: "Document" },
  { mode: "gif", icon: <span className="text-[9px] font-black tracking-wider">GIF</span>, label: "GIF" },
  // A song is an attachment, like a photo or a GIF — not a thing of its own.
  { mode: "music", icon: <Music size={16} />, label: "Music" },
  // "where are we eating" in a group of six is twenty messages and no
  // answer, so a poll sits with the other things you attach to a chat.
  { mode: "poll", icon: <BarChart2 size={16} />, label: "Poll" },
];

/** How long the paperclip is held before its menu opens instead. */
const ATTACH_HOLD_MS = 400;

export function RealChatView({
  conversationId,
  currentUserId,
  other,
  group,
  members,
  self,
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
  members?: Record<
    string,
    {
      name: string;
      username?: string | null;
      hue: number;
      avatarUrl?: string | null;
      /** The plate they wear, drawn behind their name in a group. */
      nameplate?: string | null;
    }
  >;
  /** The reader's own avatar, for where their own messages are shown with a face. */
  self?: { hue: number; avatarUrl: string | null; isPremium?: boolean };
  initialMessages: ChatMsg[];
  initialReactions?: ReactionRow[];
  initialReaders?: Reader[];
  /** The conversation's chat theme id, or null for the default look. */
  initialTheme?: string | null;
  /** Each member's bubble style they can show right now (user id → style id). */
  bubbleStyles?: Record<string, string | null>;
}) {
  const isGroup = !!group;
  // What you call the people here. Personal: nobody else sees it, and
  // nobody else's rows ever come back. See 0169.
  const { nicknames, refresh: refreshNicknames } = useNicknames(conversationId);
  /**
   * The name to write above somebody's words.
   *
   * One helper for the sender line, the quoted reply and the photo
   * viewer's title, so a nickname cannot show in one and not another.
   */
  // Tier-gated, the way frames are everywhere else. Offering one that
  // cannot be worn is offering somebody a thing to be refused.
  const frameCatalog = useFrameCatalog();
  const wearableReactionFrames: FrameAsset[] = useMemo(
    () =>
      Object.values(frameCatalog)
        .filter((f) => f.url && canShow(f.tier, !!self?.isPremium))
        .slice(0, 8),
    [frameCatalog, self?.isPremium],
  );

  const senderName = (id: string) =>
    id === currentUserId
      ? "You"
      : displayNameFor(id, members?.[id]?.name ?? other.name, nicknames);
  /**
   * What to call the other person in a DM.
   *
   * The header had their profile name written straight in, which was fine
   * while a nickname was private to whoever set it — now that the chat
   * agrees on one, the name at the top of the chat is the first place it
   * has to show.
   */
  const peerName = displayNameFor(other.id, other.name, nicknames);
  const supabase = createClient();
  const [themeId, setThemeId] = useState<string | null>(initialTheme);
  const theme = findChatTheme(themeId);
  const router = useRouter();
  /** Exactly what the server holds — encrypted bodies included. Everything
   *  that writes messages writes here; reading goes through `messages`. */
  const [storedMessages, setMessages] = useState<ChatMsg[]>(initialMessages);

  /**
   * End-to-end encryption for this thread.
   *
   * 1:1 text only for now. Groups need sender keys and a re-key whenever
   * somebody joins, and chat media sits in a public bucket — both are their
   * own piece of work, and claiming otherwise here would be a lie.
   */
  const peerIds = useMemo(() => (isGroup ? [] : [other.id]), [isGroup, other.id]);
  const reader = useEnvelopeReader(currentUserId, peerIds, !isGroup);

  /**
   * Open what arrived, once, on the way in.
   *
   * Every route a message can take into this component — the server render,
   * the older-messages page, the catch-up fetch, the realtime echo — ends in
   * `messages`, so decrypting here covers all of them and every render site
   * downstream keeps reading a plain `body`. The database still holds only
   * the envelope; this plaintext never leaves the tab.
   */
  const messages = useMemo(() => {
    if (isGroup || reader.loading) return storedMessages;
    return storedMessages.map((m) => {
      if (!isEncrypted(m.body)) return m;
      const opened = openEnvelope(reader, {
        body: m.body,
        senderId: m.sender_id,
        myId: currentUserId,
        peerId: other.id,
      });
      return opened.state === "open"
        ? { ...m, body: opened.text, _cipher: m.body ?? undefined, _enc: "open" as const }
        : { ...m, _enc: "locked" as const };
    });
  }, [storedMessages, reader, isGroup, currentUserId, other.id]);

  /**
   * Where encryption begins in this thread.
   *
   * Everything above it was sent before both people had keys, or while one
   * of them did not — it is legacy plaintext, and the divider is what makes
   * that legible without labelling every old message. Derived from the
   * envelopes themselves, so it needs no column and cannot drift from what
   * was actually sent.
   */
  // Sign every attachment in the thread in one batched call the moment it
  // loads, so the first tile is not waiting on a lookup of its own. Runs on
  // arrivals and older pages alike; links already held cost nothing.
  useEffect(() => {
    prefetchChatMedia(storedMessages.flatMap((m) => mediaUrlsOf(m.kind, m.body)));
  }, [storedMessages]);

  const firstEncryptedIndex = useMemo(() => messages.findIndex((m) => !!m._enc), [messages]);
  const [reactions, setReactions] = useState<ReactionRow[]>(initialReactions);
  const [readers, setReaders] = useState<Reader[]>(initialReaders);
  const [text, setText] = useState("");
  const [dmCursor, setDmCursor] = useState(0);
  const { suggestions: pickerSuggestions, reset: resetPicker } = useMentionHashtag(text, dmCursor);
  const [sending, setSending] = useState(false);
  /**
   * Which messages are picked, or null when nothing is being picked.
   *
   * Null rather than an empty set, so "not selecting" and "selecting
   * nothing yet" are different states. Leaving the last one unticked
   * should not drop you out of the mode you are standing in.
   */
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null);
  /** The run being forwarded, held while the sheet is open. */
  const [forwardMany, setForwardMany] = useState<ChatMsg[]>([]);
  const selecting = picked !== null;

  // Prefill the composer when arriving from a Note reply ("?prefill=…"), so the
  // indirect-confession payoff lands as a quoted draft. Clears the param after.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Arriving from the pin board: go to the message it was tapped on, the
    // same way a search result is reached, then drop the param so a reload
    // or a back does not jump again.
    const focus = params.get("m");
    if (focus) {
      const url = new URL(window.location.href);
      url.searchParams.delete("m");
      window.history.replaceState({}, "", url.toString());
      void goToMessage({ id: focus } as FoundMessage);
    }
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

  // What was typed here and not sent is kept, and is back in the box when the
  // chat is opened again (src/lib/chat-drafts.ts). Read after the first paint:
  // the server has no drafts, and a box that started out filled would not
  // match what it drew.
  const draftReady = useRef(false);
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (!live) return;
      const kept = readDraft(currentUserId, conversationId);
      draftReady.current = true;
      if (kept) setText((now) => now || kept);
    });
    return () => {
      live = false;
    };
  }, [currentUserId, conversationId]);
  // Saved as it changes, and gone the moment the box is empty: sending
  // clears the box, which clears the draft. Not while an old message is being
  // edited, when the box holds that message and not something new.
  useEffect(() => {
    if (!draftReady.current || editing) return;
    writeDraft(currentUserId, conversationId, text);
  }, [text, editing, currentUserId, conversationId]);
  const [menu, setMenuState] = useState<{ msg: ChatMsg; rect: DOMRect; at: number } | null>(null);
  /**
   * Opening the menu stamps the time.
   *
   * The Edit item depends on how old the message is, and reading the clock
   * while rendering is not something a render may do - it would also mean
   * the item could vanish mid-press. Stamped once, when the menu opens;
   * startEdit checks the live clock, so a menu left open past the window
   * refuses with a sentence rather than saving nothing.
   */
  function setMenu(next: { msg: ChatMsg; rect: DOMRect } | null) {
    setMenuState(next ? { ...next, at: Date.now() } : null);
  }
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
  const [searchOpen, setSearchOpen] = useState(false);
  /** The found message being scrolled to, so it can be lit when it lands. */
  const [foundId, setFoundId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [starBurstId, setStarBurstId] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [songPickerOpen, setSongPickerOpen] = useState(false);
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
  const [pollOpen, setPollOpen] = useState(false);
  const pickerApi = useRef<MediaPickerApi>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const attachHold = useRef<{ timer: ReturnType<typeof setTimeout> | null; opened: boolean }>({ timer: null, opened: false });
  /**
   * Holding Send offers to send it later.
   *
   * The body is sealed at the moment of holding, the same way send() seals
   * one — a scheduled message has to be readable by the same two devices as
   * a live one, and the keys could change before it goes.
   */
  const [scheduleBody, setScheduleBody] = useState<string | null>(null);
  const sendHold = useRef<{ timer: ReturnType<typeof setTimeout> | null; opened: boolean }>({ timer: null, opened: false });
  /** The full-screen viewer: an album, or a single photo as an album of one. */
  const [albumView, setAlbumView] = useState<{
    album: Album;
    start: number;
    senderId: string;
    at: string;
    /** The message it came from, for replying and reacting from the viewer. */
    msgId: string;
  } | null>(null);
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

  function leaveConversation() {
    // Back to the inbox at once; the chat stays out of it while Undo is
    // offered, and goes for good after five seconds.
    removeChat({
      id: conversationId,
      isGroup,
      name: other.name,
      thumb: { src: other.avatarUrl ?? null, name: other.name, hue: other.hue },
      leave: () => supabase.rpc("leave_conversation", { p_conversation_id: conversationId }),
      toast: showToast,
      onDone: () => router.refresh(),
    });
    router.push("/messages");
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
  // hasMore mirrored into a ref for the same reason as messages: loadOlder is
  // called in a loop by goToMessage, which cannot see state updated after the
  // render the loop was created in.
  const hasMoreRef = useRef(hasMore);
  // Mirrored in an effect rather than during render. loadOlder also writes it
  // directly the moment it runs out of history, so the loop in goToMessage
  // never has to wait for a render to see that it is finished.
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);
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

  /**
   * The comments that forwarded messages point at, by id.
   *
   * A miss is kept as null on purpose: a comment that was deleted, or that
   * this reader cannot see, has to be remembered as answered or the effect
   * would ask again on every render. Which is also why the ids already asked
   * for live in a ref — it keeps them out of the dependencies.
   */
  const [fwdComments, setFwdComments] = useState<Record<string, ForwardedComment | null>>({});
  const fwdAsked = useRef<Set<string>>(new Set());

  useEffect(() => {
    const want = [...new Set(messages.map((m) => m.metadata?.comment_id).filter((id): id is string => !!id))]
      .filter((id) => !fwdAsked.current.has(id));
    if (want.length === 0) return;
    want.forEach((id) => fwdAsked.current.add(id));

    let alive = true;
    void (async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, body, user_id, profiles(display_name, username, avatar_hue, avatar_url)")
        .in("id", want)
        .is("deleted_at", null)
        .is("removed_at", null);
      if (!alive) return;
      // A row this fetch did not return is recorded as null, which the overlay
      // states as "This comment was deleted". On a failed fetch nothing comes
      // back at all, so writing those nulls would say that about every
      // forwarded comment in the thread. Leave them unknown and un-latch the
      // ids instead: the next messages change asks again.
      if (error) {
        want.forEach((id) => fwdAsked.current.delete(id));
        return;
      }
      const found: Record<string, ForwardedComment | null> = {};
      want.forEach((id) => {
        found[id] = null;
      });
      (data ?? []).forEach((row) => {
        found[row.id] = {
          id: row.id,
          body: row.body,
          authorId: row.user_id,
          author: one(row.profiles),
        };
      });
      setFwdComments((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      alive = false;
    };
  }, [messages, supabase]);

  /**
   * A shared post or Shot with the comment someone forwarded laid over it,
   * and the line above saying who forwarded whose comment on what. Content
   * that was shared on its own passes straight through, unchanged.
   */
  function withForwarded(m: ChatMsg, kind: "post" | "shot", card: React.ReactNode) {
    const commentId = m.metadata?.comment_id;
    if (!commentId) return card;
    const mine = m.sender_id === currentUserId;
    // Not coalesced to null: undefined means "still looking", and the overlay
    // and the label both need to tell that apart from "deleted".
    const comment = fwdComments[commentId];
    const content = kind === "post" ? m.post : m.shot;
    const contentAuthor = kind === "post" ? m.postProfile : m.shotProfile;
    return (
      <>
        <EmbedLabel align={mine ? "end" : "start"}>
          <ForwardedLabel
            mine={mine}
            senderUsername={members?.[m.sender_id]?.username ?? other.username}
            commentAuthorUsername={comment?.author?.username}
            commentIsYours={comment?.authorId === currentUserId}
            contentAuthorUsername={contentAuthor?.username}
            contentIsYours={content?.user_id === currentUserId}
            kind={kind}
          />
        </EmbedLabel>
        <ForwardedCommentOverlay comment={comment}>{card}</ForwardedCommentOverlay>
      </>
    );
  }

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

  // How far each message has got, shown under it rather than as a tick in
  // every bubble: words under my newest in a one-to-one chat, faces under
  // the last message each member has read in a group. See lib/chat-receipts.
  // The clock "Seen 4m ago" is read against, moved on twice a minute.
  const [receiptNow, setReceiptNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setReceiptNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const markers = isGroup ? readMarkers(messages, readers) : new Map<string, string[]>();
  const myLast = lastMine(messages, currentUserId);
  const myReceipt = receiptFor(myLast, readers, {
    isGroup,
    faces: !!myLast && (markers.get(myLast.id)?.length ?? 0) > 0,
    now: receiptNow,
  });

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

    // Initial landing. The list scrolls from the bottom, so it is already on
    // the newest message; the only move left is up to an unread divider,
    // and only when that divider is above what is on screen.
    const container = scrollContainerRef.current;
    const divider = unreadDividerRef.current;
    if (container && divider && divider.getBoundingClientRect().top < container.getBoundingClientRect().top) {
      divider.scrollIntoView({ behavior: "auto", block: "center" });
    }
    initialScrollDone.current = true;
    prevLastIdRef.current = messages[messages.length - 1]?.id ?? null;
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
      .select("id, caption, image_url, image_urls, aspect_ratio, profiles!posts_user_id_fkey(username, display_name, avatar_hue, avatar_url)")
      .eq("id", postId)
      .maybeSingle();
    if (!data) return;
    const d = data as any;
    const pr = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === msgId
          ? { ...x, post: { id: d.id, caption: d.caption, image_url: d.image_url, image_urls: d.image_urls, aspect_ratio: d.aspect_ratio }, postProfile: pr }
          : x,
      ),
    );
  }

  async function hydrateShot(msgId: string, shotId: string) {
    const { data } = await supabase
      .from("shots")
      .select("id, media_url, poster_url, caption, profiles(username, display_name, avatar_hue, avatar_url)")
      .eq("id", shotId)
      .maybeSingle();
    if (!data) return;
    const d = data as any;
    const pr = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
    setMessages((prev) =>
      prev.map((x) =>
        x.id === msgId ? { ...x, shot: { id: d.id, media_url: d.media_url, poster_url: d.poster_url, caption: d.caption }, shotProfile: pr } : x,
      ),
    );
  }

  /**
   * Go to a message a search found.
   *
   * It may be older than anything loaded, so history is fetched a page at a
   * time until it is — up to a bound, after which the reader is told rather
   * than left watching a spinner.
   */
  async function goToMessage(found: FoundMessage) {
    setSearchOpen(false);
    for (let page = 0; page <= SEARCH_REACH_PAGES; page++) {
      const el = document.querySelector(`[data-msg-id="${found.id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFoundId(found.id);
        setTimeout(() => setFoundId(null), 2200);
        return;
      }
      if (!hasMoreRef.current) break;
      await loadOlder();
      // Let the prepended page paint before looking for it.
      await new Promise((r) => setTimeout(r, 60));
    }
    showToast("That message is further back than this can reach.");
  }

  /** Fetch the next older page and prepend it, preserving scroll position. */
  async function loadOlder() {
    // Everything this reads comes from a ref. goToMessage pages back in a
    // loop, awaiting this function each time; the closure it holds is from one
    // render, so `messages[0]` stayed the first message as it was BEFORE any
    // page was prepended. Every iteration after the first asked for the same
    // page, the dedupe threw all of it away, and the jump never reached
    // anything older than what was already on screen — which is what the pin
    // board's "go to message" ran into.
    if (loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current[0];
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);

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
    // Against the rows that came back, not the ones that survived the dedupe,
    // and written to the ref as well as to state so the next loop iteration
    // sees it without waiting for a render.
    if ((data?.length ?? 0) < MSG_PAGE) {
      hasMoreRef.current = false;
      setHasMore(false);
    }

    if (older.length > 0) {
      // Older history should appear instantly (no entrance animation).
      older.forEach((o) => seenAtLoadRef.current.add(o.id));
      justPrepended.current = true; // auto-scroll effect skips this change
      setMessages((prev) => {
        const existing = new Set(prev.map((p) => p.id));
        const fresh = older.filter((o) => !existing.has(o.id));
        const next = [...fresh, ...prev];
        // The ref too, now rather than on the next render: a caller awaiting
        // this in a loop must see the new first message when it comes back.
        messagesRef.current = next;
        return next;
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
    // In a column-reverse scroller the offset counts from the bottom (0 at
    // the newest message, negative going up in current browsers).
    const fromBottom = Math.abs(el.scrollTop);
    nearBottomRef.current = fromBottom < 150;
    const fromTop = el.scrollHeight - el.clientHeight - fromBottom;
    if (initialScrollDone.current && fromTop < 200 && hasMore && !loadingOlderRef.current) {
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
      // Nothing on screen leaves that reduce at 1970, which asked for every
      // message the thread has ever held. Capped at a page either way: a
      // catch-up is for what arrived while you were away, and the history
      // above it is what scrolling up is for.
      supabase
        .from("messages")
        .select(MSG_SELECT)
        .eq("conversation_id", conversationId)
        .gt("created_at", latest)
        .order("created_at", { ascending: true })
        .limit(MSG_PAGE)
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
              // An encrypted message's optimistic copy holds the plaintext,
              // so compare against the envelope we actually sent.
              const tempIdx = prev.findIndex(
                (x) => x.id.startsWith("temp-") && x.kind === m.kind && (x.body === m.body || (!!x._cipher && x._cipher === m.body)),
              );
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
            // A shared nickname is the other thing a system message can be
            // announcing, and the only way a name on this screen changes
            // without this screen doing it. Cheap enough to just re-read:
            // system messages are rare and it is one small query.
            void refreshNicknames();
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

  /**
   * The other party's presence, plus a 30s ticker so "Active 4m ago" stays
   * current without new events.
   *
   * This listened for `postgres_changes` on `profiles` and therefore heard
   * nothing, ever: profiles is not in the realtime publication, so the dot
   * showed whatever the server rendered at page load and never moved again.
   * Publishing profiles would have fixed it at the cost of a WAL record per
   * signed-in user per minute — see 0155. Their heartbeat announces itself on
   * a channel instead, and this listens on the same name.
   */
  useEffect(() => {
    if (isGroup || !other.id || other.showActivity === false) return;
    const ch = supabase
      .channel(presenceTopic(other.id))
      .on("broadcast", { event: "beat" }, (msg) => {
        const at = (msg.payload as { at?: string } | null)?.at;
        if (at) setOtherLastSeen(at);
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

  /**
   * @param override Send this instead of whatever is in the composer. Used by
   * the empty thread's Hey, which has nothing typed to read.
   */
  /**
   * Send a text message. `replyOverride` answers that message instead of the
   * one picked in the composer, and leaves the composer as it is — the
   * photo viewer's reply bar uses it. True when it went.
   */
  function cancelSendHold() {
    const h = sendHold.current;
    if (h.timer) { clearTimeout(h.timer); h.timer = null; }
  }

  /** Hold Send: seal what is typed and ask when it should go. */
  function openScheduleSheet() {
    const body = text.trim();
    if (!body) return;
    const sealed = isGroup
      ? null
      : sealFor(reader, { plaintext: body, conversationId, myId: currentUserId, peerId: other.id });
    haptics.tap();
    setScheduleBody(sealed ?? body);
  }

  /**
   * Unsent messages from a previous visit, back where they were written.
   *
   * They keep their original time rather than arriving at the foot of the
   * thread, so one written last night sits above this morning's replies
   * where it belongs — and keeps its original id, because the thread has
   * records under that id already.
   *
   * Anything that evidently reached the server is dropped instead of
   * drawn: the app can be killed between the server accepting a message
   * and the row being deleted, and the same message twice is worse than
   * the failure this feature exists to fix. See toRestore.
   */
  useEffect(() => {
    const waiting = outboxFor(currentUserId, conversationId);
    if (waiting.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-time read of browser-only storage
    setMessages((prev) => {
      const here = new Set(prev.map((m) => m.id));
      const back = toRestore(waiting, prev, currentUserId)
        .filter((e) => !here.has(e.tempId))
        .map((e) => restoredMessage(e, currentUserId));
      if (back.length === 0) return prev;
      return [...prev, ...back].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
  }, [conversationId, currentUserId]);

  /**
   * Mark a message failed, and keep it on the device.
   *
   * Everything that fails goes through here. Until it did, an unsent
   * message lived in React state alone: it was on screen with a red tick
   * and gone the moment you switched apps, which is the failure people
   * blame an app for permanently.
   *
   * What is stored is what would have gone to the server — the envelope
   * for a sealed chat, never its plaintext. See chat-outbox.
   */
  function keepFailed(m: ChatMsg) {
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, _status: "failed" as const } : x)));
    queueOutbox(currentUserId, {
      tempId: m.id,
      conversationId,
      kind: m.kind,
      wire: m._cipher ?? m.body,
      sealed: !!m._cipher,
      replyToId: m.reply_to_id,
      createdAt: m.created_at,
      attempts: 1,
      ...(m._storagePath ? { storagePath: m._storagePath } : {}),
      ...(m._caption ? { caption: m._caption } : {}),
    });
  }

  async function send(override?: string, replyOverride?: ChatMsg): Promise<boolean> {
    if (editing && !replyOverride) { await saveEdit(); return true; }
    const body = (override ?? text).trim();
    if (!body || sending) return false;
    haptics.tap();
    setSending(true);
    if (!replyOverride) setText("");
    emitStopTyping();
    const replyId = replyOverride ? replyOverride.id : replyTo?.id ?? null;
    if (!replyOverride) setReplyTo(null);

    // Null when the other person has not set up encryption yet, or when
    // this device is locked. Both are ordinary states; the thread says so
    // rather than refusing to send.
    const sealed = isGroup
      ? null
      : sealFor(reader, { plaintext: body, conversationId, myId: currentUserId, peerId: other.id });

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body, sender_id: currentUserId, kind: "text",
      post_id: null, reply_to_id: replyId, is_unsent: false, created_at: new Date().toISOString(),
      ...(sealed ? { _cipher: sealed } : {}),
    };
    setMessages((p) => [...p, optimistic]);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: sealed ?? body ?? undefined, p_kind: "text", p_post_id: undefined, p_reply_to_id: replyId ?? undefined,
    });
    if (error || !data) {
      // Keep message visible but mark it failed
      keepFailed(optimistic);
      showToast("Couldn't send. Try again.");
      setSending(false);
      return false;
    }
    const real = data as ChatMsg;
    dropOutbox(currentUserId, tempId);
    // If the realtime echo already added the real row, just drop the temp.
    setMessages((p) =>
      p.some((m) => m.id === real.id)
        ? p.filter((m) => m.id !== tempId)
        : p.map((m) => (m.id === tempId ? { ...m, ...real, _status: undefined } : m)),
    );
    setSending(false);
    return true;
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
  /**
   * Put a poll in the thread.
   *
   * No optimistic copy, unlike every other send. A poll is a card whose
   * whole content is a tally, and a local one would have to invent the
   * shape the server is about to build — options it may have cleaned
   * differently, a tally of zeros that is only right until somebody votes.
   * It is one round trip and the sheet is already closing, so the card
   * arrives a moment later rather than arriving wrong.
   */
  async function sendPoll(question: string, options: string[], multi: boolean) {
    const { data, error } = await supabase.rpc("send_poll", {
      p_conversation_id: conversationId,
      p_question: question,
      p_options: options,
      p_multi: multi,
      p_reply_to_id: replyTo?.id ?? undefined,
    });
    setReplyTo(null);
    if (error || !data) {
      // The server's words, not ours: it is the one that knows whether this
      // was a blocked conversation, too many options or a lost connection.
      showToast(error?.message ?? "Couldn't send that poll.");
      return;
    }
    const real = data as ChatMsg;
    setMessages((p) => (p.some((m) => m.id === real.id) ? p : [...p, real]));
  }

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
      // The envelope we sealed the first time, so a retry does not quietly
      // downgrade an encrypted message to plaintext.
      p_body: failed._cipher ?? failed.body ?? undefined,
      p_kind: failed.kind,
      p_post_id: failed.post_id ?? undefined,
      p_shot_id: failed.shot_id ?? undefined,
      p_reply_to_id: failed.reply_to_id ?? undefined,
      p_storage_path: failed._storagePath ?? undefined,
    });
    if (error || !data) {
      // Counted on the device, so an app killed between tries does not
      // get a fresh budget every launch and retry for ever.
      recordAttempt(currentUserId, failed.id);
      keepFailed(failed);
      showToast("Still couldn't send. Check your connection.");
    } else {
      const real = data as ChatMsg;
      dropOutbox(currentUserId, failed.id);
      setMessages((p) =>
        p.some((m) => m.id === real.id)
          ? p.filter((m) => m.id !== failed.id)
          : p.map((m) => (m.id === failed.id ? { ...m, ...real, _status: undefined } : m)),
      );
    }
  }

  /**
   * Send again what the connection took away, when it comes back.
   *
   * Two triggers, and the second is the one that matters more than it
   * looks. The browser fires `online` when a live tab regains the network
   * — but an app killed on the underground and opened at the surface is
   * already online when it loads, so that event never comes. Flushing on
   * open as well is the difference between a message that goes by itself
   * and one that waits for a tap nobody knows to give.
   *
   * Only what still has attempts left. A message that has spent them is
   * drawn as failed and waits for the sender, which is the point of
   * having a budget at all.
   */
  useEffect(() => {
    let stopped = false;
    const flush = async () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      for (const e of outboxFor(currentUserId, conversationId)) {
        if (stopped) return;
        if (isTerminal(e)) continue;
        await retrySend(restoredMessage(e, currentUserId));
      }
    };
    void flush();
    window.addEventListener("online", flush);
    return () => {
      stopped = true;
      window.removeEventListener("online", flush);
    };
    // retrySend is rebuilt every render and depends on nothing that
    // changes what a retry does; listing it would resubscribe per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, currentUserId]);

  /** Upload voice blob to Supabase Storage and send as a voice message. */
  async function sendVoice(blob: Blob, durationSecs: number, peaks: number[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setVoiceMode(false); return; }

    const ext = blob.type.includes("ogg") ? "ogg" : "webm";
    const path = randomObjectName(user.id, ext);

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
    // waiting for audio metadata to load before showing a duration) and the
    // note's shape, measured off the microphone as it was recorded. Keeping
    // the shape here rather than decoding the audio on every render means the
    // waveform is drawn before a byte of the file is fetched — and it is the
    // real one, not a pattern. An older note simply has no peaks and falls
    // back to the generic shape.
    const body = JSON.stringify({ url: publicUrl, duration: durationSecs, peaks });
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
      keepFailed(optimistic);
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
      keepFailed(optimistic);
      showToast("Couldn't send GIF.");
    } else {
      const real = data as ChatMsg;
      setMessages((p) => p.some((m) => m.id === real.id) ? p.filter((m) => m.id !== tempId) : p.map((m) => m.id === tempId ? { ...m, ...real, _status: undefined } : m));
    }
    setSending(false);
  }

  /** Send a song, picked from the same picker a Spotlight page uses. The
   *  track rides in the body as JSON, so no column and no migration. */
  async function sendSong(track: Track) {
    setSongPickerOpen(false);
    if (sending) return;
    setSending(true);
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);

    const body = packTrack(track);
    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body, sender_id: currentUserId, kind: "music",
      post_id: null, reply_to_id: replyId, is_unsent: false,
      created_at: new Date().toISOString(), _status: "pending",
    };
    setMessages((p) => [...p, optimistic]);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: body, p_kind: "music",
      p_post_id: undefined, p_reply_to_id: replyId ?? undefined,
    });
    if (error || !data) {
      keepFailed(optimistic);
      showToast("Couldn't send that song.");
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
    const path = randomObjectName(currentUserId, ext);
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
      keepFailed(optimistic);
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
      detail: m.body?.trim() || "Your message",
      onClick: () => {
        cancel();
        // Restores the original row wholesale — body, metadata and all.
        setMessages((p) => p.map((x) => (x.id === m.id ? m : x)));
      },
    });
  }

  function startEdit(m: ChatMsg) {
    // Checked here rather than only where it is offered: the menu can be
    // open when the window closes, and the server refuses it either way —
    // this is so the refusal is a sentence instead of a failed save.
    if (!canEdit(m, currentUserId, Date.now())) {
      showToast("That message can no longer be edited");
      return;
    }
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

  /**
   * Put a message on the chat's pin board, or take it off.
   *
   * Either side may pin either side's messages: the board belongs to the
   * conversation, not to whoever spoke. Optimistic, and reverted on refusal —
   * the only refusals are the cap and a message that has since gone, both of
   * which the server words for the reader.
   */
  async function togglePin(m: ChatMsg) {
    const next = !m.pinned_at;
    haptics.select();
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned_at: next ? new Date().toISOString() : null } : x)));
    const { error } = await supabase.rpc("set_message_pinned", { p_id: m.id, p_pinned: next });
    if (error) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinned_at: m.pinned_at ?? null } : x)));
      showToast(error.message.includes("can pin") ? error.message : "Couldn't pin that");
      return;
    }
    showToast(next ? "Pinned" : "Unpinned");
  }

  /**
   * The chat and its pin board, as two panes moved between sideways.
   *
   * The thread's scroller is handed over so the gesture can stop it
   * scrolling while a sideways drag owns the finger.
   */
  const pinPane = usePinPane(scrollContainerRef);

  function copy(m: ChatMsg) {
    if (m.body) { navigator.clipboard.writeText(m.body).catch(() => {}); showToast("Copied"); }
  }

  // Long-press Ã¢â€ â€™ context menu
  /**
   * Open a message's actions, anchored to the element they belong to.
   *
   * Shared by the hold and by the per-message button below, which is the
   * only way anyone navigating by keyboard, switch or screen reader can get
   * to Reply, Forward, Pin — or Report. A 420ms hold on a div that cannot
   * take focus is unreachable by every one of them, and Report being
   * unreachable is a safety problem before it is an accessibility one.
   */
  /** Start picking, with the message that was held already picked. */
  function startSelecting(m: ChatMsg) {
    setPicked(new Set([m.id]));
    setMenu(null);
  }

  function togglePicked(id: string) {
    setPicked((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** The picked messages, in the order the thread shows them. */
  function pickedMessages(): ChatMsg[] {
    return picked ? messages.filter((m) => picked.has(m.id)) : [];
  }

  /**
   * Carry out a swipe.
   *
   * The same three handlers the hold menu calls, so there is exactly one
   * implementation of reply, edit and forward and the gesture cannot drift
   * away from the menu.
   */
  function doSwipe(m: ChatMsg, action: SwipeAction) {
    if (action === "reply") { setReplyTo(m); return; }
    startEdit(m);
  }

  function openMenu(m: ChatMsg, el: HTMLElement) {
    if (m.is_unsent) return;
    setMenu({ msg: m, rect: el.getBoundingClientRect() });
  }

  function onPressStart(m: ChatMsg, e: React.PointerEvent) {
    // While picking, a press is a tick. Opening the hold menu on top of
    // a selection would offer actions for one message in the middle of
    // choosing several.
    if (selecting) {
      togglePicked(m.id);
      return;
    }
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
  /**
   * The message whose photos are open full-screen, for the viewer's reply and
   * react — not one still sending, which has nothing yet to answer.
   */
  const viewed = albumView
    ? messages.find((x) => x.id === albumView.msgId && !x.id.startsWith("temp-")) ?? null
    : null;
  const viewedFirst =
    viewed && viewed.sender_id !== currentUserId
      ? (isGroup ? senderName(viewed.sender_id) : other.name).split(" ")[0]
      : null;

  /** A single photo, full-screen: the viewer, as an album of one. Not after a hold. */
  function openPhoto(m: ChatMsg) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!m.body && !m._localUrl) return;
    setAlbumView({
      album: { caption: "", items: [{ url: m._localUrl ?? m.body!, type: "image" }] },
      start: 0,
      senderId: m.sender_id,
      at: m.created_at,
      msgId: m.id,
    });
  }
  function onPressEnd() {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  return (
    <div data-chat-view className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col overflow-hidden bg-background">
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
              <AvatarFrame wearer={other.cosmetics} size={36}>
                <Avatar name={peerName} hue={other.hue} size={36} src={other.avatarUrl ?? undefined} />
              </AvatarFrame>
              <PresenceDot lastSeenAt={otherLastSeen} size="sm" />
            </div>
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
                <DisplayName name={peerName} profile={other.cosmetics} className="truncate" />
                {other.verified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />}
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
            <MenuItem
              icon={Search}
              label="Find a message"
              onClick={() => {
                setHeaderMenu(false);
                setSearchOpen(true);
              }}
            />
            <MenuItem
              icon={PinIcon}
              label="Pinned"
              onClick={() => { setHeaderMenu(false); pinPane.open(); }}
            />
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
              onClick={() => { setHeaderMenu(false); leaveConversation(); }}
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

      {/* Messages — clicking here closes the GIF picker.
          Scrolls from the bottom (column-reverse), so a chat opens on its
          newest message from the first frame. It used to open wherever the
          top of the list fell and then get scrolled down by script, again
          each time a photo above loaded: a visible slide from the middle.
          Content growing above (media, older history) now leaves the view
          where it is, with nothing to correct. */}
      <div
        ref={scrollContainerRef}
        onScroll={onMessagesScroll}
        data-chat-scroll
        {...pinPane.threadHandlers}
        className="relative isolate flex flex-1 flex-col-reverse overflow-y-auto px-4 py-4"
        style={theme ? { background: theme.background } : undefined}
        onClick={() => { if (gifPickerOpen) setGifPickerOpen(false); }}
      >
        {theme?.ambient && <ChatAmbient kind={theme.ambient} />}
        {/* shrink-0: allowed to shrink, it would stop at the scroller's height
            and spill the wrong way, opening at the top again. */}
        <div className="flex min-h-full shrink-0 flex-col">
        {/* Older-history loader — appears at the top while a chunk loads in */}
        {loadingOlder && (
          <div className="flex justify-center py-2">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        )}
        {messages.length === 0 ? (
          <EmptyThread
            isGroup={isGroup}
            groupTitle={group?.title}
            groupMemberCount={group?.memberCount}
            other={other}
            onSayHey={() => void send("Hey")}
          />
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
              // Who is talking, beside what they said. The others' messages
              // all leave the same room for it, so a run stays in one line.
              const face = showsFace(m, next, currentUserId);
              const who = members?.[m.sender_id] ?? { name: other.name, hue: other.hue, avatarUrl: other.avatarUrl };
              // The face takes its initial from the same string as the
              // name above it, or the letter and the label disagree.
              const whoName = displayNameFor(m.sender_id, who.name, nicknames);
              // Their profile, behind their face. Only when the face is known
              // to be theirs: someone who has left a group falls back to
              // another member's details above, and must not link to them.
              const whoUsername =
                members?.[m.sender_id]?.username ?? (m.sender_id === other.id ? other.username : null);
              // The sender's own bubble style, else this side of the chat theme.
              const look = resolveBubble({ mine, senderStyleId: bubbleStyles[m.sender_id], theme });
              const lookCss = look ? bubbleCss(look.bubble) : null;
              // Animate only messages that arrived after the initial load.
              const isNew = !seenAtLoadRef.current.has(m.id);

              return (
                <div
                  key={m.id}
                  data-msg-id={m.id}
                  className={`relative ${isNew ? "animate-msg-in" : ""} ${
                    foundId === m.id ? "animate-found rounded-2xl" : ""
                  } ${picked?.has(m.id) ? "rounded-2xl bg-accent/10 ring-1 ring-accent/40" : ""}`}
                >
                  {/* The single-pointer way into a message's actions.
                      Invisible until it takes focus, so the bubbles look
                      exactly as they did, but it is in the tab order and
                      screen readers announce it — the hold that opens the
                      same menu is on a div with no role and no tabindex, so
                      keyboard and switch users could reach none of it. */}
                  {!m.is_unsent && (
                    <button
                      type="button"
                      onClick={(e) => {
                        const row = e.currentTarget.parentElement;
                        if (row) openMenu(m, row);
                      }}
                      className="sr-only focus:not-sr-only focus:absolute focus:right-1 focus:top-1 focus:z-10 focus:rounded-full focus:bg-elevated focus:px-2.5 focus:py-1 focus:text-[11px] focus:font-bold focus:text-foreground focus:outline focus:outline-2 focus:outline-accent"
                    >
                      Message options
                    </button>
                  )}
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
                  {i === firstEncryptedIndex && (
                    <div className="flex items-center justify-center gap-1.5 px-6 py-2 text-center text-[11px] font-semibold text-muted">
                      <Lock size={11} className="shrink-0 text-accent" />
                      Messages from here are end-to-end encrypted
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
                  <SwipeRow
                    actionFor={(direction) => swipeAction(m, currentUserId, direction, Date.now())}
                    onAction={(action) => doSwipe(m, action)}
                    // A claimed swipe is not also a long-press: the menu
                    // would open under the moving bubble.
                    onClaim={onPressEnd}
                  >
                  <div className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine && (
                      <span className="w-7 shrink-0" data-msg-face={face || undefined}>
                        {face && (
                          // Raised past whatever hangs under the bubble, so
                          // it is level with the bubble and not the reaction.
                          <span className="block" style={{ marginBottom: faceLift(m, reacts.length > 0, showTime) }}>
                            {whoUsername ? (
                              <Link
                                href={`/u/${whoUsername}`}
                                aria-label={`${whoName}'s profile`}
                                className="block rounded-full transition-transform active:scale-90"
                              >
                                <Avatar name={whoName} hue={who.hue} size={28} src={who.avatarUrl ?? undefined} />
                              </Link>
                            ) : (
                              <Avatar name={whoName} hue={who.hue} size={28} src={who.avatarUrl ?? undefined} />
                            )}
                          </span>
                        )}
                      </span>
                    )}
                    <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
                      {/* On the board, and said so here: otherwise the only
                          way to know a message is pinned is to go and look. */}
                      {m.pinned_at && (
                        <span className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                          <PinIcon size={9} className="shrink-0" />
                          Pinned
                        </span>
                      )}
                      {/* Where it came from, said once above the bubble and
                          in the same voice as "Pinned" — rather than inside
                          the words, which is where it used to be written.
                          Every kind, not only text: a forwarded photo is as
                          much a forward as a forwarded sentence.

                          Both labels are muted rather than faint: faint is
                          measured at 2.2–2.7:1 on this ground and fails
                          contrast, and two lines of label at different
                          brightness in one stack reads as a mistake. */}
                      {/* What a Show reply answers, above it. */}
                      {m.metadata?.show_id && !m.is_unsent && (
                        <ShowReplyCard showId={m.metadata.show_id} mine={mine} />
                      )}
                      {isForwarded(m) && !m.is_unsent && (
                        <span className="mb-0.5 flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
                          <ShareIcon size={9} weight="bold" className="shrink-0" />
                          Forwarded
                        </span>
                      )}
                      {showSender && (
                        // Who is talking, wearing what they bought. In a
                        // group of eight this is the fastest way to tell
                        // people apart — a colour read before a word is.
                        //
                        // The plate is a wash of about a third opacity, so
                        // it tints rather than covers. Over the dark base
                        // underneath, white sits around 13:1 on the
                        // strongest of them; the base is here so that holds
                        // whatever chat theme is behind it, rather than
                        // only on the default one.
                        //
                        // Behind the name and nothing else. A wash behind
                        // the words themselves is how a thread stops being
                        // readable, and the words are the point.
                        <span
                          className={`relative mb-0.5 self-start overflow-hidden rounded-md px-1.5 py-px text-[11px] font-semibold ${
                            members?.[m.sender_id]?.nameplate
                              ? "bg-black/75 text-foreground"
                              : "text-muted"
                          }`}
                        >
                          <Nameplate id={members?.[m.sender_id]?.nameplate} className="inset-0" />
                          <span className="relative">{senderName(m.sender_id)}</span>
                        </span>
                      )}
                      {replied && (
                        <div className="mb-0.5 max-w-full truncate rounded-lg border-l-2 border-accent/60 bg-surface px-2 py-1 text-[11px] text-muted">
                          <span className="font-semibold">{senderName(replied.sender_id)}</span>
                          {": "}
                          {msgSnippet(replied)}
                        </div>
                      )}

                      {/* Bubble */}
                      {m._enc === "locked" ? (
                        /* Encrypted, and this device cannot open it. If the device
                           simply has not been unlocked, tapping does something about
                           it. Otherwise (the sender's keys changed, the row is bad)
                           nothing here can help, and pretending it could would be
                           worse than saying so. The words are not lost either way —
                           a device that holds the key still reads them. */
                        <button
                          type="button"
                          disabled={reader.self !== "device-locked"}
                          onClick={openEncryptionSetup}
                          className={`relative flex min-w-[80px] items-center gap-1.5 rounded-2xl border border-border px-3.5 pt-2 pb-5 text-left text-sm italic text-faint enabled:active:opacity-70 ${mine ? "rounded-br-md" : "rounded-bl-md"}`}
                        >
                          <Lock size={12} className="shrink-0" />
                          {reader.self === "device-locked" ? "Unlock to read" : "Couldn’t decrypt this message"}
                          <span className="absolute bottom-1.5 right-2.5 text-[9px] font-medium leading-none text-faint/60">
                            {timeLabel(m.created_at)}
                          </span>
                        </button>
                      ) : m.is_unsent ? (
                        /* Unsent — time embedded inside at bottom-right */
                        <div className={`relative min-w-[80px] rounded-2xl border border-border px-3.5 pt-2 pb-5 text-sm italic text-faint ${mine ? "rounded-br-md" : "rounded-bl-md"}`}>
                          {mine ? "You unsent this message" : "This message was unsent"}
                          <span className="absolute bottom-1.5 right-2.5 text-[9px] font-medium leading-none text-faint/60">
                            {timeLabel(m.created_at)}
                          </span>
                        </div>
                      ) : m.kind === "post" && m.post ? (
                        withForwarded(m, "post",
                        <SharedPostCard
                          post={m.post}
                          author={m.postProfile ?? null}
                          slide={m.metadata?.slide}
                          showCaption={!m.metadata?.comment_id}
                          onMore={(rect) => setMenu({ msg: m, rect })}
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onClick={(e) => { if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; } }}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                        />)
                      ) : m.kind === "shot" && m.shot ? (
                        withForwarded(m, "shot",
                        <SharedShotCard
                          shot={m.shot}
                          author={m.shotProfile ?? null}
                          onMore={(rect) => setMenu({ msg: m, rect })}
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onClick={(e) => { if (suppressClick.current) { e.preventDefault(); suppressClick.current = false; } }}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                        />)
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
                      ) : m.kind === "music" && unpackTrack(m.body) ? (
                        // A song plays in the thread; no leaving for another app.
                        //
                        // The hold handlers are on the wrapper rather than the chip
                        // because the chip is a player, not a bubble. Without them a
                        // shared song was the one message in the thread that could
                        // not be replied to, forwarded, unsent or pinned at all.
                        // The click is stopped in the CAPTURE phase: the chip
                        // handles its own tap first, so a bubble-phase guard would
                        // run after the hold had already started playback.
                        <div
                          className="w-[230px] max-w-full"
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onClickCapture={(e) => { if (suppressClick.current) { e.preventDefault(); e.stopPropagation(); suppressClick.current = false; } }}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                        >
                          <TrackChip track={unpackTrack(m.body)!} />
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
                          <ChatLink
                            url={docUrl}
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
                          </ChatLink>
                        );
                      })() : (m.kind === "gif" || m.kind === "image") && m.body ? (
                        /* GIF / image — media bubble with time+status pill overlay */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          // A single photo opens full-screen, as a photo in a
                          // folder always has. It had no tap at all. Not a
                          // GIF: that already plays where it is.
                          onClick={m.kind === "image" ? () => openPhoto(m) : undefined}
                          role={m.kind === "image" ? "button" : undefined}
                          aria-label={m.kind === "image" ? "Open photo" : undefined}
                          className={`relative overflow-hidden rounded-2xl ${m.kind === "image" ? "cursor-zoom-in" : ""}`}
                          style={{ width: m.kind === "image" ? MEDIA_W : undefined, maxWidth: MEDIA_W }}
                        >
                          <ChatImg url={m._localUrl ?? m.body} alt={m.kind === "gif" ? "GIF" : ""} className="w-full rounded-2xl object-cover" />
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
                            onOpen={(start) => setAlbumView({ album: albumOf(m)!, start, senderId: m.sender_id, at: m.created_at, msgId: m.id })}
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
                          <ChatVideo url={m._localUrl ?? m.body} className="w-full rounded-2xl" controls playsInline preload="metadata" />
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
                        let voicePeaks: number[] | undefined;
                        try {
                          const p = JSON.parse(m.body);
                          voiceUrl = p.url ?? m.body;
                          voiceDuration = typeof p.duration === "number" ? p.duration : undefined;
                          if (Array.isArray(p.peaks) && p.peaks.every((n: unknown) => typeof n === "number")) {
                            voicePeaks = p.peaks as number[];
                          }
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
                            <VoiceMessage url={voiceUrl} storedDuration={voiceDuration} peaks={voicePeaks} mine={mine} />
                            {starBurstId === m.id && (
                              <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                                <Star size={44} className="animate-hype-pop fill-current text-hype drop-shadow-[0_2px_12px_rgba(255,208,0,0.7)]" />
                              </span>
                            )}
                          </div>
                        );
                      })() : readPoll(m) ? (
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative"
                        >
                          <PollBubble
                            poll={readPoll(m)!}
                            messageId={m.id}
                            mine={mine}
                            onError={(msg) => showToast(msg)}
                          />
                        </div>
                      ) : (
                        /* Plain text — time + status tick live inside bubble, bottom-right */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className={`relative min-w-[80px] max-w-full cursor-default select-none rounded-2xl px-3.5 pt-2 pb-5 text-sm ${
                            mine ? "rounded-br-md" : "rounded-bl-md"
                          } ${
                            mine && m._status === "failed"
                              ? "border border-danger/45 bg-danger/10 text-danger [&>span>span]:!text-danger/60"
                              : lookCss
                                ? lookCss.className
                                : mine
                                  ? "bg-accent text-accent-ink"
                                  : "bg-surface text-foreground"
                          } ${
                            look?.decor && showTime ? "mt-3" : ""
                          }`}
                          style={mine && m._status === "failed" ? undefined : lookCss?.style}
                        >
                          {look?.decor && showTime && <ChatThemeDecor decor={look.decor} mine={mine} />}
                          {forwardedBody(m.body)}
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

                      {/* A link in the message gets a card under it. Never
                          on an unsent one: the body is gone, and a card for
                          a message somebody took back would outlive it. */}
                      {m.kind === "text" && !m.is_unsent && firstPreviewable(m.body) && (
                        <LinkCard url={firstPreviewable(m.body)!} mine={mine} />
                      )}

                      {/* Reaction chips */}
                      {reacts.length > 0 && (
                        // Lifted into the bubble's bottom edge rather than
                        // parked under it, so the reaction belongs to the
                        // message instead of floating after it. The chip's
                        // own dark border is the gap.
                        <div
                          className={`relative z-10 -mt-2.5 flex flex-wrap gap-1 ${
                            mine ? "justify-end pr-2" : "justify-start pl-2"
                          }`}
                        >
                          {reacts.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              onClick={() => setReactionSheet(m.id)}
                              // Same grey as the embeds either side of it,
                              // never the brand colour: a reaction is the
                              // emoji, and a lime plate behind it only
                              // competes with the emoji for attention. Your
                              // own is marked by a lighter rim, not a fill.
                              // The dark border is what cuts it away from
                              // the bubble it overlaps, and it holds on a
                              // chat theme, which a background-matched ring
                              // would not.
                              className={`animate-react-pop flex items-center gap-0.5 rounded-full border-2 border-black/45 bg-elevated px-2 py-0.5 text-[13px] leading-none text-foreground shadow-sm transition-transform active:scale-90 ${
                                r.mine ? "ring-1 ring-inset ring-white/25" : ""
                              }`}
                            >
                              <span aria-label={reactionLabel(r.emoji, frameCatalog[frameIdOf(r.emoji) ?? ""]?.label)}>
                                <ReactionGlyph reaction={r.emoji} />
                              </span>
                              {r.count > 1 && <span className="ml-0.5 text-[11px] font-bold">{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* External time+status — for voice, document, post, and shot cards.
                          Plain text, gif, image, and video bubbles embed the time+tick inside themselves. */}
                      {(m.kind === "voice" || m.kind === "document" || m.kind === "album" || m.kind === "page_reply" || (m.kind === "poll" && !m.is_unsent) || (m.kind === "post" && m.post) || (m.kind === "shot" && m.shot)) &&
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
                          className="flex items-center justify-end gap-1 self-end px-1 py-1 text-[11px] font-semibold text-danger"
                        >
                          <AlertCircle size={13} strokeWidth={2.4} aria-hidden />
                          Not sent · Tap to retry
                        </button>
                      )}
                    </div>
                  </div>
                  </SwipeRow>
                  )}
                  {/* Group: the members who have read down to here. */}
                  {(markers.get(m.id)?.length ?? 0) > 0 && (
                    <div className="flex items-center justify-end gap-1 pr-1 pt-1" data-read-faces aria-label={`Seen by ${markers.get(m.id)!.map((id) => senderName(id)).join(", ")}`}>
                      {markers.get(m.id)!.slice(0, FACES_SHOWN).map((id) => (
                        <span key={id} className="animate-receipt-in block">
                          <Avatar name={senderName(id)} hue={members?.[id]?.hue ?? other.hue} size={16} src={members?.[id]?.avatarUrl ?? undefined} />
                        </span>
                      ))}
                      {markers.get(m.id)!.length > FACES_SHOWN && (
                        <span className="text-[10px] font-bold tabular-nums text-faint">+{markers.get(m.id)!.length - FACES_SHOWN}</span>
                      )}
                    </div>
                  )}
                  {/* The words under my newest message. */}
                  {myReceipt && myLast?.id === m.id && (
                    <div
                      data-receipt={myReceipt.kind}
                      className={`flex items-center justify-end gap-1 pr-1 pt-1 text-[11px] font-semibold ${
                        myReceipt.kind === "seen" ? "text-accent" : "text-faint"
                      }`}
                    >
                      {myReceipt.kind === "sending" && (
                        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-faint border-t-transparent motion-reduce:animate-none" aria-hidden />
                      )}
                      {myReceipt.kind === "sent" && <span className="h-2 w-2 rounded-full bg-faint" aria-hidden />}
                      <span key={myReceipt.kind} className="animate-receipt-in">
                        {myReceipt.kind === "sending" ? "Sending…" : myReceipt.kind === "sent" ? "Sent" : myReceipt.label}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Someone is recording or typing: a bubble where their message
                will land, beside their face. Recording takes priority — it
                replaces the text composer on the sender's side, so the two
                never happen together. */}
            {(recordingIds.length > 0 || typingIds.length > 0) && (() => {
              const recording = recordingIds.length > 0;
              const ids = recording ? recordingIds : typingIds;
              const first = members?.[ids[0]] ?? { name: other.name, hue: other.hue, avatarUrl: other.avatarUrl };
              return (
                <div className="flex flex-col items-start gap-0.5" data-activity={recording ? "recording" : "typing"} role="status">
                  {isGroup && (
                    <span className="pl-9 text-[11px] font-semibold text-muted">
                      {recording ? recordingLabel(ids) : typingLabel(ids)}
                    </span>
                  )}
                  {!isGroup && <span className="sr-only">{recording ? recordingLabel(ids) : typingLabel(ids)}</span>}
                  <div className="flex items-end gap-2">
                    <Avatar name={first.name} hue={first.hue} size={28} src={first.avatarUrl ?? undefined} />
                    {recording ? (
                      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3">
                        <Mic size={14} className="text-accent" />
                        <div className="flex h-4 items-end gap-[3px]">
                          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                            <span
                              key={i}
                              className="w-[3px] animate-mic-wave rounded-full bg-accent"
                              style={{ animationDelay: `${(i % 4) * 0.12 + (i > 3 ? 0.06 : 0)}s` }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3">
                        {[0, 0.15, 0.3].map((d, i) => (
                          <span key={i} className="h-2 w-2 animate-dot-bounce rounded-full bg-muted" style={{ animationDelay: `${d}s` }} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div ref={endRef} />
          </div>
        )}
        </div>
      </div>

      {searchOpen && (
        <ChatSearch
          conversationId={conversationId}
          nameOf={(id) => (id === currentUserId ? "You" : senderName(id))}
          dayLabel={(iso) => `${dayLabel(iso)}, ${timeLabel(iso)}`}
          onOpen={(m) => void goToMessage(m)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* Composer */}
      <div className="border-t border-border/60 bg-background px-3 py-2 pb-[calc(var(--sab)+8px)]">

        {/* ── Why this thread is not encrypted ──
            Said out loud rather than left to be assumed. Silence here would
            let someone believe a plaintext thread was protected, which is
            worse than not having encryption at all. */}
        {E2EE_ENABLED && !isGroup && !reader.loading && !canEncrypt(reader, other.id) && (
          <div className="mb-2 flex items-center gap-1.5 px-1 text-[11px] leading-snug text-faint">
            <Unlock size={11} className="shrink-0" />
            <span>
              {reader.self === "ready"
                ? `Not encrypted — ${other.name} hasn’t set up encrypted messaging yet.`
                : reader.self === "unavailable"
                ? "Not encrypted — couldn’t check your encryption right now."
                : "Not encrypted."}
            </span>
            {reader.self !== "ready" && reader.self !== "unavailable" && (
              <button
                type="button"
                onClick={openEncryptionSetup}
                className="font-semibold text-accent"
              >
                {reader.self === "device-locked"
                  ? "Unlock"
                  : reader.self === "recovery-pending"
                  ? "Finish setup"
                  : "Set up encrypted messaging"}
              </button>
            )}
          </div>
        )}

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
                  <video poster={BLANK_POSTER} src={attachment.preview} className="h-16 w-16 rounded-lg bg-black object-cover" muted playsInline preload="metadata" />
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

        {/* What is queued to go in this thread. Sender-only, by RLS. */}
        {selecting && (
          // Over the composer rather than above it: while picking, there
          // is nothing to type, and leaving a live box under a selection
          // invites typing into a thread that is not listening.
          <div className="flex items-center gap-2 border-t border-border bg-elevated px-3 py-2">
            <button
              type="button"
              onClick={() => setPicked(null)}
              aria-label="Stop selecting"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <X size={18} />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm font-bold tabular-nums">
              {picked.size} selected
            </span>
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => setForwardMany(pickedMessages())}
              className="shrink-0 rounded-xl bg-surface px-3 py-2 text-xs font-bold transition active:scale-95 disabled:opacity-40"
            >
              Forward
            </button>
            <button
              type="button"
              // Only your own. The server refuses anybody else's, and a
              // button that is going to be refused should not be offered.
              disabled={pickedMessages().every((m) => m.sender_id !== currentUserId)}
              onClick={() => {
                for (const m of pickedMessages()) {
                  if (m.sender_id === currentUserId && !m.is_unsent) unsend(m);
                }
                setPicked(null);
              }}
              className="shrink-0 rounded-xl bg-surface px-3 py-2 text-xs font-bold text-danger transition active:scale-95 disabled:opacity-40"
            >
              Unsend
            </button>
          </div>
        )}
        <ScheduledStrip conversationId={conversationId} />

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
                      if (o.mode === "poll") setPollOpen(true);
                      else if (o.mode === "gif") setGifPickerOpen(true);
                      else if (o.mode === "music") setSongPickerOpen(true);
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
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-muted transition hover:bg-elevated hover:text-foreground active:scale-90"
              >
                <Mic size={20} />
              </button>
            )}

            {/* Send — text (takes priority) or attachment */}
            {(text.trim() || attachment || editing) && (
              <button
                type="button"
                // Scheduling is for a typed message: there is nothing to
                // schedule while editing one that is already sent, and an
                // attachment would mean holding an uploaded object with no
                // message pointing at it.
                onPointerDown={() => {
                  if (editing || !text.trim()) return;
                  const h = sendHold.current;
                  h.opened = false;
                  if (h.timer) clearTimeout(h.timer);
                  h.timer = setTimeout(() => {
                    h.opened = true;
                    h.timer = null;
                    openScheduleSheet();
                  }, ATTACH_HOLD_MS);
                }}
                onPointerUp={cancelSendHold}
                onPointerLeave={cancelSendHold}
                onPointerCancel={cancelSendHold}
                onContextMenu={(e) => {
                  // Right-click and the Android long-press menu reach the
                  // same place, rather than offering to save the icon.
                  if (editing || !text.trim()) return;
                  e.preventDefault();
                  sendHold.current.opened = true;
                  openScheduleSheet();
                }}
                onClick={() => {
                  // The press that opened the sheet must not also send.
                  if (sendHold.current.opened) { sendHold.current.opened = false; return; }
                  if (editing || text.trim()) void send();
                  else void sendAttachment();
                }}
                disabled={sending || uploading}
                aria-label={editing ? "Save changes" : "Send"}
                aria-description={editing ? undefined : "Hold to send later"}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
              >
                {uploading ? (
                  <span className="flex gap-[3px]">
                    {[0, 0.1, 0.2].map((d, i) => (
                      <span key={i} className="h-[5px] w-[5px] rounded-full bg-accent-ink animate-dot-bounce"
                        style={{ animationDelay: `${d}s` }} />
                    ))}
                  </span>
                ) : (
                  editing ? <Check size={20} strokeWidth={2.75} /> : <SendIcon size={20} weight="fill" />
                )}
              </button>
            )}
          </div>
        )}

        {scheduleBody !== null && (
          <ScheduleSendSheet
            open
            onClose={() => setScheduleBody(null)}
            conversationId={conversationId}
            body={scheduleBody}
            replyToId={replyTo?.id ?? null}
            // Only once the row exists: a failed schedule leaves the words
            // in the composer rather than eating them.
            onScheduled={() => {
              setText("");
              setReplyTo(null);
              emitStopTyping();
            }}
          />
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
            // Whoever sent it, with their own picture: yours on yours, and
            // in a group the member's, not a blank one.
            albumView.senderId === currentUserId
              ? { name: "You", hue: self?.hue, avatarUrl: self?.avatarUrl ?? null }
              : isGroup
                ? {
                    name: senderName(albumView.senderId),
                    hue: members?.[albumView.senderId]?.hue,
                    avatarUrl: members?.[albumView.senderId]?.avatarUrl ?? null,
                  }
                : { name: other.name, hue: other.hue, avatarUrl: other.avatarUrl }
          }
          sentAt={`${dayLabel(albumView.at)}, ${timeLabel(albumView.at)}`}
          respond={
            viewed
              ? {
                  label: viewedFirst ? `Reply to ${viewedFirst}…` : "Reply…",
                  onReply: (body: string) => send(body, viewed),
                  onReact: (emoji: string) => toggleReaction(viewed.id, emoji),
                }
              : undefined
          }
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
                {/* What you own, under what everybody has. A second row
                    rather than mixed in: six emoji is a thing you read at
                    a glance, and burying them among frames would cost
                    that for everyone who owns none. */}
                {wearableReactionFrames.length > 0 && (
                  <div className={`mb-2 flex w-fit gap-0.5 rounded-pill bg-elevated p-1 shadow-xl ring-1 ring-border ${mine ? "ml-auto" : ""}`}>
                    {wearableReactionFrames.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        aria-label={`React with ${f.label}`}
                        onClick={() => { toggleReaction(menu.msg.id, frameReaction(f.id)); setMenu(null); }}
                        className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-125 active:scale-110"
                      >
                        <ReactionGlyph reaction={frameReaction(f.id)} size={22} />
                      </button>
                    ))}
                  </div>
                )}
                {/* Actions */}
                <div className={`w-44 overflow-hidden rounded-2xl bg-elevated p-1 shadow-xl ring-1 ring-border ${mine ? "ml-auto" : ""}`}>
                  <CtxItem icon={<Reply size={17} />} label="Reply" onClick={() => { setReplyTo(menu.msg); setMenu(null); }} />
                  <CtxItem icon={<Check size={17} />} label="Select" onClick={() => startSelecting(menu.msg)} />
                  {!menu.msg.is_unsent && (
                    <CtxItem icon={<ShareIcon size={17} weight="bold" />} label="Forward" onClick={() => { setForwardMsg(menu.msg); setMenu(null); }} />
                  )}
                  {menu.msg.body && menu.msg.kind !== "album" && <CtxItem icon={<Copy size={17} />} label="Copy" onClick={() => { copy(menu.msg); setMenu(null); }} />}
                  {canPin(menu.msg.kind, menu.msg.is_unsent) && !menu.msg.id.startsWith("temp-") && (
                    <CtxItem
                      icon={<PinIcon size={17} />}
                      label={menu.msg.pinned_at ? "Unpin" : "Pin"}
                      onClick={() => { togglePin(menu.msg); setMenu(null); }}
                    />
                  )}
                  {canEdit(menu.msg, currentUserId, menu.at) && menu.msg.kind === "text" && (
                    <CtxItem icon={<Pencil size={17} />} label="Edit" onClick={() => { startEdit(menu.msg); setMenu(null); }} />
                  )}
                  {canEdit(menu.msg, currentUserId, menu.at) && menu.msg.kind === "album" && (
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
                  // Whoever reacted, with their own picture: yours on yours, and
                  // in a group the member's. Only the other person in a
                  // one-to-one chat used to get theirs.
                  const hue = isMine ? (self?.hue ?? 280) : members?.[r.user_id]?.hue ?? other.hue;
                  const face = isMine ? self?.avatarUrl : members?.[r.user_id] ? members[r.user_id].avatarUrl : other.avatarUrl;
                  return (
                    <button
                      key={`${r.user_id}-${r.emoji}`}
                      type="button"
                      onClick={() => {
                        if (isMine) { toggleReaction(reactionSheet, r.emoji); setReactionSheet(null); }
                      }}
                      className={`flex items-center gap-3 rounded-xl px-2 py-2.5 text-left ${isMine ? "hover:bg-white/5" : "cursor-default"}`}
                    >
                      <Avatar name={name} hue={hue} size={40} src={face ?? undefined} />
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
      <TrackPicker
        open={songPickerOpen}
        onClose={() => setSongPickerOpen(false)}
        onSelect={(t) => void sendSong(t)}
      />

      <PollComposer
        open={pollOpen}
        onClose={() => setPollOpen(false)}
        onSend={sendPoll}
      />
      <ForwardSheet open={!!forwardMsg} onClose={() => setForwardMsg(null)} msg={forwardMsg} />
      <ForwardSheet
        open={forwardMany.length > 0}
        onClose={() => {
          setForwardMany([]);
          setPicked(null);
        }}
        msgs={forwardMany}
      />

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

      {/* The pin board, as the chat's second pane. Last child, so it sits
          over the thread rather than under the composer, and the thread
          stays mounted behind it — which is what lets tapping a pinned card
          close the pane and reach a message already on screen. */}
      <PinPane
        pane={pinPane}
        conversationId={conversationId}
        me={currentUserId}
        people={isGroup ? Object.fromEntries((group?.members ?? []).map((m) => [m.id, { name: m.name }])) : { [other.id]: { name: other.name } }}
        isGroup={isGroup}
        onOpenMessage={(id) => void goToMessage({ id } as FoundMessage)}
      />

    </div>
  );
}


/**
 * One reaction, drawn.
 *
 * An emoji is a character and draws itself. A frame is a token naming a
 * thing in the catalogue, and draws the artwork.
 *
 * Anything else draws as text. The column is free text — a client can
 * write what it likes into it — so the fallback is not politeness, it is
 * the only honest thing to do with a token nobody recognises, and text
 * is what the column held before frames existed.
 */
function ReactionGlyph({ reaction, size = 17 }: { reaction: string; size?: number }) {
  const catalog = useFrameCatalog();
  const id = frameIdOf(reaction);
  if (!id) return <>{reaction}</>;
  const asset = catalog[id];
  if (!asset?.url) return <>{reaction}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.url}
      alt=""
      width={size}
      height={size}
      className="inline-block align-middle"
      style={{ width: size, height: size, objectFit: "contain" }}
    />
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

  // Failed is said in words under the message ("Not sent · Tap to retry"),
  // and by the bubble itself where it is text.
  // Sent and seen are not said in the bubble any more: they are the words
  // (or, in a group, the faces) under the message. See lib/chat-receipts.
  return null;
}
