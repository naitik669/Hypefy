"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X, Send, Star, ChevronLeft, ChevronRight, ExternalLink,
  MoreHorizontal, Trash2, Bookmark, BookmarkCheck, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";

type ShowProfile = { display_name: string | null; avatar_hue: number | null; username: string | null } | null;

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
  // Local showcase state so toggling updates UI instantly without re-fetch
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

  // Owner actions menu
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionPending, setActionPending] = useState<"delete" | "showcase" | null>(null);

  const isOwner = !!currentUserId && currentUserId === show.user_id;
  const name = show.profiles?.display_name ?? show.profiles?.username ?? "User";
  const hue = show.profiles?.avatar_hue ?? 280;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(show.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);

  const linkedPost = show.linked_post ?? null;
  const postThumb = linkedPost?.image_urls?.[0] ?? linkedPost?.image_url ?? null;
  const postAuthorName = linkedPost?.profiles?.display_name ?? linkedPost?.profiles?.username ?? "User";
  const postAuthorHue = linkedPost?.profiles?.avatar_hue ?? 280;

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

  // ── Delete this show ──
  async function deleteShow() {
    setActionPending("delete");
    await supabase.from("shows").delete().eq("id", show.id);
    setActionPending(null);
    setMenuOpen(false);
    onClose();
  }

  // ── Toggle showcase ──
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
      {/* Background */}
      {show.media_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={show.media_url} alt={show.caption ?? "Show"} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-accent/40 to-[hsl(280deg_80%_20%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      {/* Tap zones — disabled when menu is open */}
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

      {/* Progress bars */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-white" style={{ width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%", transition: "none" }} />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-8 z-20 flex items-center gap-3 px-3 pt-1">
        <Avatar name={name} hue={hue} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-white">{name}</span>
          <span className="text-xs text-white/60">{timeAgo(show.created_at)}</span>
        </div>

        {/* Owner actions button */}
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

      {/* Nav arrows */}
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

      {/* Linked Post Embed */}
      {linkedPost && !menuOpen && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openLinkedPost(); }}
          className="pointer-events-auto absolute inset-x-4 z-30 flex items-center gap-3 overflow-hidden rounded-2xl bg-black/55 p-3 backdrop-blur-md ring-1 ring-white/15 transition-transform active:scale-[0.98]"
          style={{ bottom: 96 }}
        >
          {postThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={postThumb} alt="Post" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl" style={{ background: `hsl(${postAuthorHue}deg 70% 30%)` }}>
              <span className="text-lg font-bold text-white">{postAuthorName[0]?.toUpperCase()}</span>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Avatar name={postAuthorName} hue={postAuthorHue} size={16} src={linkedPost.profiles?.avatar_url ?? undefined} />
              <span className="truncate text-xs font-semibold text-white/80">{postAuthorName}</span>
            </div>
            {linkedPost.caption
              ? <p className="line-clamp-2 text-left text-xs leading-snug text-white/70">{linkedPost.caption}</p>
              : <p className="text-xs italic text-white/50">View post</p>}
          </div>
          <ExternalLink size={16} className="shrink-0 text-white/60" />
        </button>
      )}

      {/* Caption */}
      {show.caption && !menuOpen && (
        <div className="pointer-events-none absolute inset-x-4 z-20" style={{ bottom: linkedPost ? 180 : 96 }}>
          <p className="text-sm text-white/90 drop-shadow">{show.caption}</p>
        </div>
      )}

      {/* Reply + Hype bar */}
      {!menuOpen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-6 pt-12">
          <div className="pointer-events-auto flex items-center gap-3">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onClick={(e) => { e.stopPropagation(); setPaused(true); }}
              onBlur={() => setPaused(false)}
              placeholder={`Reply to ${name}…`}
              className="h-11 flex-1 rounded-pill border border-white/30 bg-white/10 px-4 text-sm text-white outline-none backdrop-blur-sm placeholder:text-white/50"
            />
            <button type="button" aria-label="Hype this Show" disabled={hypePending}
              onClick={(e) => { e.stopPropagation(); toggleShowHype(); }}
              className="flex flex-col items-center gap-0.5 transition-transform active:scale-90 disabled:opacity-60">
              <Star size={28} className={`transition-colors ${hyped ? "text-hype" : "text-white"}`} fill={hyped ? "currentColor" : "none"} />
              {hypeCount > 0 && <span className="text-[11px] font-semibold tabular-nums text-white">{hypeCount}</span>}
            </button>
            <button type="button" aria-label="Send"
              onClick={(e) => { e.stopPropagation(); setReply(""); }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── Owner actions menu ── */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="absolute inset-0 z-40"
            onClick={() => { setMenuOpen(false); setPaused(false); }}
          />
          {/* Sheet */}
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

            {/* Cancel */}
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
