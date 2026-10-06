"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { ShotCover } from "@/components/profile/ProfileGrids";

export type ShotResult = {
  id: string;
  user_id: string;
  media_url: string;
  poster_url: string | null;
  caption: string | null;
};

/**
 * Shots that matched a search: the same upright tiles a profile's Shots tab
 * draws, three across, each opening the Shot.
 */
export function ShotResultsGrid({ shots }: { shots: ShotResult[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 px-1.5" data-shot-results>
      {shots.map((s) => (
        <Link
          key={s.id}
          href={`/shots/${s.id}`}
          aria-label={s.caption ? `Shot: ${s.caption}` : "Shot"}
          className="relative block aspect-[9/16] overflow-hidden rounded-xl bg-surface"
        >
          <ShotCover poster={s.poster_url} media={s.media_url} />
          <span className="absolute right-1.5 top-1.5 text-white drop-shadow">
            <Play size={14} className="fill-white" />
          </span>
          {s.caption && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent px-1.5 pb-1 pt-5 text-[10px] font-semibold leading-tight text-white">
              {s.caption}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
