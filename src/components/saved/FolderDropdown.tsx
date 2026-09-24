"use client";

import { Bookmark, Check, Loader2, Plus } from "lucide-react";
import { FolderArt } from "@/components/saved/FolderArt";
import type { Folder } from "@/lib/folders";

const WIDTH = 252;
const EDGE = 8;

/** Where a popover over the bookmark sits: above it when there is room, else below. */
export function placeOver(anchor: DOMRect, width: number, tall: number) {
  const vw = window.innerWidth;
  const right = Math.max(EDGE, vw - anchor.right - 6);
  // The pointer under the popover lines up with the icon's centre.
  const pointer = Math.min(width - 22, Math.max(14, vw - (anchor.left + anchor.width / 2) - right - 6));
  const up = anchor.top > tall + 24;
  return {
    up,
    pointer,
    style: up
      ? { right, bottom: window.innerHeight - anchor.top + 10, width }
      : { right, top: anchor.bottom + 10, width },
  };
}

/**
 * The list a tap on the bookmark drops down (D1): Saved at the top, ticked
 * while it is; your folders under it, ticked where this one is filed; and
 * New folder last. Every tick applies straight away.
 */
export function FolderDropdown({
  anchor,
  saved,
  folders,
  inside,
  onToggleSaved,
  onToggleFolder,
  onNew,
}: {
  anchor: DOMRect;
  saved: boolean;
  /** Null while loading. */
  folders: Folder[] | null;
  inside: Set<string>;
  onToggleSaved: () => void;
  onToggleFolder: (f: Folder) => void;
  onNew: () => void;
}) {
  const place = placeOver(anchor, WIDTH, 330);
  return (
    <div
      role="menu"
      aria-label="Save to"
      className={`fixed z-[151] ${place.up ? "origin-bottom-right" : "origin-top-right"} animate-[pop-menu_0.28s_cubic-bezier(0.2,1.25,0.4,1)_both]`}
      style={place.style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative rounded-[20px] border border-white/10 bg-elevated p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]">
        <Row
          art={
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-white/[0.07]">
              <Bookmark size={16} className={saved ? "text-accent" : "text-foreground"} fill={saved ? "currentColor" : "none"} />
            </span>
          }
          title="Saved"
          sub="All your saves"
          on={saved}
          onClick={onToggleSaved}
        />
        <div className="mx-2 my-1 h-px bg-white/10" />

        <div className="max-h-[216px] overflow-y-auto overscroll-contain">
          {folders === null ? (
            <div className="flex justify-center py-5">
              <Loader2 size={18} className="animate-spin text-muted" />
            </div>
          ) : (
            folders.map((f) => (
              <Row
                key={f.id}
                art={<FolderArt folder={f} variant="chip" className="w-9 shrink-0" />}
                title={`${f.emoji ? `${f.emoji} ` : ""}${f.name}`}
                sub={String(f.itemCount)}
                on={inside.has(f.id)}
                onClick={() => onToggleFolder(f)}
              />
            ))
          )}
        </div>

        <button
          type="button"
          role="menuitem"
          onClick={onNew}
          className="flex w-full items-center gap-2.5 rounded-[14px] px-2 py-2 text-left text-accent transition-colors active:bg-white/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] border-2 border-dashed border-white/15">
            <Plus size={16} strokeWidth={2.6} />
          </span>
          <span className="text-[13px] font-extrabold">New folder</span>
        </button>

        {/* The pointer, towards the bookmark. */}
        <span
          aria-hidden
          className={`absolute h-3 w-3 rotate-45 border-white/10 bg-elevated ${
            place.up ? "-bottom-1.5 border-b border-r" : "-top-1.5 border-l border-t"
          }`}
          style={{ right: place.pointer }}
        />
      </div>
    </div>
  );
}

function Row({
  art,
  title,
  sub,
  on,
  onClick,
}: {
  art: React.ReactNode;
  title: string;
  sub: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[14px] px-2 py-2 text-left transition-colors active:bg-white/5"
    >
      {art}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-extrabold">{title}</span>
        <span className="block text-[11px] tabular-nums text-muted">{sub}</span>
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${
          on ? "bg-accent text-accent-ink" : "ring-2 ring-inset ring-white/20"
        }`}
      >
        {on && <Check size={12} strokeWidth={3.2} />}
      </span>
    </button>
  );
}
