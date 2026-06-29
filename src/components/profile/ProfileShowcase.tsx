"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Item = {
  id: string;
  kind: "shot" | "show";
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

/**
 * Profile highlights — the Shots (in_showcase) and Shows (is_showcase) the
 * user pinned to their profile. Renders a horizontal rail; nothing when empty.
 */
export function ProfileShowcase({ userId }: { userId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    (async () => {
      const [shotsRes, showsRes] = await Promise.all([
        supabase.from("shots").select("id, media_url, poster_url, caption, created_at")
          .eq("user_id", userId).eq("in_showcase", true).order("created_at", { ascending: false }),
        supabase.from("shows").select("id, media_url, caption, created_at")
          .eq("user_id", userId).eq("is_showcase", true).order("created_at", { ascending: false }),
      ]);
      if (!active) return;
      const shots: Item[] = (shotsRes.data ?? []).map((s: any) => ({ id: s.id, kind: "shot", media_url: s.media_url, poster_url: s.poster_url ?? null, caption: s.caption ?? null }));
      const shows: Item[] = (showsRes.data ?? []).map((s: any) => ({ id: s.id, kind: "show", media_url: s.media_url, poster_url: null, caption: s.caption ?? null }));
      setItems([...shots, ...shows]);
    })();
    return () => { active = false; };
  }, [userId]);

  if (!items || items.length === 0) return null;

  return (
    <div className="mt-3 px-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-faint">Showcase</p>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
        {items.map((it) => (
          <Link
            key={`${it.kind}-${it.id}`}
            href={it.kind === "shot" ? `/shots/${it.id}` : `/shows/${it.id}`}
            className="relative block aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-2xl border border-border bg-black"
          >
            {it.poster_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.poster_url} alt={it.caption ?? ""} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <video src={it.media_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            )}
            <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
              <Play size={12} className="fill-white" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
