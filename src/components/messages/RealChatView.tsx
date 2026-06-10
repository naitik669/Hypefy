"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send, Reply, Copy, Trash2, Flag, Users, Play, Phone, Video, MoreVertical, UserCircle, BellOff, Ban, X, Mic, Star, Paperclip, LogOut, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCallControls } from "@/components/calls/CallProvider";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { VoiceRecorder } from "@/components/messages/VoiceRecorder";
import { VoiceMessage } from "@/components/messages/VoiceMessage";
import { GifPicker } from "@/components/messages/GifPicker";

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
  /** Client-only: set on optimistic messages before server confirms */
  _status?: "pending" | "failed";
};

type MsgStatus = "pending" | "sent" | "seen" | "failed";

type ReactionRow = { message_id: string; user_id: string; emoji: string };
type Other = { id: string; name: string; username: string | null; hue: number; avatarUrl?: string | null };

const REPORT_REASONS = ["Spam", "Harassment", "Hate or abuse", "Scam", "Inappropriate content", "Other"];
const QUICK = ["❤️", "🥰", "😂", "👍", "😮", "😢"];

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
  initialOtherLastReadAt = null,
}: {
  conversationId: string;
  currentUserId: string;
  other: Other;
  group?: { title: string; memberCount: number } | null;
  members?: Record<string, { name: string; hue: number }>;
  initialMessages: ChatMsg[];
  initialReactions?: ReactionRow[];
  initialOtherLastReadAt?: string | null;
}) {
  const isGroup = !!group;
  const senderName = (id: string) => (id === currentUserId ? "You" : members?.[id]?.name ?? other.name);
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [reactions, setReactions] = useState<ReactionRow[]>(initialReactions);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(initialOtherLastReadAt);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [editing, setEditing] = useState<ChatMsg | null>(null);
  const [menu, setMenu] = useState<{ msg: ChatMsg; rect: DOMRect } | null>(null);
  const [reportMsg, setReportMsg] = useState<ChatMsg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [callChooser, setCallChooser] = useState(false);
  const [headerMenu, setHeaderMenu] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [starBurstId, setStarBurstId] = useState<string | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [attachment, setAttachment] = useState<{
    file: File;
    preview: string;
    type: "image" | "video";
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [muted, setMuted] = useState(false);
  const { startCall } = useCallControls();

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
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const idsRef = useRef<string[]>([]);
  /** Tracks the last tap per message to detect double-tap (star reaction) */
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  idsRef.current = messages.map((m) => m.id);

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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }

  /** Derives the display status for one of my outgoing messages. */
  function getMsgStatus(m: ChatMsg): MsgStatus {
    if (m._status === "failed") return "failed";
    if (m._status === "pending") return "pending";
    // In group chats we don't track individual read receipts — just show "sent"
    if (!isGroup && otherLastReadAt && m.created_at <= otherLastReadAt) return "seen";
    return "sent";
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Close the long-press menu on Escape.
  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenu(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  useEffect(() => {
    // NOTE: supabase.rpc() is lazy â€” it only fires when awaited/then'd.
    supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId }).then(() => {});
  }, [conversationId, supabase]);

  async function hydratePost(msgId: string, postId: string) {
    const { data } = await supabase
      .from("posts")
      .select("id, caption, image_url, image_urls, profiles(username, display_name, avatar_hue, avatar_url)")
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

  // Realtime: messages
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ChatMsg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, post: null }]));
          if (m.kind === "post" && m.post_id) hydratePost(m.id, m.post_id);
          if (m.kind === "shot" && m.shot_id) hydrateShot(m.id, m.shot_id);
          if (m.sender_id !== currentUserId) supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId }).then(() => {});
        })
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ChatMsg;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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

  // Realtime: other user's read receipt -- drives "Seen" double-tick
  useEffect(() => {
    if (!other.id) return;
    const ch = supabase
      .channel(`read:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversation_members",
          filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string | null };
          // Only update when it's the other person who read
          if (row.user_id !== currentUserId) {
            setOtherLastReadAt(row.last_read_at ?? null);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, currentUserId, other.id, supabase]);

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
    setSending(true);
    setText("");
    const replyId = replyTo?.id ?? null;
    setReplyTo(null);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body, sender_id: currentUserId, kind: "text",
      post_id: null, reply_to_id: replyId, is_unsent: false, created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: body, p_kind: "text", p_post_id: null, p_reply_to_id: replyId,
    });
    if (error || !data) {
      // Keep message visible but mark it failed
      setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, _status: "failed" as const } : m)));
      showToast("Couldn't send. Try again.");
    } else {
      setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, ...(data as ChatMsg), _status: undefined } : m)));
    }
    setSending(false);
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

    const { error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId,
      p_body: body,
      p_kind: "voice",
      p_post_id: null,
      p_reply_to_id: replyId,
    });

    if (error) showToast("Couldn't send voice note.");
    setVoiceMode(false);
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
      p_post_id: null, p_reply_to_id: replyId,
    });
    if (error || !data) {
      setMessages((p) => p.map((m) => m.id === tempId ? { ...m, _status: "failed" as const } : m));
      showToast("Couldn't send GIF.");
    } else {
      setMessages((p) => p.map((m) => m.id === tempId ? { ...m, ...(data as ChatMsg), _status: undefined } : m));
    }
    setSending(false);
  }

  /** Handle file input change — build a preview and store the attachment. */
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setGifPickerOpen(false);
    const isVideo = file.type.startsWith("video/");
    const preview = URL.createObjectURL(file);
    setAttachment({ file, preview, type: isVideo ? "video" : "image" });
    e.target.value = ""; // reset so same file can be re-picked
  }

  /** Upload the staged attachment to Supabase Storage and send as a message. */
  async function sendAttachment() {
    if (!attachment || uploading) return;
    setUploading(true);

    const ext = attachment.file.name.split(".").pop()
      ?? (attachment.type === "video" ? "mp4" : "jpg");
    const path = `${currentUserId}/${Date.now()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("chat-media")
      .upload(path, attachment.file, { contentType: attachment.file.type });

    if (uploadErr) {
      showToast("Upload failed. Try again.");
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from("chat-media")
      .getPublicUrl(path);

    const replyId = replyTo?.id ?? null;
    setReplyTo(null);
    const kind = attachment.type; // "image" | "video"

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMsg = {
      id: tempId, body: publicUrl, sender_id: currentUserId, kind,
      post_id: null, reply_to_id: replyId, is_unsent: false,
      created_at: new Date().toISOString(), _status: "pending",
    };
    setMessages((p) => [...p, optimistic]);
    URL.revokeObjectURL(attachment.preview);
    setAttachment(null);

    const { data, error } = await supabase.rpc("send_message", {
      p_conversation_id: conversationId, p_body: publicUrl, p_kind: kind,
      p_post_id: null, p_reply_to_id: replyId,
    });
    if (error || !data) {
      setMessages((p) => p.map((m) => m.id === tempId ? { ...m, _status: "failed" as const } : m));
      showToast("Couldn't send. Try again.");
    } else {
      setMessages((p) => p.map((m) => m.id === tempId ? { ...m, ...(data as ChatMsg), _status: undefined } : m));
    }
    setUploading(false);
  }

  async function unsend(m: ChatMsg) {
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, is_unsent: true, body: null } : x)));
    const { error } = await supabase.rpc("unsend_message", { p_message_id: m.id });
    if (error) showToast("Couldn't unsend");
  }

  function startEdit(m: ChatMsg) {
    setEditing(m);
    setReplyTo(null);
    setText(m.body ?? "");
  }

  async function saveEdit() {
    if (!editing || !text.trim()) return;
    const id = editing.id;
    const newBody = text.trim();
    setMessages((p) => p.map((x) => (x.id === id ? { ...x, body: newBody, edited_at: new Date().toISOString() } : x)));
    setEditing(null);
    setText("");
    const { error } = await supabase.rpc("edit_message", { p_message_id: id, p_body: newBody });
    if (error) showToast("Couldn't edit message");
  }

  async function submitReport(reason: string) {
    if (!reportMsg) return;
    const m = reportMsg;
    setReportMsg(null);
    const { error } = await supabase.rpc("report_message", { p_message_id: m.id, p_reason: reason, p_details: null });
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
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-2 backdrop-blur-xl">
        <button type="button" onClick={() => router.back()} aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5">
          <ChevronLeft size={24} />
        </button>
        {isGroup ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[30%]"
              style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}>
              <Users size={18} className="text-white/95" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{group!.title}</p>
              <p className="truncate text-xs text-muted">{group!.memberCount} members</p>
            </div>
          </div>
        ) : (
          <Link href={other.username ? `/u/${other.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={other.name} hue={other.hue} size={36} src={other.avatarUrl ?? undefined} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{other.name}</p>
              {other.username && <p className="truncate text-xs text-muted">@{other.username}</p>}
            </div>
          </Link>
        )}

        {/* Right actions: call + options */}
        <div className="relative flex shrink-0 items-center gap-0.5">
          {!isGroup && (
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
          {callChooser && (
            <>
              <div className="fixed inset-0 z-40" onPointerDown={() => setCallChooser(false)} />
              <div className="absolute right-9 top-12 z-50 w-44 overflow-hidden rounded-2xl border border-border bg-elevated py-1 shadow-2xl">
                <button type="button"
                  onClick={() => { setCallChooser(false); placeCall("audio"); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5">
                  <Phone size={17} className="text-accent" /> Audio call
                </button>
                <button type="button"
                  onClick={() => { setCallChooser(false); placeCall("video"); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5">
                  <Video size={17} className="text-accent" /> Video call
                </button>
              </div>
            </>
          )}

          {headerMenu && (
            <>
              <div className="fixed inset-0 z-40" onPointerDown={() => setHeaderMenu(false)} />
              <div className="absolute right-1 top-12 z-50 w-52 overflow-hidden rounded-2xl border border-border bg-elevated py-1 shadow-2xl">
                {!isGroup && other.username && (
                  <Link href={`/u/${other.username}`} onClick={() => setHeaderMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5">
                    <UserCircle size={17} className="text-muted" /> View profile
                  </Link>
                )}
                <button type="button"
                  onClick={toggleMute}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5">
                  <BellOff size={17} className={muted ? "text-accent" : "text-muted"} />
                  {muted ? "Unmute notifications" : "Mute notifications"}
                </button>
                <button type="button"
                  onClick={() => { setHeaderMenu(false); setConfirmLeave(true); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5">
                  <LogOut size={17} className="text-muted" /> {isGroup ? "Leave group" : "Delete chat"}
                </button>
                <div className="my-1 h-px bg-border" />
                {isGroup ? (
                  <button type="button"
                    onClick={() => { setHeaderMenu(false); showToast("Reported group"); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/5">
                    <Ban size={17} /> Report group
                  </button>
                ) : (
                  <button type="button"
                    onClick={blockUser}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/5">
                    <Ban size={17} /> Block user
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* Messages — clicking here closes the GIF picker */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4"
        onClick={() => { if (gifPickerOpen) setGifPickerOpen(false); }}
      >
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

              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-semibold text-muted">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
                      {showSender && (
                        <span className="mb-0.5 px-1 text-[11px] font-semibold text-muted">{senderName(m.sender_id)}</span>
                      )}
                      {replied && (
                        <div className="mb-0.5 max-w-full truncate rounded-lg border-l-2 border-accent/60 bg-surface px-2 py-1 text-[11px] text-muted">
                          <span className="font-semibold">{senderName(replied.sender_id)}</span>
                          {": "}
                          {replied.is_unsent ? "Unsent message" : replied.body ?? (replied.kind === "shot" ? "Shot" : "Post")}
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
                      ) : (m.kind === "gif" || m.kind === "image") && m.body ? (
                        /* GIF / image — media bubble with time+status pill overlay */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative overflow-hidden rounded-2xl"
                          style={{ maxWidth: 240 }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={m.body} alt={m.kind === "gif" ? "GIF" : ""} className="w-full rounded-2xl object-cover" />
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
                      ) : m.kind === "video" && m.body ? (
                        /* Video bubble — player with time+status overlay */
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className="relative overflow-hidden rounded-2xl bg-black"
                          style={{ maxWidth: 240 }}
                        >
                          <video src={m.body} className="w-full rounded-2xl" controls playsInline preload="metadata" />
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
                            mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface text-foreground"
                          }`}
                        >
                          {m.body}
                          {/* Time + status always at bottom-right inside the bubble */}
                          <span className="absolute bottom-1.5 right-2.5 flex items-center gap-[3px]">
                            {m.edited_at && (
                              <span className={`text-[9px] font-medium italic leading-none ${mine ? "text-accent-ink/45" : "text-faint"}`}>
                                edited ·
                              </span>
                            )}
                            <span className={`text-[9px] font-medium leading-none ${mine ? "text-accent-ink/45" : "text-faint"}`}>
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
                              onClick={() => toggleReaction(m.id, r.emoji)}
                              className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] leading-none ${
                                r.mine ? "bg-accent/20 ring-1 ring-accent/40" : "bg-surface ring-1 ring-border"
                              }`}
                            >
                              <span>{r.emoji}</span>
                              {r.count > 1 && <span className="font-semibold text-foreground">{r.count}</span>}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* External time+status — only for voice, post, and shot cards.
                          Plain text, gif, image, and video bubbles embed the time+tick inside themselves. */}
                      {(m.kind === "voice" || (m.kind === "post" && m.post) || (m.kind === "shot" && m.shot)) &&
                        (showTime || (mine && m._status === "failed")) && (
                        <div className={`flex items-center gap-1 px-1 pt-0.5 ${mine ? "justify-end" : "justify-start"}`}>
                          {showTime && (
                            <span className="text-[10px] text-faint">{timeLabel(m.created_at)}</span>
                          )}
                          {mine && <MsgStatusTick status={getMsgStatus(m)} />}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border/60 bg-background px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">

        {/* ── GIF picker panel — slides in just above the input row ── */}
        {gifPickerOpen && !voiceMode && (
          <div className="mb-2">
            <GifPicker onSelect={sendGif} />
          </div>
        )}

        {/* ── Attachment preview ── */}
        {attachment && !voiceMode && (
          <div className="mb-2 flex items-start gap-2 rounded-xl border border-border/60 bg-surface p-2">
            {attachment.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attachment.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
            ) : (
              <video src={attachment.preview} className="h-16 w-16 rounded-lg bg-black object-cover" muted playsInline preload="metadata" />
            )}
            <div className="min-w-0 flex-1 py-1">
              <p className="truncate text-xs font-semibold">{attachment.file.name}</p>
              <p className="text-[10px] text-faint capitalize">{attachment.type}</p>
            </div>
            <button
              type="button"
              onClick={() => { URL.revokeObjectURL(attachment.preview); setAttachment(null); }}
              aria-label="Remove attachment"
              className="shrink-0 text-faint hover:text-muted"
            >
              <X size={16} />
            </button>
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
              : {replyTo.is_unsent ? "Unsent" : replyTo.body ?? (replyTo.kind === "shot" ? "Shot" : "Post")}
            </span>
            <button onClick={() => setReplyTo(null)} className="text-faint hover:text-muted"><X size={14} /></button>
          </div>
        )}

        {/* Editing banner */}
        {editing && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs">
            <Pencil size={13} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-muted">
              Editing: <span className="text-foreground">{editing.body}</span>
            </span>
            <button onClick={() => { setEditing(null); setText(""); }} className="text-faint hover:text-muted"><X size={14} /></button>
          </div>
        )}

        {voiceMode ? (
          /* ── Voice recorder ── replaces the input row entirely */
          <VoiceRecorder onSend={sendVoice} onCancel={() => setVoiceMode(false)} />
        ) : (
          /* ── Text / GIF / attachment composer ── */
          <div className="flex items-center gap-1.5">

            {/* Attachment button — always visible */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach photo or video"
              className={`flex h-11 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
                attachment ? "text-accent" : "text-muted hover:bg-surface hover:text-foreground"
              }`}
            >
              <Paperclip size={19} />
            </button>

            {/* Text input */}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Message…"
              className="h-11 flex-1 rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
            />

            {/* GIF toggle — only when no text and no attachment */}
            {!text.trim() && !attachment && (
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
            {!text.trim() && !attachment && (
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
            {(text.trim() || attachment) && (
              <button
                type="button"
                onClick={text.trim() ? send : sendAttachment}
                disabled={sending || uploading}
                aria-label="Send"
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
                  <Send size={18} />
                )}
              </button>
            )}
          </div>
        )}

        {/* Hidden file input — triggered by the Paperclip button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={pickFile}
        />
      </div>

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
                  <MenuItem icon={<Reply size={17} />} label="Reply" onClick={() => { setReplyTo(menu.msg); setMenu(null); }} />
                  {menu.msg.body && <MenuItem icon={<Copy size={17} />} label="Copy" onClick={() => { copy(menu.msg); setMenu(null); }} />}
                  {menu.msg.sender_id === currentUserId && menu.msg.kind === "text" && !menu.msg.is_unsent && (
                    <MenuItem icon={<Pencil size={17} />} label="Edit" onClick={() => { startEdit(menu.msg); setMenu(null); }} />
                  )}
                  {mine ? (
                    <MenuItem danger icon={<Trash2 size={17} />} label="Unsend" onClick={() => { unsend(menu.msg); setMenu(null); }} />
                  ) : (
                    <MenuItem danger icon={<Flag size={17} />} label="Report" onClick={() => { setReportMsg(menu.msg); setMenu(null); }} />
                  )}
                </div>
              </div>
            </div>
          </>
        );
      })()}

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

      {/* Confirm leave / delete chat */}
      {confirmLeave && (
        <>
          <div className="fixed inset-0 z-[200] bg-black/60" onClick={() => setConfirmLeave(false)} />
          <div className="fixed inset-x-6 top-1/2 z-[210] -translate-y-1/2 rounded-2xl bg-elevated p-5 ring-1 ring-border">
            <p className="text-base font-bold">{isGroup ? "Leave this group?" : "Delete this chat?"}</p>
            <p className="mt-1 text-sm text-muted">
              {isGroup
                ? "You'll stop receiving messages and the chat disappears from your inbox."
                : "The conversation disappears from your inbox. The other person keeps their copy."}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold hover:bg-white/5">
                Cancel
              </button>
              <button type="button" onClick={leaveConversation}
                className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-bold text-white">
                {isGroup ? "Leave" : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-[210] -translate-x-1/2 rounded-pill bg-elevated px-4 py-2 text-sm font-semibold shadow-lg ring-1 ring-border">
          {toast}
        </div>
      )}
    </div>
  );
}


function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-white/5 ${danger ? "text-danger" : "text-foreground"}`}>
      {icon}
      {label}
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
