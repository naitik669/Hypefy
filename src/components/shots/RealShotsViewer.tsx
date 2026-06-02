"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Star, MoreHorizontal, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";

type ShotProfile = { display_name: string | null; avatar_hue: number | null; username: string | null } | null;

export type RealShot = {
  id: string; user_id: string; media_url: string; caption: string | null;
  created_at: string; expires_at?: string; in_showcase: boolean; profiles: ShotProfile;
};

const DURATION = 5000;

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * State-based shots viewer — renders ONE shot at a time.
 * No scroll-snap: eliminates the multi-swipe bug where one gesture
 * skips multiple shots. Navigation is purely via state (tap zones / buttons).
 */
export function RealShotsViewer({
  shots, startIdx = 0, currentUserId,
}: {
  shots: RealShot[]; startIdx?: number; currentUserId: string | null;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(startIdx);

  const shot = shots[idx];
  if (!shot) return null;

  function goNext() {
    if (idx < shots.length - 1) setIdx((i) => i + 1);
    else router.back();
  }
  function goPrev() {
    if (idx > 0) setIdx((i) => i - 1);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <ShotScreen
        key={shot.id}          // remount on shot change → resets progress timer
        shot={shot}
        total={shots.length}
        idx={idx}
        currentUserId={currentUserId}
        onNext={goNext}
        onPrev={goPrev}
        onClose={() => router.back()}
      />
    </div>
  );
}

function ShotScreen({
  shot, total, idx, currentUserId, onNext, onPrev, onClose,
}: {
  shot: RealShot; total: number; idx: number; currentUserId: string | null;
  onNext: () => void; onPrev: () => void; onClose: () => void;
}) {
  const supabase = createClient();
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [inShowcase, setInShowcase] = useState(shot.in_showcase);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const progressRef = useRef(0);

  const isOwn = currentUserId === shot.user_id;
  const name = shot.profiles?.display_name ?? shot.profiles?.username ?? "User";
  const hue = shot.profiles?.avatar_hue ?? 280;

  // ── Hype state ───────────────────────────────────────────
  const [hyped, setHyped] = useState(false);
  const [hypePending, setHypePending] = useState(false);

  // Auto-advance progress bar
  useEffect(() => {
    progressRef.current = 0;
    startRef.current = 0;
    setProgress(0);
  }, [shot.id]);

  useEffect(() => {
    if (paused) return;
    const lastP = progressRef.current;

    function tick(now: number) {
      if (startRef.current === 0) startRef.current = now - lastP * DURATION;
      const p = Math.min((now - startRef.current) / DURATION, 1);
      progressRef.current = p;
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else onNext();
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [shot.id, paused, onNext]);

  // Tap zones: left third = prev, right two-thirds = next
  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (paused) return;
    if (e.clientX < window.innerWidth / 3) onPrev();
    else onNext();
  }

  async function toggleShowcase() {
    const next = !inShowcase;
    setInShowcase(next);
    await supabase.from("shots").update({ in_showcase: next }).eq("id", shot.id);
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* Media */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.media_url} alt={shot.caption ?? "Show"} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      {/* Split tap zones — only cover the middle area (not header or reply bar).
          This prevents the X/close button and reply input from being blocked. */}
      {/* Left third → prev */}
      <div
        className="absolute left-0 z-10 w-1/3"
        style={{ top: 88, bottom: 88 }}
        onClick={(e) => { e.stopPropagation(); if (!paused) onPrev(); }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => { setPaused(false); }}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />
      {/* Right two-thirds → next */}
      <div
        className="absolute right-0 z-10 w-2/3"
        style={{ top: 88, bottom: 88 }}
        onClick={(e) => { e.stopPropagation(); if (!paused) onNext(); }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => { setPaused(false); }}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />

      {/* Progress bars */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%", transition: "none" }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-8 z-20 flex items-center gap-3 px-3 pt-1">
        <Avatar name={name} hue={hue} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-white">{name}</span>
          <span className="text-xs text-white/60">{timeAgo(shot.created_at)}</span>
        </div>
        {isOwn && (
          <button
            type="button"
            aria-label={inShowcase ? "Remove from Showcase" : "Add to Showcase"}
            onClick={(e) => { e.stopPropagation(); toggleShowcase(); }}
            className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
          >
            {inShowcase ? <BookmarkCheck size={20} className="text-accent" /> : <Bookmark size={20} />}
          </button>
        )}
        <button type="button" aria-label="More" onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white">
          <MoreHorizontal size={22} />
        </button>
        <button type="button" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white">
          <X size={22} />
        </button>
      </div>

      {/* Nav arrows (desktop / large screen) */}
      {idx > 0 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="pointer-events-auto absolute left-2 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < total - 1 && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="pointer-events-auto absolute right-2 top-1/2 z-20 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
          <ChevronRight size={22} />
        </button>
      )}

      {/* Showcase badge */}
      {inShowcase && (
        <div className="pointer-events-none absolute left-3 top-20 z-20">
          <span className="flex items-center gap-1 rounded-pill bg-accent/90 px-2 py-0.5 text-[10px] font-bold text-accent-ink">
            <BookmarkCheck size={11} /> In Showcase
          </span>
        </div>
      )}

      {/* Caption */}
      {shot.caption && (
        <div className="pointer-events-none absolute inset-x-4 bottom-24 z-20">
          <p className="text-sm text-white/90 drop-shadow">{shot.caption}</p>
        </div>
      )}

      {/* Reply bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-6 pt-12">
        <div className="pointer-events-auto flex items-center gap-3">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onClick={(e) => { e.stopPropagation(); setPaused(true); }}
            onBlur={() => setPaused(false)}
            placeholder={`Reply to ${name}…`}
            className="h-11 flex-1 rounded-pill border border-white/30 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/50 backdrop-blur-sm"
          />
          <button
            type="button"
            aria-label="Hype this Show"
            disabled={hypePending}
            onClick={async (e) => {
              e.stopPropagation();
              if (hypePending) return;
              const prev = hyped;
              setHyped(!prev);
              setHypePending(true);
              try {
                await supabase.rpc("toggle_hype", {
                  p_target_type: "shot",
                  p_target_id: shot.id,
                  p_owner_id: shot.user_id,
                });
              } catch {
                setHyped(prev);
              } finally {
                setHypePending(false);
              }
            }}
            className="flex flex-col items-center gap-0.5 transition-transform active:scale-90 disabled:opacity-60"
          >
            <Star
              size={28}
              className={`transition-colors ${hyped ? "text-hype" : "text-white"}`}
              fill={hyped ? "currentColor" : "none"}
            />
          </button>
          <button type="button" aria-label="Send" onClick={(e) => { e.stopPropagation(); setReply(""); }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
