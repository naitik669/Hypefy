"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Star, Volume2, VolumeX, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui/Avatar";

type ReelProfile = { display_name: string | null; avatar_hue: number | null; username: string | null } | null;

export type Reel = {
  id: string;
  user_id: string;
  media_url: string;
  caption: string | null;
  created_at: string;
  hype_count?: number;
  profiles: ReelProfile;
};

/**
 * Shots = Reels. Full-screen vertical, snap-scrolling autoplay video feed.
 */
export function ReelsFeed({
  reels,
  currentUserId,
}: {
  reels: Reel[];
  currentUserId: string | null;
}) {
  const [muted, setMuted] = useState(true);

  return (
    <div className="fixed inset-x-0 top-0 bottom-[72px] z-10 mx-auto max-w-[480px] snap-y snap-mandatory overflow-y-scroll bg-black no-scrollbar">
      {reels.map((reel) => (
        <ReelCard
          key={reel.id}
          reel={reel}
          currentUserId={currentUserId}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
        />
      ))}
    </div>
  );
}

function ReelCard({
  reel,
  currentUserId,
  muted,
  onToggleMute,
}: {
  reel: Reel;
  currentUserId: string | null;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const supabase = createClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  const name = reel.profiles?.display_name ?? reel.profiles?.username ?? "User";
  const handle = reel.profiles?.username;
  const hue = reel.profiles?.avatar_hue ?? 280;

  const [hyped, setHyped] = useState(false);
  const [hypeCount, setHypeCount] = useState(reel.hype_count ?? 0);
  const [hypePending, setHypePending] = useState(false);

  // Autoplay when scrolled into view; pause otherwise.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.6) {
          el.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Load current user's hype state.
  useEffect(() => {
    let active = true;
    async function load() {
      if (!currentUserId) return;
      const [mine, total] = await Promise.all([
        supabase
          .from("hypes")
          .select("id")
          .eq("user_id", currentUserId)
          .eq("target_type", "shot")
          .eq("target_id", reel.id)
          .maybeSingle(),
        supabase.from("shots").select("hype_count").eq("id", reel.id).maybeSingle(),
      ]);
      if (!active) return;
      setHyped(!!mine.data);
      if (total.data) setHypeCount(total.data.hype_count ?? 0);
    }
    load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reel.id, currentUserId]);

  async function toggleHype() {
    if (hypePending || !currentUserId) return;
    const prev = hyped,
      prevCount = hypeCount;
    setHypePending(true);
    setHyped(!prev);
    setHypeCount((c) => c + (prev ? -1 : 1));
    try {
      const { data, error } = await supabase.rpc("toggle_hype", {
        p_target_type: "shot",
        p_target_id: reel.id,
        p_owner_id: reel.user_id,
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

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <section className="relative h-full w-full snap-start snap-always">
      <video
        ref={videoRef}
        src={reel.media_url}
        className="absolute inset-0 h-full w-full bg-black object-cover"
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onClick={togglePlay}
      />

      {/* Tap-to-resume overlay when paused */}
      {!playing && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Play"
          className="absolute inset-0 z-10 flex items-center justify-center"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm">
            <Play size={30} className="ml-1 fill-white" />
          </span>
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {/* Mute toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="absolute right-3 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Right action rail */}
      <div className="absolute bottom-6 right-3 z-20 flex flex-col items-center gap-5">
        <button
          type="button"
          aria-label="Hype"
          disabled={hypePending}
          onClick={toggleHype}
          className="flex flex-col items-center gap-1 transition-transform active:scale-90 disabled:opacity-60"
        >
          <Star
            size={34}
            className={hyped ? "text-hype" : "text-white"}
            fill={hyped ? "currentColor" : "none"}
          />
          <span className="text-xs font-semibold tabular-nums text-white">{hypeCount}</span>
        </button>
      </div>

      {/* Author + caption */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 p-4 pr-16">
        <Link href={handle ? `/u/${handle}` : "#"} className="flex items-center gap-2.5">
          <Avatar name={name} hue={hue} size={38} className="ring-2 ring-white/70" />
          <span className="text-sm font-bold text-white drop-shadow">
            {handle ? `@${handle}` : name}
          </span>
        </Link>
        {reel.caption && (
          <p className="line-clamp-3 text-sm text-white/90 drop-shadow">{reel.caption}</p>
        )}
      </div>
    </section>
  );
}
