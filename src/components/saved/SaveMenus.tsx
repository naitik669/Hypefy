"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { haptics } from "@/lib/haptics";
import type { Folder } from "@/lib/folders";
import { FolderSheet, type SavedTarget } from "@/components/saved/FolderSheet";
import { FolderDropdown, placeOver } from "@/components/saved/FolderDropdown";
import { FAN_REACH, FolderFan, fanItems, fanSpots, type FanItem } from "@/components/saved/FolderFan";
import { bumpFolderCounts, fileInto, forgetFolders, loadFolders, loadInside } from "@/components/saved/folder-store";

/** A press this long on the bookmark is a hold. */
const HOLD_MS = 420;
/** Movement before the hold lands that means a scroll, not a hold. */
const SLOP_PX = 10;
const HINT_KEY = "hypefy_save_hint_seen";

type Menu = "list" | "fan" | "hint" | null;

function hintSeen(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return true; // storage blocked: never nag
  }
}
function markHintSeen() {
  try {
    localStorage.setItem(HINT_KEY, "1");
  } catch {
    /* storage blocked */
  }
}

/**
 * Everything a bookmark does beyond filling in.
 *
 *  - Tap saves it, as ever, and drops down the list of folders (D1) above
 *    the bookmark, with Saved ticked, to file it further or just tap away.
 *    Tapping one that is already saved opens the list, where it can be
 *    unsaved or moved.
 *  - Hold fans your folders out of it (D3): slide to one and let go to file
 *    it there. More opens the list; New makes a folder.
 *  - The very first save shows a hint instead of the list, pointing at the
 *    bookmark: hold it for folders. Once, ever, per device.
 *
 * Pass the bookmark button's ref in, spread `handlers` on the button, and
 * render `overlays` anywhere in the card.
 */
