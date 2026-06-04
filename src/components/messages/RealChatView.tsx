"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Send, Reply, Copy, Trash2, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";

type PostPreview = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
};

export type ChatMsg = {
  id: string;
  body: string | null;
  sender_id: string;
  kind: string;
  post_id: string | null;
  reply_to_id: string | null;
  is_unsent: boolean;
  created_at: string;
  post?: PostPreview | null;
  postProfile?: { username: string | null; display_name: string | null; avatar_hue: number | null } | null;
};

type Other = { id: string; name: string; username: string | null; hue: number };

const REPORT_REASONS = ["Spam", "Harassment", "Hate or abuse", "Scam", "Inappropriate content", "Other"];

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function RealChatView({
  conversationId,
  currentUserId,
  other,
  initialMessages,
}: {
  conversationId: string;
  currentUserId: string;
  other: Other;
  initialMessages: ChatMsg[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [actionMsg, setActionMsg] = useState<ChatMsg | null>(null);
  const [reportMsg, setReportMsg] = useState<ChatMsg | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const m = new Map<string, ChatMsg>();
    messages.forEach((x) => m.set(x.id, x));
    return m;
  }, [messages]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Mark read on open
  useEffect(() => {
    supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  }, [conversationId, supabase]);

  // Fetch the shared post for a message so its embed renders (realtime/optimistic).
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

  // Realtime: INSERT + UPDATE (unsend)
  useEffect(() => {
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const m = payload.new as ChatMsg;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, { ...m, post: null }]));
          if (m.kind === "post" && m.post_id) hydratePost(m.id, m.post_id);
          if (m.sender_id !== currentUserId) {
            supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
          }
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
      p_conversation_id: conversationId, p_body: body, p_kind: "text",
      p_post_id: null, p_reply_to_id: replyId,
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
    setActionMsg(null);
    setMessages((p) => p.map((x) => (x.id === m.id ? { ...x, is_unsent: true, body: null } : x)));
    const { error } = await supabase.rpc("unsend_message", { p_message_id: m.id });
    if (error) { showToast("Couldn't unsend"); }
  }

  async function submitReport(reason: string) {
    if (!reportMsg) return;
    const m = reportMsg;
    setReportMsg(null);
    const { error } = await supabase.rpc("report_message", { p_message_id: m.id, p_reason: reason, p_details: null });
    showToast(error ? "Report already sent" : "Report sent");
  }

  function copy(m: ChatMsg) {
    setActionMsg(null);
    if (m.body) { navigator.clipboard.writeText(m.body).catch(() => {}); showToast("Copied"); }
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-2 backdrop-blur-xl">
        <button type="button" onClick={() => router.back()} aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5">
          <ChevronLeft size={24} />
        </button>
        <Link href={other.username ? `/u/${other.username}` : "#"} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar name={other.name} hue={other.hue} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{other.name}</p>
            {other.username && <p className="truncate text-xs text-muted">@{other.username}</p>}
          </div>
        </Link>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Avatar name={other.name} hue={other.hue} size={64} />
            <p className="mt-2 text-sm font-semibold">{other.name}</p>
            <p className="text-xs text-muted">This is the start of your conversation.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {messages.map((m) => {
              const mine = m.sender_id === currentUserId;
              const replied = m.reply_to_id ? byId.get(m.reply_to_id) : null;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`flex max-w-[80%] flex-col ${mine ? "items-end" : "items-start"}`}>
                    {/* Reply quote */}
                    {replied && (
                      <div className="mb-0.5 max-w-full truncate rounded-lg border-l-2 border-accent/60 bg-surface px-2 py-1 text-[11px] text-muted">
                        <span className="font-semibold">
                          {replied.sender_id === currentUserId ? "You" : other.name}
                        </span>
                        {": "}
                        {replied.is_unsent ? "Unsent message" : replied.body ?? "Post"}
                      </div>
                    )}

                    {/* Bubble */}
                    {m.is_unsent ? (
                      <div className={`rounded-2xl border border-border px-3.5 py-2 text-sm italic text-faint ${mine ? "rounded-br-md" : "rounded-bl-md"}`}>
                        {mine ? "You unsent this message" : "This message was unsent"}
                      </div>
                    ) : m.kind === "post" && m.post ? (
                      <Link href={`/p/${m.post.id}`}
                        className="block w-56 overflow-hidden rounded-2xl border border-border bg-surface">
                        {(m.post.image_urls?.[0] || m.post.image_url) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.post.image_urls?.[0] || m.post.image_url || ""} alt="" className="aspect-square w-full object-cover" />
                        )}
                        <div className="p-2.5">
                          {m.postProfile?.username && (
                            <p className="text-xs font-semibold">@{m.postProfile.username}</p>
                          )}
                          {m.post.caption && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{m.post.caption}</p>}
                        </div>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActionMsg(m)}
                        className={`rounded-2xl px-3.5 py-2 text-left text-sm ${
                          mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-surface text-foreground"
                        }`}
                      >
                        {m.body}
                      </button>
                    )}
                    <span className="px-1 pt-0.5 text-[10px] text-faint">{timeLabel(m.created_at)}</span>
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
                {replyTo.sender_id === currentUserId ? "yourself" : other.name}
              </span>
              : {replyTo.is_unsent ? "Unsent" : replyTo.body ?? "Post"}
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

      {/* Per-message action sheet */}
      {actionMsg && (
        <BottomSheet open onClose={() => setActionMsg(null)}>
          <div className="flex flex-col pb-2">
            <ActionRow icon={<Reply size={18} />} label="Reply"
              onClick={() => { setReplyTo(actionMsg); setActionMsg(null); }} />
            {actionMsg.body && (
              <ActionRow icon={<Copy size={18} />} label="Copy" onClick={() => copy(actionMsg)} />
            )}
            {actionMsg.sender_id === currentUserId ? (
              <ActionRow danger icon={<Trash2 size={18} />} label="Unsend" onClick={() => unsend(actionMsg)} />
            ) : (
              <ActionRow danger icon={<Flag size={18} />} label="Report"
                onClick={() => { setReportMsg(actionMsg); setActionMsg(null); }} />
            )}
          </div>
        </BottomSheet>
      )}

      {/* Report reason sheet */}
      {reportMsg && (
        <BottomSheet open onClose={() => setReportMsg(null)} title="Report message">
          <div className="flex flex-col gap-1 pb-3">
            <p className="pb-1 text-xs text-muted">Why are you reporting this?</p>
            {REPORT_REASONS.map((r) => (
              <button key={r} type="button" onClick={() => submitReport(r)}
                className="flex items-center justify-between rounded-xl px-3 py-3 text-sm hover:bg-white/5">
                {r}
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

function ActionRow({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-4 rounded-xl px-2 py-3 text-sm font-medium hover:bg-white/5 ${danger ? "text-danger" : "text-foreground"}`}>
      <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface ${danger ? "text-danger" : ""}`}>{icon}</span>
      {label}
    </button>
  );
}
