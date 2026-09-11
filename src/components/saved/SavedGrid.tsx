"use client";

import Link from "next/link";
import { Check, Copy, Play } from "lucide-react";
import { SavedThumb } from "@/components/saved/FolderArt";
import { useLongPress } from "@/lib/useLongPress";
import { itemKey, type SavedItem } from "@/lib/saved";

/**
 * One saved thing in a grid.
 *
 * A tap opens it; holding it starts selecting, with it chosen. While
 * selecting, a tap chooses instead of opening. Shots carry a play mark and
 * posts with several photos a stack mark, top right, so you can tell them
 * apart at a glance.
 */
function SavedTile({
  item,
  selecting,
  selected,
  onToggle,
}: {
  item: SavedItem;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const hold = useLongPress(() => {
    if (!selecting) onToggle();
  });

  return (
    <Link
      href={item.kind === "post" ? `/p/${item.id}` : `/shots/${item.id}`}
      {...hold}
      onClick={(e) => {
        if (!selecting) return;
        e.preventDefault();
        onToggle();
      }}
      aria-label={`${item.caption || (item.kind === "shot" ? "Shot" : "Post")}${selecting ? (selected ? ", selected" : ", not selected") : ""}`}
      draggable={false}
      className="relative block aspect-square overflow-hidden rounded-[10px] bg-surface"
    >
      <span className={`block h-full w-full transition-transform duration-200 ${selected ? "scale-[0.88]" : ""}`}>
        <span className={`block h-full w-full overflow-hidden ${selected ? "rounded-[8px]" : ""}`}>
          {item.thumb || item.video ? (
            <SavedThumb thumb={item.thumb} video={item.video} />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-tight text-muted">
              {item.caption?.slice(0, 60) ?? "Post"}
            </span>
          )}
        </span>
      </span>

      {(item.kind === "shot" || item.multi) && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)]">
          {item.kind === "shot" ? <Play size={14} fill="currentColor" /> : <Copy size={14} strokeWidth={2.4} />}
        </span>
      )}

      {selecting && (
        <span
          className={`absolute left-1.5 top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full transition-colors ${
            selected ? "bg-accent text-accent-ink" : "bg-black/35 ring-2 ring-inset ring-white/80"
          }`}
        >
          {selected && <Check size={13} strokeWidth={3.2} />}
        </span>
      )}
    </Link>
  );
}

/** Saved things, three to a row. */
export function SavedGrid({
  items,
  selecting,
  selected,
  onToggle,
}: {
  items: SavedItem[];
  selecting: boolean;
  selected: Set<string>;
  onToggle: (item: SavedItem) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 px-1">
      {items.map((i) => (
        <SavedTile
          key={itemKey(i)}
          item={i}
          selecting={selecting}
          selected={selected.has(itemKey(i))}
          onToggle={() => onToggle(i)}
        />
      ))}
    </div>
  );
}
