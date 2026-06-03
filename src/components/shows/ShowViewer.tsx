"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";

type ShowProfile = { display_name: string | null; avatar_hue: number | null; username: string | null } | null;

export type ShowItem = {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  hype_count?: number;
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

/**
 * Shows = Stories. Full-screen, auto-advancing, ephemeral (24h) viewer.
 * One Show at a time; tap zones / arrows to navigate.
 */
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
  onNext,
  onPrev,
  onClose,
}: {
  show: ShowItem;
  total: number;
  idx: number;
  currentUserId: string | null;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const progressRef = useRef(0);

  const name = show.profiles?.display_name ?? show.profiles?.username ?? "User";
  const hue = show.profiles?.avatar_hue ?? 280;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(show.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadHype() {
      if (!currentUserId) return;
      const [mine, total] = await Promise.all([
        supabase
          .from("hypes")
          .select("id")
          .eq("user_id", currentUserId)
          .eq("target_type", "show")
          .eq("target_id", show.id)
          .maybeSingle(),
        supabase.from("shows").select("hype_count").eq("id", show.id).maybeSingle(),
      ]);
      if (!active) return;
      setHyped(!!mine.data);
      if (total.data) setHypeCount(total.data.hype_count ?? 0);
    }
    loadHype();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, currentUserId]);

  async function toggleShowHype() {
    if (hypePending || !currentUserId) return;
    const prev = hyped,
      prevCount = hypeCount;
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "show",
        p_target_id: show.id,
        p_owner_id: show.user_id,
      });
      if (error) throw error;
      if (data && typeof data === "object") {
        setHyped(Boolean(data.hyped));
        setHypeCount(Number(data.hype_count));
      }
    } catch {
      setHyped(prev);
      setHypeCount(prevCount);
    } finally {
      setHypePending(false);
    }
  }

  useEffect(() => {
    progressRef.current = 0;
    startRef.current = 0;
    setProgress(0);
  }, [show.id]);

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
  }, [show.id, paused, onNext]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={show.media_url}
        alt={show.caption ?? "Show"}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      {/* Tap zones */}
      <div
        className="absolute left-0 z-10 w-1/3"
        style={{ top: 88, bottom: 88 }}
        onClick={(e) => {
          e.stopPropagation();
          if (!paused) onPrev();
        }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />
      <div
        className="absolute right-0 z-10 w-2/3"
        style={{ top: 88, bottom: 88 }}
        onClick={(e) => {
          e.stopPropagation();
          if (!paused) onNext();
        }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />

      {/* Progress bars */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%",
                transition: "none",
              }}
            />
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
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
        >
          <X size={22} />
        </button>
      </div>

      {/* Nav arrows */}
      {idx > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="pointer-events-auto absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          <ChevronLeft size={22} />
        </button>
      )}
      {idx < total - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="pointer-events-auto absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          <ChevronRight size={22} />
        </button>
      )}

      {/* Caption */}
      {show.caption && (
        <div className="pointer-events-none absolute inset-x-4 bottom-24 z-20">
          <p className="text-sm text-white/90 drop-shadow">{show.caption}</p>
        </div>
      )}

      {/* Reply + Hype bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-6 pt-12">
        <div className="pointer-events-auto flex items-center gap-3">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onClick={(e) => {
              e.stopPropagation();
              setPaused(true);
            }}
            onBlur={() => setPaused(false)}
            placeholder={`Reply to ${name}…`}
            className="h-11 flex-1 rounded-pill border border-white/30 bg-white/10 px-4 text-sm text-white outline-none backdrop-blur-sm placeholder:text-white/50"
          />
          <button
            type="button"
            aria-label="Hype this Show"
            disabled={hypePending}
            onClick={(e) => {
              e.stopPropagation();
              toggleShowHype();
            }}
            className="flex flex-col items-center gap-0.5 transition-transform active:scale-90 disabled:opacity-60"
          >
            <Star
              size={28}
              className={`transition-colors ${hyped ? "text-hype" : "text-white"}`}
              fill={hyped ? "currentColor" : "none"}
            />
            {hypeCount > 0 && (
              <span className="text-[11px] font-semibold tabular-nums text-white">{hypeCount}</span>
            )}
          </button>
          <button
            type="button"
            aria-label="Send"
            onClick={(e) => {
              e.stopPropagation();
              setReply("");
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
