"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, Send, Star, ChevronLeft, ChevronRight, ExternalLink,
  MoreHorizontal, Trash2, Bookmark, BookmarkCheck, Loader2, FileText, Eye,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";

type ShowProfile = { display_name: string | null; avatar_hue: number | null; username: string | null; avatar_url?: string | null } | null;

type LinkedPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  profiles: {
    display_name: string | null;
    username: string | null;
    avatar_hue: number | null;
    avatar_url?: string | null;
  } | null;
} | null;

export type ShowItem = {
  id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  created_at: string;
  hype_count?: number;
  is_showcase?: boolean;
  linked_post_id?: string | null;
  linked_post?: LinkedPost;
  profiles: ShowProfile;
};

const DURATION = 5000;

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function ShowViewer({
  shows,
  startIdx = 0,
  currentUserId,
}: {
  shows: ShowItem[];
  startIdx?: number;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(startIdx);
  const [showcasedIds, setShowcasedIds] = useState<Set<string>>(
    () => new Set(shows.filter((s) => s.is_showcase).map((s) => s.id)),
  );

  const show = shows[idx];
  if (!show) return null;

  function goNext() {
    if (idx < shows.length - 1) setIdx((i) => i + 1);
    else router.back();
  }
  function goPrev() {
    if (idx > 0) setIdx((i) => i - 1);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <ShowScreen
        key={show.id}
        show={show}
        total={shows.length}
        idx={idx}
        currentUserId={currentUserId}
        isShowcase={showcasedIds.has(show.id)}
        onShowcaseToggle={(id, val) =>
          setShowcasedIds((prev) => {
            const next = new Set(prev);
            val ? next.add(id) : next.delete(id);
            return next;
          })
        }
        onNext={goNext}
        onPrev={goPrev}
        onClose={() => router.back()}
      />
    </div>
  );
}

function ShowScreen({
  show,
  total,
  idx,
  currentUserId,
  isShowcase,
  onShowcaseToggle,
  onNext,
  onPrev,
  onClose,
}: {
  show: ShowItem;
  total: number;
  idx: number;
  currentUserId: string | null;
  isShowcase: boolean;
  onShowcaseToggle: (id: string, val: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const progressRef = useRef(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const [actionPending, setActionPending] = useState<"delete" | "showcase" | null>(null);

  const isOwner = !!currentUserId && currentUserId === show.user_id;
  const name = show.profiles?.display_name ?? show.profiles?.username ?? "User";
  const hue = show.profiles?.avatar_hue ?? 280;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(show.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);
  const [viewCount, setViewCount] = useState<number | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyStatus, setReplyStatus] = useState<"idle" | "sent" | "error">("idle");
  const [replyError, setReplyError] = useState<string | null>(null);

  // Server-side view tracking: viewers register a view, owners see the count
  useEffect(() => {
    if (!currentUserId) return;
    if (isOwner) {
      supabase
        .from("show_views")
        .select("viewer_id", { count: "exact", head: true })
        .eq("show_id", show.id)
        .then(({ count }) => setViewCount(count ?? 0));
    } else {
      supabase
        .from("show_views")
        .upsert(
          { show_id: show.id, viewer_id: currentUserId },
          { onConflict: "show_id,viewer_id", ignoreDuplicates: true },
        )
        .then(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, currentUserId, isOwner]);

  const linkedPost = show.linked_post ?? null;
  const postAuthorName = linkedPost?.profiles?.display_name ?? linkedPost?.profiles?.username ?? "User";
  const postAuthorHue = linkedPost?.profiles?.avatar_hue ?? 280;

  // The specific image selected for the embed (stored in media_url for linked-post shots)
  const embedImage = show.linked_post_id ? show.media_url : null;
  const hasEmbedImage = !!embedImage;

  useEffect(() => {
    let active = true;
    async function loadHype() {
      if (!currentUserId) return;
      const [mine, totals] = await Promise.all([
        supabase.from("hypes").select("id").eq("user_id", currentUserId).eq("target_type", "show").eq("target_id", show.id).maybeSingle(),
        supabase.from("shows").select("hype_count").eq("id", show.id).maybeSingle(),
      ]);
      if (!active) return;
      setHyped(!!mine.data);
      if (totals.data) setHypeCount(totals.data.hype_count ?? 0);
    }
    loadHype();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, currentUserId]);

  async function toggleShowHype() {
    if (hypePending || !currentUserId) return;
    const prev = hyped, prevCount = hypeCount;
    setHypePending(true); setHyped(!prev); setHypeCount((c) => c + (prev ? -1 : 1));
    try {
      const { data, error } = await supabase.rpc("toggle_hype", { p_target_type: "show", p_target_id: show.id, p_owner_id: show.user_id });
      if (error) throw error;
      if (data && typeof data === "object") { setHyped(Boolean(data.hyped)); setHypeCount(Number(data.hype_count)); }
    } catch { setHyped(prev); setHypeCount(prevCount); }
    finally { setHypePending(false); }
  }

  /**
   * Send a Show reply as a DM to the owner. Without a show_id column on
   * messages, we prefix a context line so the chat reads like a story reply.
   */
  async function sendReply() {
    const text = reply.trim();
    if (!text || sendingReply || !currentUserId || isOwner) return;
    setSendingReply(true);
    setReplyError(null);

    const { data: convId, error: convErr } = await supabase.rpc("get_or_create_dm", { p_other: show.user_id });
    if (convErr || !convId) {
      setSendingReply(false);
      setReplyStatus("error");
      setReplyError(
        convErr?.message?.includes("dm_restricted")
          ? "They only accept DMs from people they follow"
          : convErr?.message?.includes("blocked")
            ? "Can't reply to this account"
            : "Couldn't send reply",
      );
      setTimeout(() => { setReplyStatus("idle"); setReplyError(null); }, 2600);
      return;
    }

    const body = `↩️ Replied to your Show: ${text}`;
    const { error: sendErr } = await supabase.rpc("send_message", {
      p_conversation_id: convId,
      p_body: body,
      p_kind: "text",
      p_post_id: null,
      p_reply_to_id: null,
      p_shot_id: null,
    });

    setSendingReply(false);
    if (sendErr) {
      setReplyStatus("error");
      setReplyError("Couldn't send reply");
      setTimeout(() => { setReplyStatus("idle"); setReplyError(null); }, 2600);
      return;
    }
    setReply("");
    setReplyStatus("sent");
    setTimeout(() => setReplyStatus("idle"), 2200);
  }

  async function deleteShow() {
    setActionPending("delete");
    await supabase.from("shows").delete().eq("id", show.id);
    setActionPending(null);
    setMenuOpen(false);
    onClose();
  }

  async function toggleShowcase() {
    setActionPending("showcase");
    const next = !isShowcase;
    await supabase.from("shows").update({ is_showcase: next }).eq("id", show.id);
    onShowcaseToggle(show.id, next);
    setActionPending(null);
    setMenuOpen(false);
  }

  useEffect(() => {
    progressRef.current = 0; startRef.current = 0; setProgress(0);
  }, [show.id]);

  useEffect(() => {
    if (paused || menuOpen) return;
    const lastP = progressRef.current;
    function tick(now: number) {
      if (startRef.current === 0) startRef.current = now - lastP * DURATION;
      const p = Math.min((now - startRef.current) / DURATION, 1);
      progressRef.current = p; setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else onNext();
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [show.id, paused, menuOpen, onNext]);

  function openLinkedPost() {
    if (!linkedPost) return;
    setPaused(true);
    router.push(`/p/${linkedPost.id}`);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">

      {/* ── Background ── */}
      {show.linked_post_id ? (
        // Post-share shot: blurred image or dark gradient
        hasEmbedImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={embedImage!}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-110 object-cover blur-3xl"
              style={{ opacity: 0.35 }}
            />
            <div className="absolute inset-0 bg-black/60" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d0d1e] via-[#111128] to-[#08080f]" />
        )
      ) : show.media_url ? (
        // Normal shot: full-bleed image
        // eslint-disable-next-line @next/next/no-img-element
        <img src={show.media_url} alt={show.caption ?? "Show"} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-[hsl(280deg_80%_20%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />

      {/* ── Tap zones (prev / next) ── */}
      {!menuOpen && (
        <>
          <div
            className="absolute left-0 z-10 w-1/3"
            style={{ top: 88, bottom: 88 }}
            onClick={(e) => { e.stopPropagation(); if (!paused) onPrev(); }}
            onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}
          />
          <div
            className="absolute right-0 z-10 w-2/3"
            style={{ top: 88, bottom: 88 }}
            onClick={(e) => { e.stopPropagation(); if (!paused) onNext(); }}
            onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)}
            onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}
          />
        </>
      )}

      {/* ── Progress bars ── */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%", transition: "none" }}
            />
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="pointer-events-none absolute left-0 right-0 top-8 z-20 flex items-center gap-3 px-3 pt-1">
        <Avatar name={name} hue={hue} size={36} src={show.profiles?.avatar_url ?? undefined} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-white drop-shadow">{name}</span>
          <span className="text-xs text-white/55">{timeAgo(show.created_at)}</span>
        </div>

        {isOwner && (
          <button
            type="button"
            aria-label="Show options"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(true); setPaused(true); }}
            className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
          >
            <MoreHorizontal size={22} />
          </button>
        )}

        <button
          type="button"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
        >
          <X size={22} />
        </button>
      </div>

      {/* ── Nav arrows ── */}
      {idx > 0 && !menuOpen && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="pointer-events-auto absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < total - 1 && !menuOpen && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="pointer-events-auto absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
          <ChevronRight size={22} />
        </button>
      )}

      {/* ── Hypefy Post Embed Card ── */}
      {show.linked_post_id && !menuOpen && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openLinkedPost(); }}
          className="pointer-events-auto absolute inset-x-6 z-30 overflow-hidden rounded-2xl border border-white/[0.12] bg-black/50 shadow-2xl backdrop-blur-2xl transition-transform active:scale-[0.97]"
          style={{ top: "17%", maxHeight: "60%" }}
        >
          {linkedPost ? (
            <>
              {/* Author row */}
              <div className="flex items-center gap-2.5 px-3.5 py-3">
                <Avatar
                  name={postAuthorName}
                  hue={postAuthorHue}
                  size={26}
                  src={linkedPost.profiles?.avatar_url ?? undefined}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold leading-tight text-white">{postAuthorName}</p>
                  {linkedPost.profiles?.username && (
                    <p className="truncate text-[10px] text-white/45">@{linkedPost.profiles.username}</p>
                  )}
                </div>
                {/* Hypefy badge */}
                <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/50">
                  Hypefy
                </span>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/[0.08]" />

              {/* Post image OR text preview */}
              {hasEmbedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={embedImage!}
                  alt="Post"
                  className="w-full object-cover"
                  style={{ maxHeight: "52vw" }}
                />
              ) : (
                <div className="flex min-h-[80px] items-center justify-center bg-white/[0.04] px-4 py-5">
                  {linkedPost.caption ? (
                    <p className="line-clamp-4 text-center text-sm leading-snug text-white/75">
                      {linkedPost.caption}
                    </p>
                  ) : (
                    <FileText size={28} className="text-white/20" />
                  )}
                </div>
              )}

              {/* Caption snippet (only when image is shown) */}
              {hasEmbedImage && linkedPost.caption && (
                <>
                  <div className="h-px bg-white/[0.08]" />
                  <p className="line-clamp-2 px-3.5 py-2.5 text-[12px] leading-snug text-white/70">
                    {linkedPost.caption}
                  </p>
                </>
              )}

              {/* Footer CTA */}
              <div className="flex items-center justify-between border-t border-white/[0.08] px-3.5 py-2.5">
                <span className="text-[11px] font-semibold text-white/40">Tap to view post</span>
                <ExternalLink size={13} className="text-white/40" />
              </div>
            </>
          ) : (
            /* Post deleted / not loaded */
            <div className="flex items-center justify-center gap-2 px-4 py-6">
              <FileText size={18} className="text-white/30" />
              <span className="text-sm text-white/40">Post no longer available</span>
            </div>
          )}
        </button>
      )}

      {/* ── Caption ── */}
      {show.caption && !menuOpen && (
        <div className="pointer-events-none absolute inset-x-4 z-20" style={{ bottom: 96 }}>
          <p className="text-sm text-white/90 drop-shadow">{show.caption}</p>
        </div>
      )}

      {/* ── Owner view count ── */}
      {isOwner && viewCount !== null && !menuOpen && (
        <div className="pointer-events-none absolute left-4 z-20 flex items-center gap-1.5" style={{ bottom: show.caption ? 128 : 96 }}>
          <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
            <Eye size={13} className="text-white/80" />
            <span className="text-xs font-semibold text-white/90">
              {viewCount} {viewCount === 1 ? "view" : "views"}
            </span>
          </span>
        </div>
      )}

      {/* ── Reply + Hype bar (viewers only) ── */}
      {!menuOpen && !isOwner && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-6 pt-12">
          {/* Sent / error feedback */}
          {replyStatus !== "idle" && (
            <div className="pointer-events-none mb-2 flex justify-center">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm ${
                replyStatus === "sent" ? "bg-accent/90 text-accent-ink" : "bg-black/60 text-white"
              }`}>
                {replyStatus === "sent" ? "Reply sent ⚡" : replyError ?? "Couldn't send reply"}
              </span>
            </div>
          )}
          <div className="pointer-events-auto flex items-center gap-3">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onClick={(e) => { e.stopPropagation(); setPaused(true); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); sendReply(); } }}
              onBlur={() => setPaused(false)}
              placeholder={`Reply to ${name}…`}
              disabled={sendingReply}
              className="h-11 flex-1 rounded-pill border border-white/25 bg-white/10 px-4 text-sm text-white outline-none backdrop-blur-sm placeholder:text-white/45 disabled:opacity-60 focus:ring-2 focus:ring-accent/50"
            />
            <button
              type="button"
              aria-label="Hype this Show"
              disabled={hypePending}
              onClick={(e) => { e.stopPropagation(); toggleShowHype(); }}
              className="flex flex-col items-center gap-0.5 transition-transform active:scale-90 disabled:opacity-60"
            >
              <Star size={28} className={`transition-colors ${hyped ? "text-hype" : "text-white"}`} fill={hyped ? "currentColor" : "none"} />
              {hypeCount > 0 && <span className="text-[11px] font-semibold tabular-nums text-white">{hypeCount}</span>}
            </button>
            <button
              type="button"
              aria-label="Send reply"
              disabled={!reply.trim() || sendingReply}
              onClick={(e) => { e.stopPropagation(); sendReply(); }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform active:scale-90 disabled:opacity-40"
            >
              {sendingReply ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
        </div>
      )}

      {/* ── Owner actions menu ── */}
      {menuOpen && (
        <>
          <div
            className="absolute inset-0 z-40"
            onClick={() => { setMenuOpen(false); setPaused(false); }}
          />
          <div className="absolute inset-x-4 bottom-8 z-50 overflow-hidden rounded-2xl bg-elevated/95 backdrop-blur-xl ring-1 ring-border">
            {/* Showcase toggle */}
            <button
              type="button"
              disabled={actionPending !== null}
              onClick={toggleShowcase}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              {actionPending === "showcase"
                ? <Loader2 size={20} className="animate-spin text-accent" />
                : isShowcase
                  ? <BookmarkCheck size={20} className="text-accent" />
                  : <Bookmark size={20} className="text-foreground" />}
              <div>
                <p className="text-sm font-semibold">{isShowcase ? "Remove from Showcase" : "Add to Showcase"}</p>
                <p className="text-xs text-muted">
                  {isShowcase ? "Remove from your profile highlights" : "Pin permanently to your profile"}
                </p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            {/* Delete */}
            <button
              type="button"
              disabled={actionPending !== null}
              onClick={deleteShow}
              className="flex w-full items-center gap-3 px-5 py-4 text-left text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
            >
              {actionPending === "delete"
                ? <Loader2 size={20} className="animate-spin" />
                : <Trash2 size={20} />}
              <div>
                <p className="text-sm font-semibold">Delete Show</p>
                <p className="text-xs opacity-70">Removes this Show permanently</p>
              </div>
            </button>

            <div className="mx-4 h-px bg-border" />

            <button
              type="button"
              onClick={() => { setMenuOpen(false); setPaused(false); }}
              className="flex w-full items-center justify-center px-5 py-4 text-sm font-semibold text-muted transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
