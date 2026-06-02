"use client";

import { useState } from "react";
import { Star, MessageCircle, Send, Music2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { formatCount } from "@/lib/mock";
import type { Shot } from "@/lib/mock-shots";

export function ShotsViewer({ shots }: { shots: Shot[] }) {
  return (
    <div className="fixed inset-x-0 top-0 bottom-[72px] z-20 mx-auto max-w-[480px]">
      <div className="no-scrollbar h-full snap-y snap-mandatory overflow-y-scroll">
        {shots.map((shot) => (
          <ShotItem key={shot.id} shot={shot} />
        ))}
      </div>
    </div>
  );
}

function ShotItem({ shot }: { shot: Shot }) {
  const [hyped, setHyped] = useState(false);
  const [count, setCount] = useState(shot.hypes);
  const [burst, setBurst] = useState(false);

  function hype() {
    const next = !hyped;
    setHyped(next);
    setCount((c) => c + (next ? 1 : -1));
    if (next) {
      setBurst(true);
      setTimeout(() => setBurst(false), 360);
    }
  }

  return (
    <section
      className="relative flex h-full w-full snap-start items-center justify-center overflow-hidden"
      style={{
        background: `radial-gradient(120% 80% at 30% 20%, hsl(${shot.from} 78% 50%), hsl(${shot.to} 70% 14%))`,
      }}
    >
      {/* Header label */}
      <div className="absolute left-0 right-0 top-0 flex items-center justify-center bg-gradient-to-b from-black/40 to-transparent p-4">
        <span className="text-base font-extrabold tracking-tight text-white">
          Shots
        </span>
      </div>

      {/* Bottom gradient for legibility */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent" />

      {/* Caption + author */}
      <div className="absolute bottom-4 left-4 right-20 z-10 text-white">
        <div className="flex items-center gap-2">
          <Avatar name={shot.username} hue={shot.hue} size={36} />
          <span className="flex items-center gap-1 text-sm font-bold">
            {shot.username}
            {shot.verified && <VerifiedStar className="h-5 w-5 text-verified" />}
          </span>
          <button
            type="button"
            className="ml-1 rounded-pill border border-white/60 px-3 py-1 text-xs font-bold"
          >
            Follow
          </button>
        </div>
        <p className="mt-2 text-sm leading-snug">{shot.caption}</p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-white/80">
          <Music2 size={13} />
          original audio · {shot.handle}
        </p>
      </div>

      {/* Action rail */}
      <div className="absolute bottom-4 right-3 z-10 flex flex-col items-center gap-5 text-white">
        <button
          type="button"
          onClick={hype}
          aria-label="Hype"
          className="flex flex-col items-center gap-1"
        >
          <Star
            size={30}
            className={`${burst ? "animate-hype-burst" : ""} ${hyped ? "text-hype" : "text-white"}`}
            fill={hyped ? "currentColor" : "none"}
          />
          <span className="text-xs font-semibold tabular-nums">
            {formatCount(count)}
          </span>
        </button>
        <button
          type="button"
          aria-label="Comments"
          className="flex flex-col items-center gap-1"
        >
          <MessageCircle size={28} />
          <span className="text-xs font-semibold">{formatCount(shot.comments)}</span>
        </button>
        <button type="button" aria-label="Share" className="flex flex-col items-center gap-1">
          <Send size={26} />
          <span className="text-xs font-semibold">Share</span>
        </button>
      </div>
    </section>
  );
}
