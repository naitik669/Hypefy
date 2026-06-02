"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Star, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";

type Shot = {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  profiles: {
    display_name: string | null;
    avatar_hue: number | null;
    username: string | null;
  } | null;
};

const DURATION = 5000;

function timeAgo(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function RealShotsViewer({ shots }: { shots: Shot[] }) {
  return (
    <div className="fixed inset-x-0 top-0 bottom-[72px] z-20 mx-auto max-w-[480px]">
      <div className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll">
        {shots.map((shot, i) => (
          <RealShotItem key={shot.id} shot={shot} isFirst={i === 0} total={shots.length} idx={i} />
        ))}
      </div>
    </div>
  );
}

function RealShotItem({ shot, total, idx }: { shot: Shot; isFirst: boolean; total: number; idx: number }) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const progressRef = useRef(0);

  const name = shot.profiles?.display_name ?? shot.profiles?.username ?? "User";
  const hue = shot.profiles?.avatar_hue ?? 280;

  const goBack = useCallback(() => router.back(), [router]);

  useEffect(() => {
    if (paused) return;
    const lastP = progressRef.current;

    function tick(now: number) {
      if (startRef.current === 0) startRef.current = now - lastP * DURATION;
      const p = Math.min((now - startRef.current) / DURATION, 1);
      progressRef.current = p;
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        goBack();
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused, goBack]);

  return (
    <section className="relative flex h-full w-full snap-start overflow-hidden bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.media_url} alt={shot.caption ?? "Shot"} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30" />

      {/* Tap zone */}
      <div className="absolute inset-0 z-10" onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)} />

      {/* Progress bars */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div className="h-full rounded-full bg-white" style={{ width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%", transition: i === idx ? "none" : undefined }} />
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
        <button type="button" aria-label="More" className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal size={22} />
        </button>
        <button type="button" aria-label="Close" className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white" onClick={(e) => { e.stopPropagation(); goBack(); }}>
          <X size={22} />
        </button>
      </div>

      {/* Caption */}
      {shot.caption && (
        <div className="pointer-events-none absolute inset-x-4 bottom-24 z-20">
          <p className="text-sm text-white/90 drop-shadow">{shot.caption}</p>
        </div>
      )}

      {/* Reply */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-3 pb-6 pt-12">
        <div className="pointer-events-auto flex items-center gap-3">
          <input value={reply} onChange={(e) => setReply(e.target.value)} onClick={(e) => { e.stopPropagation(); setPaused(true); }} onBlur={() => setPaused(false)} placeholder={`Reply to ${name}…`} className="h-11 flex-1 rounded-pill border border-white/30 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/50 backdrop-blur-sm" />
          <button type="button" aria-label="Hype this Shot" onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-0.5">
            <Star size={26} className="text-hype" fill="currentColor" />
          </button>
          <button type="button" aria-label="Send" onClick={(e) => { e.stopPropagation(); setReply(""); }} className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Send size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
