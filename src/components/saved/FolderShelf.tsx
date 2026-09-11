"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { FolderArt } from "@/components/saved/FolderArt";
import { haptics } from "@/lib/haptics";
import type { Folder, FolderCover } from "@/lib/folders";

const HOLD_MS = 450;
const SLOP_PX = 10;
const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Your folders, three to a row, with "All saved" first.
 *
 * Hold a folder and the grid is picked up: the tiles rock, and you drag the
 * one under your finger to where you want it — the others slide aside as it
 * passes. Let go to drop it; Done puts the grid down. The new order is saved
 * when you drop.
 *
 * Moving is done by hand rather than through React state for the finger's
 * tile (a re-render every pointermove is a stutter), and the tiles that make
 * way animate from where they were to where they are (FLIP), so a swap is
 * a slide, not a jump. Hit-testing is against layout slots, not the moving
 * tiles, so a tile mid-slide cannot make the order flicker.
 */
export function FolderShelf({
  folders,
  all,
  onOpenAll,
  onReorder,
  onNew,
}: {
  folders: Folder[];
  all: { count: number | null; covers: FolderCover[] };
  onOpenAll: () => void;
  onReorder: (ids: string[]) => void;
  onNew: () => void;
}) {
  const [arranging, setArranging] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [lifted, setLifted] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const hold = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  const drag = useRef<{
    id: string;
    pointer: number;
    /** Where the finger went down, and the tile's slot then. */
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    /** Where the finger is now. */
    px: number;
    py: number;
    /** The order when it was lifted, and the order now. */
    from: string[];
    order: string[];
  } | null>(null);
  const swallowClick = useRef(false);
  const slots = useRef(new Map<string, { x: number; y: number }>());

  const ids = arranging ? order : folders.map((f) => f.id);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const shown = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));

  const tile = (id: string) => grid.current?.querySelector<HTMLElement>(`[data-folder="${id}"]`) ?? null;

  /** Put the lifted tile under the finger, wherever its slot now is. */
  function follow() {
    const d = drag.current;
    const el = d && tile(d.id);
    if (!d || !el) return;
    el.style.transform = `translate3d(${d.px - d.sx - (el.offsetLeft - d.ox)}px, ${d.py - d.sy - (el.offsetTop - d.oy)}px, 0) scale(1.07)`;
  }

  function lift(id: string, pointer: number, x: number, y: number, from: string[]) {
    const el = tile(id);
    if (!el) return;
    try {
      el.setPointerCapture(pointer);
    } catch {
      /* the gesture still works while the finger stays on the tile */
    }
    drag.current = { id, pointer, sx: x, sy: y, ox: el.offsetLeft, oy: el.offsetTop, px: x, py: y, from, order: from };
    el.style.transition = "none";
    el.style.zIndex = "20";
    setLifted(id);
    follow();
  }

  function onPointerDown(e: React.PointerEvent, id: string) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swallowClick.current = false;
    if (arranging) {
      e.preventDefault();
      lift(id, e.pointerId, e.clientX, e.clientY, order);
      return;
    }
    const pointer = e.pointerId;
    const start = folders.map((f) => f.id);
    hold.current = {
      x: e.clientX,
      y: e.clientY,
      timer: setTimeout(() => {
        const h = hold.current;
        hold.current = null;
        if (!h) return;
        swallowClick.current = true;
        haptics.select();
        setOrder(start);
        setArranging(true);
        lift(id, pointer, h.x, h.y, start);
      }, HOLD_MS),
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const h = hold.current;
    if (h) {
      if (Math.abs(e.clientX - h.x) > SLOP_PX || Math.abs(e.clientY - h.y) > SLOP_PX) {
        clearTimeout(h.timer);
        hold.current = null;
      }
      return;
    }
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer || !grid.current) return;
    d.px = e.clientX;
    d.py = e.clientY;

    // Which slot is the finger over? Slots, not the tiles' painted boxes.
    const box = grid.current.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    // From the ref, not state: moves can come faster than renders.
    const live = d.order;
    let over: string | null = null;
    for (const id of live) {
      if (id === d.id) continue;
      const el = tile(id);
      if (el && x >= el.offsetLeft && x <= el.offsetLeft + el.offsetWidth && y >= el.offsetTop && y <= el.offsetTop + el.offsetHeight) {
        over = id;
        break;
      }
    }
    if (over) {
      const to = live.indexOf(over);
      const next = live.filter((id) => id !== d.id);
      next.splice(to, 0, d.id);
      d.order = next;
      haptics.select();
      setOrder(next);
    }
    follow();
  }

  function drop() {
    const h = hold.current;
    if (h) clearTimeout(h.timer);
    hold.current = null;
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const el = tile(d.id);
    if (el) {
      el.style.transition = `transform 260ms ${SETTLE}`;
      el.style.transform = "";
      setTimeout(() => {
        el.style.zIndex = "";
        el.style.transition = "";
      }, 270);
    }
    setLifted(null);
    if (d.order.join() !== d.from.join()) onReorder(d.order);
  }

  // Tiles that moved slide from their old slot to their new one.
  useLayoutEffect(() => {
    const seen = new Map<string, { x: number; y: number }>();
    for (const id of ids) {
      const el = tile(id);
      if (!el) continue;
      const now = { x: el.offsetLeft, y: el.offsetTop };
      seen.set(id, now);
      const was = slots.current.get(id);
      if (!was || id === drag.current?.id) continue;
      const dx = was.x - now.x;
      const dy = was.y - now.y;
      if (dx || dy) el.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 260, easing: SETTLE });
    }
    slots.current = seen;
    follow();
  });

  // A lifted tile owns the finger: the page must not scroll under it. Only a
  // non-passive touchmove can stop that once the touch has begun.
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const stop = (e: TouchEvent) => {
      if (drag.current) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  useEffect(() => {
    if (!arranging) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setArranging(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [arranging]);

  return (
    <section className="px-4 pt-4">
      <div className="mb-3 flex h-7 items-center justify-between">
        <h2 className="text-[13px] font-extrabold tracking-tight text-muted">Folders</h2>
        {arranging && (
          <button
            type="button"
            onClick={() => setArranging(false)}
            className="rounded-pill bg-accent px-3.5 py-1 text-xs font-extrabold text-accent-ink"
          >
            Done
          </button>
        )}
      </div>

      <div ref={grid} className="relative grid grid-cols-3 gap-x-3 gap-y-4">
        <button type="button" onClick={onOpenAll} disabled={arranging} className="block text-left disabled:opacity-60">
          <FolderArt folder={{ id: "all", emoji: null, color: "all", coverUrl: null, covers: all.covers }} />
          <span className="mt-2 block truncate text-[13px] font-bold">All saved</span>
          <span className="block text-[11px] tabular-nums text-muted">{all.count ?? " "}</span>
        </button>

        {shown.map((f, i) => (
          <div
            key={f.id}
            data-folder={f.id}
            className="relative"
            style={{ touchAction: arranging ? "none" : undefined }}
            onPointerDown={(e) => onPointerDown(e, f.id)}
            onPointerMove={onPointerMove}
            onPointerUp={drop}
            onPointerCancel={drop}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Link
              href={`/collections/${f.id}`}
              draggable={false}
              onClickCapture={(e) => {
                if (arranging || swallowClick.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  swallowClick.current = false;
                }
              }}
              className="block select-none"
              style={{ WebkitTouchCallout: "none" }}
            >
              <span
                className={`block ${arranging && lifted !== f.id ? "animate-folder-wiggle" : ""}`}
                style={{ animationDelay: `${(i % 3) * -0.11}s` }}
              >
                <FolderArt
                  folder={f}
                  className={`transition-shadow duration-200 ${lifted === f.id ? "shadow-[0_24px_40px_-14px_rgb(0_0_0/0.9)]" : ""}`}
                />
              </span>
              <span className="mt-2 flex min-w-0 items-center gap-1 text-[13px] font-bold">
                {f.emoji && <span className="shrink-0">{f.emoji}</span>}
                <span className="truncate">{f.name}</span>
              </span>
              <span className="block text-[11px] tabular-nums text-muted">{f.itemCount}</span>
            </Link>
          </div>
        ))}

        {folders.length === 0 && (
          <button type="button" onClick={onNew} className="block text-left">
            <span className="flex aspect-square items-center justify-center rounded-[22px] border-2 border-dashed border-border text-muted transition-colors active:bg-white/5">
              <Plus size={24} />
            </span>
            <span className="mt-2 block text-[13px] font-bold text-muted">New folder</span>
          </button>
        )}
      </div>
    </section>
  );
}
