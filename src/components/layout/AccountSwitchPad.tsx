"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import {
  getSavedAccounts,
  removeSavedAccount,
  type SavedAccount,
} from "@/lib/saved-accounts";

/**
 * Hold the profile tab to raise the account switcher, slide the thumb to the
 * account you want, let go to land on it.
 *
 * The whole interaction lives inside ONE pointer gesture, which is what makes
 * it feel like hardware rather than a menu. Consequences worth knowing before
 * editing:
 *
 *  - The trigger captures the pointer on long-press, so pointermove keeps
 *    arriving once the thumb has left the tab. Without capture the stack goes
 *    dead the moment the finger slides off a 48px target, which is instantly.
 *  - Hit-testing runs against measured rects rather than hover, because a
 *    finger produces no hover and elementFromPoint would land on the label or
 *    the veil as often as the tile.
 *  - Rows match on the Y axis alone. Thumbs arc sideways as they travel up —
 *    wrists rotate — so demanding X containment breaks the top of the stack
 *    for exactly the people reaching furthest.
 *
 * A plain tap is untouched: if the hold never completes, the click falls
 * through to /profile as before.
 */

/** Hold before the stack appears. Long enough not to fire while scrolling. */
const HOLD_MS = 320;
/** Movement that cancels the hold — treat it as a scroll, not a press. */
const CANCEL_SLOP_PX = 10;
/** Username preview cap, so a long name cannot reach the screen edge. */
const NAME_MAX = 14;

type Row = { kind: "add" } | { kind: "account"; account: SavedAccount };