export function useSaveMenus({
  button,
  target,
  userId,
  saved,
  setSaved,
  persist,
  onSignedOut,
  iconSize,
}: {
  /** The bookmark button, which the menus open from. */
  button: React.RefObject<HTMLButtonElement | null>;
  target: SavedTarget;
  userId: string | null | undefined;
  saved: boolean;
  /** Mark it saved without a request — filing into a folder already saved it. */
  setSaved: (saved: boolean) => void;
  /** Save or unsave it for real; resolves whether that worked. */
  persist: (next: boolean) => Promise<boolean>;
  onSignedOut: () => void;
  /** The bookmark's size, for the copy of it drawn above the dimmed page. */
  iconSize: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [menu, setMenu] = useState<Menu>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [inside, setInside] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<number | null>(null);
  const [detached, setDetached] = useState(false);
  const [sheet, setSheet] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const start = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const post = target.post;
  const shot = target.shot;

  /** Read folders and where this one is filed. Cheap when the folders are cached. */
  function load() {
    if (!userId) return;
    const t: SavedTarget = post ? { post } : { shot: shot! };
    void Promise.all([loadFolders(supabase, userId), loadInside(supabase, t)]).then(([f, i]) => {
      setFolders(f);
      setInside(i);
    });
  }

  function open(next: Exclude<Menu, null>, asDetached = false) {
    const el = button.current;
    if (!el) return;
    setAnchor(el.getBoundingClientRect());
    setActive(null);
    setDetached(asDetached);
    setMenu(next);
  }

  function close() {
    window.clearTimeout(timer.current);
    setMenu(null);
    setActive(null);
    setDetached(false);
  }

  // Scrolling, resizing or Escape puts any of them away — they are pinned to
  // where the bookmark was, and would float off it otherwise.
  useEffect(() => {
    if (!menu) return;
    const shut = () => close();
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", shut, { capture: true, passive: true });
    window.addEventListener("resize", shut);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("scroll", shut, { capture: true });
      window.removeEventListener("resize", shut);
      document.removeEventListener("keydown", key);
    };
  }, [menu]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** File it in exactly `next`, after anything still on its way. */
  function file(next: Set<string>, message?: string) {
    const before = inside;
    const added = new Set([...next].filter((id) => !before.has(id)));
    const removed = new Set([...before].filter((id) => !next.has(id)));
    setInside(next);
    setFolders((all) =>
      all?.map((f) =>
        added.has(f.id) ? { ...f, itemCount: f.itemCount + 1 } : removed.has(f.id) ? { ...f, itemCount: Math.max(0, f.itemCount - 1) } : f
      ) ?? all
    );
    if (next.size > 0) setSaved(true);
    const t: SavedTarget = post ? { post } : { shot: shot! };
    queue.current = queue.current.then(async () => {
      const ok = await fileInto(supabase, t, next);
      if (!ok) {
        setInside(before);
        toast("Couldn't update folders", "error");
        return;
      }
      if (userId) bumpFolderCounts(userId, added, removed);
      if (message) toast(message, "success");
    });
  }

  async function toggleSaved() {
    haptics.select();
    const next = !saved;
    const ok = await persist(next);
    // Unsaving takes it out of every folder too (a trigger does that).
    if (ok && !next) setInside(new Set());
  }

  function toggleFolder(f: Folder) {
    haptics.select();
    const next = new Set(inside);
    if (next.has(f.id)) next.delete(f.id);
    else next.add(f.id);
    file(next);
  }

  function newFolder() {
    close();
    setSheet(true);
  }

  function chooseFan(i: number, items: FanItem[]) {
    const item = items[i];
    close();
    if (!item) return;
    haptics.tap();
    if (item.kind === "more") return open("list");
    if (item.kind === "new") return newFolder();
    if (inside.has(item.folder.id)) {
      toast(`Already in ${item.folder.name}`);
      return;
    }
    file(new Set(inside).add(item.folder.id), `Saved to ${item.folder.name}`);
  }

  const items = fanItems(folders ?? []);

  function hit(x: number, y: number): number | null {
    if (!anchor) return null;
    let best: number | null = null;
    let bd = FAN_REACH;
    fanSpots(anchor, items.length).forEach((s, i) => {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  async function tap() {
    if (!userId) return onSignedOut();
    if (!saved) {
      const ok = await persist(true);
      if (!ok) return;
      if (!hintSeen()) {
        markHintSeen();
        return open("hint");
      }
    }
    load();
    open("list");
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!userId || menu) return;
      held.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      load(); // ready by the time the hold lands
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // keep the moves once the finger leaves it
      } catch {
        /* sliding needs the finger to stay near; tapping still works */
      }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        held.current = true;
        haptics.select();
        open("fan");
      }, HOLD_MS);
    },
    onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
      if (menu === "fan" && !detached) {
        const i = hit(e.clientX, e.clientY);
        if (i !== active) {
          setActive(i);
          if (i !== null) haptics.select();
        }
        return;
      }
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > SLOP_PX) window.clearTimeout(timer.current);
    },
    onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
      window.clearTimeout(timer.current);
      if (menu !== "fan" || detached) return;
      const i = hit(e.clientX, e.clientY) ?? active;
      if (i !== null) return chooseFan(i, items);
      // Let go without sliding anywhere: the fan stays, to be tapped.
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) < 24) setDetached(true);
      else close();
    },
    onPointerCancel() {
      window.clearTimeout(timer.current);
      if (menu === "fan" && !detached) close();
    },
    onClick() {
      // The end of a hold is not a tap.
      if (held.current) {
        held.current = false;
        return;
      }
      void tap();
    },
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      if (held.current || !userId) return;
      // A right-click: the fan, to click through.
      held.current = true;
      load();
      open("fan", true);
    },
  };

  const overlays =
    typeof document === "undefined"
      ? null
      : createPortal(
          <>
            {menu && anchor && (
              <>
                {/* The page dims behind a menu (not behind the hint), and a
                    tap on it puts the menu away. */}
                <div
                  aria-hidden
                  className={`fixed inset-0 z-[150] ${menu === "hint" ? "" : "bg-black/45 animate-[fade-in_0.2s_ease-out_both]"}`}
                  onClick={close}
                  style={{ pointerEvents: menu === "fan" && !detached ? "none" : "auto" }}
                />
                {/* The bookmark, lifted above the dim so the menu reads as coming out of it. */}
                <span
                  aria-hidden
                  className="pointer-events-none fixed z-[151] flex items-center justify-center"
                  style={{ left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height }}
                >
                  {menu === "hint" && <span className="absolute inset-[-8px] rounded-full animate-[save-pulse_1.6s_ease-out_infinite]" />}
                  <Bookmark size={iconSize} strokeWidth={2.2} className={saved ? "text-accent" : "text-white"} fill={saved ? "currentColor" : "none"} />
                </span>
              </>
            )}
            {menu === "list" && anchor && (
              <FolderDropdown
                anchor={anchor}
                saved={saved}
                folders={folders}
                inside={inside}
                onToggleSaved={() => void toggleSaved()}
                onToggleFolder={toggleFolder}
                onNew={newFolder}
              />
            )}
            {menu === "fan" && anchor && folders && (
              <FolderFan
                anchor={anchor}
                items={items}
                inside={inside}
                active={active}
                detached={detached}
                onChoose={(i) => chooseFan(i, items)}
              />
            )}
            {menu === "hint" && anchor && <SaveHint anchor={anchor} onDone={close} />}
          </>,
          document.body
        );

  return {
    handlers,
    overlays: (
      <>
        {overlays}
        {userId && (
          <FolderSheet
            open={sheet}
            onClose={() => {
              setSheet(false);
              // A folder may have been made in there: read them fresh next time.
              forgetFolders();
            }}
            target={post ? { post } : { shot: shot! }}
            userId={userId}
            onSaved={() => setSaved(true)}
            startMaking
          />
        )}
      </>
    ),
  };
}

/**
 * The first-save hint (H1): points at the bookmark and says what holding it
 * does. Shown once; Got it, or a tap anywhere, puts it away.
 */
function SaveHint({ anchor, onDone }: { anchor: DOMRect; onDone: () => void }) {
  const place = placeOver(anchor, 256, 150);
  return (
    <div
      role="dialog"
      aria-label="Saving into folders"
      className={`fixed z-[151] ${place.up ? "origin-bottom-right" : "origin-top-right"} animate-[pop-menu_0.4s_cubic-bezier(0.2,1.3,0.4,1)_both]`}
      style={place.style}
    >
      <div className="relative rounded-[18px] border border-white/10 bg-elevated px-3.5 pb-3 pt-3.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]">
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.07]">
            <Bookmark size={17} className="animate-[save-press_1.8s_0.6s_ease-in-out_infinite]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold">
              Saved<span className="text-accent">.</span> Hold it for folders
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted">
              Hold the bookmark to fan out your folders and slide straight into one.
            </p>
          </div>
        </div>
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={onDone}
            className="rounded-[10px] bg-accent px-3.5 py-1.5 text-xs font-extrabold text-accent-ink transition-transform active:scale-95"
          >
            Got it
          </button>
        </div>
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
