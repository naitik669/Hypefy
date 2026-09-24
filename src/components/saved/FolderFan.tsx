"use client";

import { Check, MoreHorizontal, Plus } from "lucide-react";
import { FolderArt } from "@/components/saved/FolderArt";
import type { Folder } from "@/lib/folders";

/** What the fan holds: some folders, More when there are too many, and New. */
export type FanItem = { kind: "folder"; folder: Folder } | { kind: "more" } | { kind: "new" };

/** The fan fits this many folders; with more, it shows one fewer and a More. */
const FAN_FOLDERS = 4;
const TILE = 50;
/** Centre to centre along the arc: a tile and its name, with room between. */
const SPACING = 78;
/** A quarter circle from straight left round to (nearly) straight up. */
const ARC_FROM = 180;
const ARC_TO = 266;
/** The arc is centred this far above the bookmark, so its first tile clears the row the bookmark sits in. */
const LIFT = 56;
/** How close the finger must come to a tile to pick it. */
export const FAN_REACH = 40;

export function fanItems(folders: Folder[]): FanItem[] {
  const many = folders.length > FAN_FOLDERS;
  const shown = folders.slice(0, many ? FAN_FOLDERS - 1 : FAN_FOLDERS);
  return [
    ...shown.map((folder) => ({ kind: "folder" as const, folder })),
    ...(many ? [{ kind: "more" as const }] : []),
    { kind: "new" as const },
  ];
}

/**
 * Where each tile sits, in screen space: a quarter circle up and to the left
 * of the bookmark, which is at the right edge of both the feed card and the
 * Shots rail, so the fan opens inward. Centred a little above the bookmark,
 * so the lowest tile clears the buttons beside it; pulled in on a narrow
 * screen.
 */
export function fanSpots(anchor: DOMRect, count: number): { x: number; y: number }[] {
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2 - LIFT;
  // As wide as the tiles need to clear each other, never tighter than 130.
  const step = count > 1 ? ((ARC_TO - ARC_FROM) * Math.PI) / 180 / (count - 1) : 0;
  const needed = count > 1 ? SPACING / (2 * Math.sin(step / 2)) : 0;
  const radius = Math.min(Math.max(130, needed), cx - 42, cy - 40);
  return Array.from({ length: count }, (_, i) => {
    const deg = count === 1 ? 225 : ARC_FROM + ((ARC_TO - ARC_FROM) * i) / (count - 1);
    const a = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
  });
}

/**
 * The fan a hold on the bookmark opens (D3): your folders arc out of it —
 * slide to one and let go to file it there, the same move as reacting to a
 * page. More opens the full list; New makes a folder.
 */
export function FolderFan({
  anchor,
  items,
  inside,
  active,
  detached,
  onChoose,
}: {
  anchor: DOMRect;
  items: FanItem[];
  inside: Set<string>;
  /** The tile under the finger. */
  active: number | null;
  /** Opened by a right-click or a hold let go in place: chosen by tapping. */
  detached: boolean;
  onChoose: (i: number) => void;
}) {
  const spots = fanSpots(anchor, items.length);
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  return (
    <div role="menu" aria-label="Save to a folder" className="pointer-events-none fixed inset-0 z-[151]">
      {items.map((item, i) => {
        const s = spots[i];
        const on = i === active;
        const filed = item.kind === "folder" && inside.has(item.folder.id);
        const label = item.kind === "folder" ? item.folder.name : item.kind === "more" ? "More" : "New";
        return (
          <button
            key={item.kind === "folder" ? item.folder.id : item.kind}
            type="button"
            role="menuitem"
            tabIndex={detached ? 0 : -1}
            aria-label={item.kind === "folder" ? `Save to ${item.folder.name}` : item.kind === "more" ? "All folders" : "New folder"}
            onClick={(e) => {
              e.stopPropagation();
              onChoose(i);
            }}
            className="absolute flex w-[64px] flex-col items-center"
            style={
              {
                left: s.x - 32,
                top: s.y - TILE / 2,
                pointerEvents: detached ? "auto" : "none",
                // Each flies out of the bookmark along its own line.
                ["--dx" as string]: `${cx - s.x}px`,
                ["--dy" as string]: `${cy - s.y}px`,
                animation: `fan-out 0.34s cubic-bezier(0.2,1.25,0.4,1) ${i * 0.04}s both`,
              } as React.CSSProperties
            }
          >
            <span
              className={`relative block transition-transform duration-200 ease-[cubic-bezier(0.34,1.8,0.5,1)] ${
                on ? "-translate-y-1.5 scale-[1.18]" : ""
              }`}
            >
              {item.kind === "folder" ? (
                <FolderArt
                  folder={item.folder}
                  variant="chip"
                  className={`w-[50px] shadow-[0_10px_22px_-8px_rgba(0,0,0,0.8)] ${filed ? "ring-2 ring-accent" : ""} rounded-[14px]`}
                />
              ) : (
                <span
                  className={`flex h-[50px] w-[50px] items-center justify-center rounded-[16px] ${
                    item.kind === "new" ? "border-2 border-dashed border-white/25 bg-black/60 text-accent" : "bg-elevated text-foreground"
                  }`}
                >
                  {item.kind === "new" ? <Plus size={20} strokeWidth={2.6} /> : <MoreHorizontal size={20} />}
                </span>
              )}
              {filed && (
                <span className="absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Check size={11} strokeWidth={3.2} />
                </span>
              )}
            </span>
            <span
              className={`mt-1 max-w-full truncate text-[10.5px] font-bold drop-shadow ${
                item.kind === "new" ? "text-accent" : on ? "text-white" : "text-white/80"
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