export function AccountSwitchPad({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();

  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  /** Set once the hold completes, so the trailing click is swallowed. */
  const didHold = useRef(false);
  const rowEls = useRef<(HTMLElement | null)[]>([]);
  const triggerRef = useRef<HTMLDivElement | null>(null);

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIdx(null);
  }, []);

  useEffect(() => () => cancelHold(), [cancelHold]);

  async function switchTo(account: SavedAccount) {
    setSwitching(true);
    const supabase = createClient();
    const { error } = await supabase.auth.setSession({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    if (error) {
      // Refresh tokens expire. Drop the dead entry rather than leaving a tile
      // that fails every time it is chosen.
      removeSavedAccount(account.userId);
      setRows(buildRows(currentUserId));
      setSwitching(false);
      toast("That account needs signing in again", "error");
      return;
    }

    haptics.success();
    // Hard navigation, not router.push: every server component on this page
    // was rendered for the previous user and has to be thrown away.
    window.location.href = "/home";
  }

  function onPointerDown(e: React.PointerEvent) {
    if (switching) return;
    didHold.current = false;
    startY.current = e.clientY;
    startX.current = e.clientX;

    cancelHold();
    holdTimer.current = setTimeout(() => {
      setRows(buildRows(currentUserId));
      rowEls.current = [];
      didHold.current = true;
      setOpen(true);
      setActiveIdx(null);
      haptics.select();

      // Keep receiving moves after the thumb leaves the small tab.
      try {
        triggerRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — the gesture still works over the tab */
      }
    }, HOLD_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!open) {
      const moved =
        Math.abs(e.clientY - startY.current) > CANCEL_SLOP_PX ||
        Math.abs(e.clientX - startX.current) > CANCEL_SLOP_PX;
      if (moved) cancelHold();
      return;
    }

    let hit: number | null = null;
    for (let i = 0; i < rowEls.current.length; i++) {
      const el = rowEls.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        hit = i;
        break;
      }
    }

    if (hit !== activeIdx) {
      setActiveIdx(hit);
      if (hit !== null) haptics.select();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    cancelHold();
    try {
      triggerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured */
    }

    if (!open) return;

    const chosen = activeIdx === null ? null : rows[activeIdx];
    close();

    if (!chosen) return;
    if (chosen.kind === "add") {
      haptics.tap();
      router.push("/signin?add=1");
      return;
    }
    void switchTo(chosen.account);
  }

  return (
    <div className="relative flex items-center justify-center">
      {open && (
        <>
          {/* Dims the app and swallows the stray tap that would otherwise
              land on whatever sits under the raised tiles. */}
          <div
            className="animate-switch-veil fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
            aria-hidden
          />

          <div
            className="absolute bottom-[calc(100%+14px)] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3"
            role="listbox"
            aria-label="Switch account"
          >
            {rows.map((row, i) => {
              const active = i === activeIdx;
              const name =
                row.kind === "account"
                  ? row.account.username ||
                    row.account.displayName ||
                    row.account.email
                  : "Add account";

              return (
                <div
                  key={row.kind === "add" ? "add" : row.account.userId}
                  ref={(el) => {
                    rowEls.current[i] = el;
                  }}
                  role="option"
                  aria-selected={active}
                  className="relative flex items-center justify-end"
                  style={{
                    // Stagger outwards from the thumb, so the stack unfurls
                    // away from the finger rather than at it.
                    animation: `switch-rise 260ms cubic-bezier(0.16,1,0.3,1) ${
                      (rows.length - 1 - i) * 38
                    }ms backwards`,
                  }}
                >
                  {/* Label sits to the LEFT, and only for the row under the
                      thumb — labelling every row at once is a wall of text
                      over the feed. */}
                  <span
                    className={`pointer-events-none absolute right-[calc(100%+10px)] max-w-[42vw] truncate rounded-lg bg-background/90 px-2.5 py-1 text-[13px] font-bold whitespace-nowrap text-foreground shadow-lg ring-1 ring-border/70 transition-all duration-200 ${
                      active
                        ? "translate-x-0 opacity-100"
                        : "translate-x-2 opacity-0"
                    }`}
                  >
                    {truncateName(name)}
                  </span>

                  <div
                    className={`transition-transform duration-200 ease-out ${
                      active ? "-translate-x-2.5 scale-110" : "scale-100"
                    }`}
                  >
                    {row.kind === "add" ? (
                      <span
                        className={`flex h-12 w-12 items-center justify-center rounded-[16px] border-2 border-dashed transition-colors duration-200 ${
                          active
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-border bg-surface/95 text-muted"
                        }`}
                      >
                        <Plus size={22} weight="bold" aria-hidden />
                      </span>
                    ) : (
                      <Avatar
                        name={
                          row.account.displayName || row.account.email || "?"
                        }
                        hue={row.account.avatarHue ?? 200}
                        src={row.account.avatarUrl ?? undefined}
                        size={48}
                        className={`rounded-[16px] shadow-xl transition-all duration-200 ${
                          active
                            ? "ring-[3px] ring-accent"
                            : "opacity-90 ring-1 ring-white/10"
                        }`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div
        ref={triggerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          cancelHold();
          close();
        }}
        onContextMenu={(e) => {
          // Android raises its own long-press menu over the avatar image.
          if (open || didHold.current) e.preventDefault();
        }}
        onClickCapture={(e) => {
          // The hold ends in a click. Let it through only for a real tap.
          if (didHold.current) {
            e.preventDefault();
            e.stopPropagation();
            didHold.current = false;
          }
        }}
        // Without this the browser claims the gesture for scrolling and stops
        // sending moves the instant the thumb travels.
        style={{ touchAction: open ? "none" : "manipulation" }}
        className={`relative z-50 transition-transform duration-200 ${
          open ? "scale-95" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Current account excluded — switching to the one you are on is a no-op. */
function buildRows(currentUserId: string): Row[] {
  const others = getSavedAccounts().filter((a) => a.userId !== currentUserId);
  // "+" furthest from the thumb: accounts are the common case and deserve the
  // shortest reach.
  return [
    { kind: "add" },
    ...others.map((account) => ({ kind: "account" as const, account })),
  ];
}

function truncateName(name: string) {
  const clean = name.trim();
  return clean.length > NAME_MAX ? `${clean.slice(0, NAME_MAX - 1)}…` : clean;
}
