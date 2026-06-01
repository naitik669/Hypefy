"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Send, Star, MoreHorizontal } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { Show } from "@/lib/mock";

const DURATION = 5000; // ms per show

export function ShowsViewer({
  shows,
  startIdx,
}: {
  shows: Show[];
  startIdx: number;
}) {
  const router = useRouter();
  const [idx, setIdx] = useState(startIdx);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const progressRef = useRef(0);

  const show = shows[idx];

  const goNext = useCallback(() => {
    if (idx < shows.length - 1) {
      setIdx((i) => i + 1);
      setProgress(0);
    } else {
      router.back();
    }
  }, [idx, shows.length, router]);

  const goPrev = useCallback(() => {
    if (idx > 0) {
      setIdx((i) => i - 1);
      setProgress(0);
    }
  }, [idx]);

  // Auto-advance ticker
  useEffect(() => {
    if (paused) return;
    let lastProgress = progressRef.current;

    function tick(now: number) {
      if (startRef.current === 0) startRef.current = now - lastProgress * DURATION;
      const elapsed = now - startRef.current;
      const p = Math.min(elapsed / DURATION, 1);
      progressRef.current = p;
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        goNext();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastProgress = progressRef.current;
    };
  }, [idx, paused, goNext]);

  // Reset timer when show changes
  useEffect(() => {
    progressRef.current = 0;
    startRef.current = 0;
  }, [idx]);

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    if (paused) return;
    const x = e.clientX;
    const third = window.innerWidth / 3;
    if (x < third) goPrev();
    else goNext();
  }

  if (!show) return null;

  return (
    /* Full-screen page — no BottomNav on this route */
    <div className="fixed inset-0 z-50 bg-black">
      {/* Full-screen gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 30% 20%, hsl(${show.hue} 80% 50%), hsl(${(show.hue + 40) % 360} 70% 14%))`,
        }}
      />

      {/* Tap zones */}
      <div
        className="absolute inset-0 z-10"
        onClick={handleTap}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      />

      {/* Progress bars */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex gap-1 px-3 pt-3">
        {shows.map((_, i) => (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full rounded-full bg-white"
              style={{
                width: i < idx ? "100%" : i === idx ? `${progress * 100}%` : "0%",
                transition: i === idx ? "none" : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-8 z-20 flex items-center gap-3 px-3 pt-1">
        <Avatar name={show.name} hue={show.hue} size={36} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-bold text-white">{show.name}</span>
          <span className="text-xs text-white/70">2h ago</span>
        </div>
        <button
          type="button"
          aria-label="More"
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal size={22} />
        </button>
        <button
          type="button"
          aria-label="Close"
          className="pointer-events-auto flex h-8 w-8 items-center justify-center text-white"
          onClick={(e) => { e.stopPropagation(); router.back(); }}
        >
          <X size={22} />
        </button>
      </div>

      {/* Bottom — Hype + reply */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-3 pb-8 pt-16">
        <div className="pointer-events-auto flex items-center gap-3">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onClick={(e) => { e.stopPropagation(); setPaused(true); }}
            onBlur={() => setPaused(false)}
            placeholder={`Reply to ${show.name}…`}
            className="h-11 flex-1 rounded-pill border border-white/30 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/50 backdrop-blur-sm"
          />
          <button
            type="button"
            aria-label="Hype this Show"
            onClick={(e) => e.stopPropagation()}
            className="flex flex-col items-center gap-0.5"
          >
            <Star size={26} className="text-hype" fill="currentColor" />
          </button>
          <button
            type="button"
            aria-label="Send reply"
            onClick={(e) => { e.stopPropagation(); setReply(""); }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
