"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send, Reply, Copy, Trash2, Flag, Users, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";

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
  created_at: string;
  post?: PostPreview | null;
  postProfile?: ShareProfile | null;
  shot?: ShotPreview | null;
  shotProfile?: ShareProfile | null;
};

type ReactionRow = { message_id: string; user_id: string; emoji: string };
type Other = { id: string; name: string; username: string | null; hue: number };

const REPORT_REASONS = ["Spam", "Harassment", "Hate or abuse", "Scam", "Inappropriate content", "Other"];
const QUICK = ["❤️", "🔥", "😂", "👍", "😮", "😢"];

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
  if (diff > 1 && diff < 7) return d.toLocaleDateString([], { weekday: "long" });
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
}: {
  conversationId: string;
  currentUserId: string;
  other: Other;
  group?: { title: string; memberCount: number } | null;
  members?: Record<string, { name: string; hue: number }>;
  initialMessages: ChatMsg[];
  initialReactions?: ReactionRow[];
}) {
  const isGroup = !!group;
  const senderName = (id: string) => (id === currentUserId ? "You" : members?.[id]?.name ?? other.name);
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [reactions, setReactions] = useState<ReactionRow[]>(initialReactions);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [menu, setMenu] = useState<{ msg: ChatMsg; rect: DOMRect } | null>(null);
  const [reportMsg, setReportMsg] = useState<ChatMsg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const idsRef = useRef<string[]>([]);
  idsRef.current = messages.map((m) => m.id);

  const byId = useMemo(() => {
    const m = new Map<string, ChatMsg>();
    messages.forEach((x) => m.set(x.id, x));
    return m;
  }, [messages]);

  // emoji → { count, mine } per message
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

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Close the long-press menu on Escape.
  useEffect(() => {
    if (!menu) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenu(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  useEffect(() => {
    supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  }, [conversationId, supabase]);

  async function hydratePost(msgId: string, postId: string) {
    const { data } = await supabase
      .from("posts")
      .select("id, caption, image_url, image_urls, profiles(username, display_name, avatar_hue)")
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
      .select("id, media_url, caption, profiles(username, display_name, avatar_hue)")
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
          if (m.sender_id !== currentUserId) supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
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

  function toggleReaction(messageId: string, emoji: string) {
    setReactions((prev) => {
      const mineRow = prev.find((r) => r.message_id === messageId && r.user_id === currentUserId);
      const without = prev.filter((r) => !(r.message_id === messageId && r.user_id === currentUserId));
      if (mineRow && mineRow.emoji === emoji) return without;
      return [...without, { message_id: messageId, user_id: currentUserId, emoji }];
    });
    supabase.rpc("toggle_reaction", { p_message_id: messageId, p_emoji: emoji });
  }

  async function send() {
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
      setMessages((p) => p.filter((m) => m.id !== tempId));
      setText(body);
      showToast("Couldn't send. Try again.");
    } else {
      setMessages((p) => p.map((m) => (m.id === tempId ? { ...m, ...(data as ChatMsg) } : m)));
    }
    setSending(false);
  }

  async function unsend(m: ChatMsg) {
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, is_unsent: true, body: null } : x)));
    const { error } = await supabase.rpc("unsend_message", { p_message_id: m.id });
    if (error) showToast("Couldn't unsend");
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

  // Long-press → context menu
  function onPressStart(m: ChatMsg, e: React.PointerEvent) {
    if (m.is_unsent) return;
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
            <Avatar name={other.name} hue={other.hue} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{other.name}</p>
              {other.username && <p className="truncate text-xs text-muted">@{other.username}</p>}
            </div>
          </Link>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            {isGroup ? (
              <span className="flex h-16 w-16 items-center justify-center rounded-[30%]"
                style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}>
                <Users size={30} className="text-white/95" />
              </span>
            ) : (
              <Avatar name={other.name} hue={other.hue} size={64} />
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
                        <div className={`rounded-2xl border border-border px-3.5 py-2 text-sm italic text-faint ${mine ? "rounded-br-md" : "rounded-bl-md"}`}>
                          {mine ? "You unsent this message" : "This message was unsent"}
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
                          <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
                            <Play size={18} className="ml-0.5 fill-white" />
                          </span>
                          <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                            <Play size={9} className="fill-white" /> Shot
                          </span>
                          <div className="absolute inset-x-0 bottom-0 p-2.5">
                            {m.shotProfile?.username && <p className="text-xs font-bold text-white drop-shadow">@{m.shotProfile.username}</p>}
                            {m.shot.caption && <p className="line-clamp-1 text-[11px] text-white/85 drop-shadow">{m.shot.caption}</p>}
                          </div>
                        </Link>
                      ) : (
                        <div
                          onPointerDown={(e) => onPressStart(m, e)}
                          onPointerUp={onPressEnd}
                          onPointerMove={onPressEnd}
                          onPointerLeave={onPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setMenu({ msg: m, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() }); }}
                          className={`max-w-full cursor-default select-none rounded-2xl px-3.5 py-2 text-sm ${
                            mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface text-foreground"
                          }`}
                        >
                          {m.body}
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

                      {showTime && <span className="px-1 pt-0.5 text-[10px] text-faint">{timeLabel(m.created_at)}</span>}
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
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-surface px-3 py-1.5 text-xs">
            <Reply size={13} className="text-accent" />
            <span className="min-w-0 flex-1 truncate text-muted">
              Replying to{" "}
              <span className="font-semibold text-foreground">
                {replyTo.sender_id === currentUserId ? "yourself" : senderName(replyTo.sender_id)}
              </span>
              : {replyTo.is_unsent ? "Unsent" : replyTo.body ?? (replyTo.kind === "shot" ? "Shot" : "Post")}
            </span>
            <button onClick={() => setReplyTo(null)} className="text-faint hover:text-muted">✕</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Message…"
            className="h-11 flex-1 rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
          />
          <button type="button" onClick={send} disabled={!text.trim() || sending} aria-label="Send"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40">
            <Send size={18} />
          </button>
        </div>
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
