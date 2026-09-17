"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { haptics } from "@/lib/haptics";
import { AccountSwitchOverlay } from "@/components/auth/AccountSwitchOverlay";
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
 *  - Hit-testing runs against the reel's measured rect rather than hover,
 *    because a finger produces no hover.
 *  - Rows match on the Y axis alone. Thumbs arc sideways as they travel up —
 *    wrists rotate — so demanding X containment breaks the top of the stack
 *    for exactly the people reaching furthest.
 *
 * With more accounts than fit, the list is a reel. Pushing the thumb past the
 * top face turns it: accounts further up come down into reach and the ones
 * by the tab sink and fade out at the bottom. The reel follows the thumb and
 * carries on a little when the thumb stops (a short glide), then settles on a
 * face. Sliding back down to the tab turns it back. The "+" sits above the
 * reel and never scrolls; it is reached by pushing on past the end of the list.
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

/** Reel geometry, in px. */
export const REEL = {
  /** One face (48) plus the gap to the next. */
  PITCH: 60,
  /** Faces in view at once. */
  VISIBLE: 4,
  /** Room under the lowest face for the fade it sinks into. */
  PAD: 22,
  /** Room above the reel where an arriving face fades in under the "+",
   *  instead of being cut off at the reel's top edge. One face tall. */
  HEADROOM: 60,
  /** Reel travel per px of thumb: 20px of thumb brings the next account. */
  RATIO: 3,
  /** Thumb travel past the end of the list that lands on "+". */
  ADD_PUSH: 28,
  /** No move for this long and the reel glides on by itself. */
  GLIDE_AFTER_MS: 40,
} as const;

/** Faces sink into a fade at the bottom. The top fade is per face, in paint(). */
const REEL_MASK = `linear-gradient(to top, transparent 0, #000 ${
  REEL.PAD + 4
}px)`;

/** Centre of account `i`, measured up from the reel's bottom edge. */
export function reelCentre(i: number, scroll: number) {
  return REEL.PAD + REEL.PITCH / 2 + i * REEL.PITCH - scroll;
}
/** Height of the reel for `n` accounts. */
export function reelHeight(n: number) {
  return REEL.PAD + Math.min(n, REEL.VISIBLE) * REEL.PITCH;
}
/** Furthest the reel turns. */
export function reelMax(n: number) {
  return Math.max(0, (n - REEL.VISIBLE) * REEL.PITCH);
}

/**
 * Turns the reel by a thumb movement above the engage line. `up` is px moved
 * up (negative for down). Past the end of the list the movement is banked as
 * push towards "+"; coming back down spends that push before the reel turns.
 */
export function turnReel(
  state: { scroll: number; push: number },
  up: number,
  n: number
): { scroll: number; push: number } {
  const max = reelMax(n);
  let { scroll, push } = state;
  if (up > 0) {
    const turn = Math.min(max - scroll, up * REEL.RATIO);
    scroll += turn;
    push += up - turn / REEL.RATIO;
  } else if (up < 0) {
    const spend = Math.min(push, -up);
    push -= spend;
    scroll = Math.max(0, scroll - (-up - spend) * REEL.RATIO);
  }
  return { scroll, push };
}

/** Where the reel starts turning: the centre of the top face in view. */
function engageLine(rect: DOMRect, n: number) {
  return rect.bottom - reelCentre(Math.min(n, REEL.VISIBLE) - 1, 0);
}

type Pick = "add" | number | null;

export function AccountSwitchPad({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();

  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Pick>(null);
  const [switching, setSwitching] = useState<SavedAccount | null>(null);
  /** Pointer was taken away mid-gesture; the stack stays up and is tapped. */
  const [detached, setDetached] = useState(false);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  /** Set once the hold completes, so the trailing click is swallowed. */
  const didHold = useRef(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const reelRef = useRef<HTMLDivElement | null>(null);
  const addRef = useRef<HTMLDivElement | null>(null);
  const tileEls = useRef<(HTMLDivElement | null)[]>([]);

  /**
   * Per-frame gesture state. Kept out of React: the reel is written straight
   * to the tiles' transforms every frame, and only a change of the face under
   * the thumb re-renders.
   */
  const g = useRef({
    scroll: 0,
    push: 0,
    /** Reel speed in px/ms, for the glide. */
    vel: 0,
    thumbY: 0,
    lastMoveAt: 0,
    lastFrameAt: 0,
    active: null as Pick,
    n: 0,
  });

  const cancelHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActive(null);
    setDetached(false);
  }, []);

  useEffect(() => () => cancelHold(), [cancelHold]);

  const paint = useCallback(() => {
    const s = g.current;
    const h = reelHeight(s.n) + REEL.HEADROOM;
    const rest = REEL.PAD + REEL.PITCH / 2;
    const top = reelCentre(Math.min(s.n, REEL.VISIBLE) - 1, 0);
    for (let i = 0; i < tileEls.current.length; i++) {
      const el = tileEls.current[i];
      if (!el) continue;
      const c = reelCentre(i, s.scroll);
      // A face sinking below its resting place shrinks a little as it fades.
      const scale = c < rest ? 0.85 + 0.15 * Math.max(0, c / rest) : 1;
      el.style.transform = `translate3d(0,${h - c - 24}px,0) scale(${scale})`;
      // Above the top face in view a face fades out under the "+": gone by the
      // time it is one face higher, so the next account never peeks in at rest.
      const fade =
        c > top ? Math.max(0, 1 - (c - top) / (REEL.PITCH * 0.8)) : 1;
      el.style.opacity = String(fade);
      el.style.visibility =
        fade === 0 || c < -REEL.PITCH ? "hidden" : "visible";
    }
  }, []);

  // The frame loop: glide, the slide back down, settling on a face, and
  // what the thumb is on. It runs for as long as the stack is up.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const frame = (now: number) => {
      const s = g.current;
      const dt = Math.min(40, s.lastFrameAt ? now - s.lastFrameAt : 16);
      s.lastFrameAt = now;
      const rect = reelRef.current?.getBoundingClientRect();
      if (!rect && !detached) {
        // No other accounts: only the "+", reached by sliding up to it.
        const addRect = addRef.current?.getBoundingClientRect();
        const pick: Pick =
          addRect && s.thumbY < addRect.bottom + 12 ? "add" : null;
        if (pick !== s.active) {
          s.active = pick;
          setActive(pick);
          if (pick) haptics.select();
        }
      }
      if (rect && !detached) {
        const max = reelMax(s.n);
        const line = engageLine(rect, s.n);
        const still = now - s.lastMoveAt > REEL.GLIDE_AFTER_MS;

        if (s.thumbY > rect.bottom + 8 && s.scroll > 0) {
          // Back down by the tab: the reel runs back, faster the lower.
          const depth = Math.min(1, (s.thumbY - rect.bottom - 8) / 50);
          s.scroll = Math.max(0, s.scroll - (0.25 + 0.4 * depth) * dt);
          s.vel = 0;
          s.push = 0;
        } else if (still && Math.abs(s.vel) > 0.02) {
          // The glide: the reel carries on briefly after the thumb stops.
          s.scroll = Math.max(0, Math.min(max, s.scroll + s.vel * dt));
          if (s.scroll === 0 || s.scroll === max) s.vel = 0;
          s.vel *= Math.pow(0.9, dt / 16);
        } else if (still) {
          s.vel = 0;
          const to = Math.round(s.scroll / REEL.PITCH) * REEL.PITCH;
          s.scroll += (to - s.scroll) * Math.min(1, dt / 90);
          if (Math.abs(to - s.scroll) < 0.5) s.scroll = to;
        }

        let pick: Pick = null;
        if (s.scroll >= max - 1 && s.push > REEL.ADD_PUSH) pick = "add";
        else if (s.thumbY <= rect.bottom + 10) {
          // Above the engage line the top face in view stays picked while
          // the reel turns under it.
          const y = Math.max(line, s.thumbY);
          let best = Infinity;
          for (let i = 0; i < s.n; i++) {
            const cy = rect.bottom - reelCentre(i, s.scroll);
            // Only faces wholly in view: not one peeking in at the top.
            if (
              cy < rect.top + REEL.HEADROOM + 20 ||
              cy > rect.bottom - REEL.PAD / 2
            )
              continue;
            const d = Math.abs(cy - y);
            if (d < best) {
              best = d;
              pick = i;
            }
          }
        }
        if (pick !== s.active) {
          s.active = pick;
          setActive(pick);
          if (pick !== null) haptics.select();
        }
      }
      paint();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open, detached, paint]);

  async function switchTo(account: SavedAccount) {
    setSwitching(account);
    const supabase = createClient();
    const { error } = await supabase.auth.setSession({
      access_token: account.accessToken,
      refresh_token: account.refreshToken,
    });

    if (error) {
      // Refresh tokens expire. Drop the dead entry rather than leaving a tile
      // that fails every time it is chosen.
      removeSavedAccount(account.userId);
      setAccounts(otherAccounts(currentUserId));
      setSwitching(null);
      toast("That account needs signing in again", "error");
      return;
    }

    haptics.success();
    // Hard navigation, not router.push: every server component on this page
    // was rendered for the previous user and has to be thrown away.
    window.location.href = "/home";
  }

  function commit(pick: Pick) {
    close();
    if (pick === null) return;
    if (pick === "add") {
      haptics.tap();
      router.push("/signin?add=1");
      return;
    }
    const account = accounts[pick];
    if (account) void switchTo(account);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (switching) return;
    didHold.current = false;
    startY.current = e.clientY;
    startX.current = e.clientX;

    cancelHold();
    holdTimer.current = setTimeout(() => {
      const list = otherAccounts(currentUserId);
      setAccounts(list);
      tileEls.current = [];
      // Every opening starts from the accounts nearest the tab.
      Object.assign(g.current, {
        scroll: 0,
        push: 0,
        vel: 0,
        thumbY: startY.current,
        lastMoveAt: 0,
        lastFrameAt: 0,
        active: null,
        n: list.length,
      });
      didHold.current = true;
      setOpen(true);
      setActive(null);
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

    const s = g.current;
    const now = performance.now();
    const prev = s.thumbY;
    s.thumbY = e.clientY;
    const rect = reelRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Only the part of the movement above the engage line turns the reel.
    const line = engageLine(rect, s.n);
    const up = Math.min(prev, line) - Math.min(e.clientY, line);
    if (e.clientY > line) s.push = 0;
    if (up !== 0) {
      const before = s.scroll;
      Object.assign(s, turnReel(s, up, s.n));
      const dt = Math.max(1, now - s.lastMoveAt);
      // Smoothed, so one jittery event does not decide how far it glides.
      s.vel = s.vel * 0.5 + ((s.scroll - before) / Math.min(dt, 64)) * 0.5;
    } else {
      s.vel = 0;
    }
    s.lastMoveAt = now;
  }

  function onPointerUp(e: React.PointerEvent) {
    cancelHold();
    try {
      triggerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured */
    }

    if (!open) return;
    // The pointer was already taken away — the stack is being tapped now,
    // so a stray release must not commit or dismiss it.
    if (detached) return;

    commit(g.current.active);
  }

  const nameOf = (a: SavedAccount) => a.username || a.displayName || a.email;
  const n = accounts.length;
  const reelH = reelHeight(n);

  return (
    <div className="relative flex items-center justify-center">
      {/* The switch ends in a full page load; without this the tap looks
          swallowed for the whole of it. */}
      {switching && (
        <AccountSwitchOverlay
          name={switching.displayName || switching.username || switching.email}
          username={switching.username}
          avatarUrl={switching.avatarUrl}
          avatarHue={switching.avatarHue}
        />
      )}
      {open && (
        <>
          {/* Portalled for the same reason as the switch overlay: the nav
              carries backdrop-blur, which makes it the containing block for
              fixed children, so this dimmed the tab bar and nothing else.

              z-25 puts it UNDER the nav (z-30). The tiles live inside the
              nav, and the nav is its own stacking context, so their z-50 is
              capped at 30 against the root — a portalled veil at z-40 sat
              on top of them and blurred the very accounts being chosen. */}
          {typeof document !== "undefined" &&
            createPortal(
              <div
                className="animate-switch-veil fixed inset-0 z-[25] bg-black/55 backdrop-blur-[2px]"
                aria-hidden
                onPointerDown={detached ? close : undefined}
              />,
              document.body
            )}

          <div
            className="absolute bottom-[calc(100%+14px)] left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3"
            role="listbox"
            aria-label="Switch account"
          >
            {/* "+" is outside the reel, so the way to a new account is always
                in the same place. It sits over the reel, which reaches up
                under it for faces fading in. */}
            <div className="relative z-10">
              <Face
                ref={addRef}
                name="Add account"
                active={active === "add"}
                delay={Math.min(n, REEL.VISIBLE) * 38}
                onPick={detached ? () => commit("add") : undefined}
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-[16px] border-2 border-dashed transition-colors duration-200 ${
                    active === "add"
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-surface/95 text-muted"
                  }`}
                >
                  <Plus size={22} weight="bold" aria-hidden />
                </span>
              </Face>
            </div>

            {n > 0 && (
              <div className="relative w-12" style={{ height: reelH }}>
                {/* Wider than the column so the name beside a face has room,
                    and taller, so a face coming down fades in under the "+"
                    rather than being cut off. Faces sinking out at the bottom
                    fade through the mask. The reel itself takes no touches, or
                    its headroom would cover the "+" when tapping. */}
                <div
                  ref={reelRef}
                  data-switch-reel=""
                  className="pointer-events-none absolute bottom-0 right-[-16px] w-[75vw] max-w-[320px] overflow-hidden"
                  style={{
                    height: reelH + REEL.HEADROOM,
                    maskImage: REEL_MASK,
                    WebkitMaskImage: REEL_MASK,
                  }}
                >
                  {accounts.map((account, i) => (
                    <div
                      key={account.userId}
                      ref={(el) => {
                        tileEls.current[i] = el;
                      }}
                      className="pointer-events-auto absolute right-4 top-0 h-12 w-12"
                      style={{
                        transform: `translate3d(0,${
                          reelH + REEL.HEADROOM - reelCentre(i, 0) - 24
                        }px,0)`,
                        visibility: i < REEL.VISIBLE ? "visible" : "hidden",
                      }}
                    >
                      <Face
                        name={nameOf(account)}
                        active={active === i}
                        delay={i * 38}
                        onPick={detached ? () => commit(i) : undefined}
                      >
                        <Avatar
                          name={account.displayName || account.email || "?"}
                          hue={account.avatarHue ?? 200}
                          src={account.avatarUrl ?? undefined}
                          size={48}
                          className={`rounded-[16px] shadow-xl transition-all duration-200 ${
                            active === i
                              ? "ring-[3px] ring-accent"
                              : "opacity-90 ring-1 ring-white/10"
                          }`}
                        />
                      </Face>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
          // Deliberately does NOT close. Some WebViews cancel the pointer
          // even with touch-action: none, and dropping the stack here is
          // what made it flash up and vanish. Fall back to tap-to-choose.
          if (open) {
            setDetached(true);
            setActive(null);
            g.current.active = null;
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onClickCapture={(e) => {
          // The hold ends in a click. Let it through only for a real tap.
          if (didHold.current) {
            e.preventDefault();
            e.stopPropagation();
            didHold.current = false;
          }
        }}
        // touch-action is read at TOUCHSTART, so it cannot be switched on
        // once the hold completes — by then the browser has already reserved
        // the gesture for panning and will cancel the pointer the moment the
        // thumb moves. It has to be "none" from the very first contact.
        // Long-press on a link or image also raises the WebView's own
        // callout, which cancels the pointer too; hence the rest.
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
        className={`relative z-50 transition-transform duration-200 ${
          open ? "scale-95" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * One face in the stack, with its name sliding out from behind it while the
 * thumb is on it.
 */
function Face({
  ref,
  name,
  active,
  delay,
  onPick,
  children,
}: {
  ref?: React.Ref<HTMLDivElement>;
  name: string;
  active: boolean;
  delay: number;
  /** Only while detached: during a live drag the trigger holds the pointer. */
  onPick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      data-switch-rise=""
      onPointerDown={
        onPick
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick();
            }
          : undefined
      }
      className="relative flex items-center justify-end"
      style={{
        // Stagger outwards from the thumb, so the stack unfurls away from
        // the finger rather than at it.
        animation: `switch-rise 260ms cubic-bezier(0.16,1,0.3,1) ${delay}ms backwards`,
      }}
    >
      {/* Label sits to the LEFT, and only for the face under the thumb. It
          slides out from BEHIND the tile, right to left: this wrapper's right
          edge lines up with the tile's left edge and clips, so a parked label
          is hidden without being transparent. Padding on three sides gives
          the shadow and ring room — only the un-padded right edge cuts. */}
      <span className="pointer-events-none absolute right-full overflow-hidden py-2 pl-3">
        <span
          className="block max-w-[42vw] truncate rounded-lg bg-background/90 px-2.5 py-1 text-[13px] font-bold whitespace-nowrap text-foreground shadow-lg ring-1 ring-border/70"
          style={{
            transform: active
              ? "translate3d(0,0,0)"
              : "translate3d(calc(100% + 10px), 0, 0)",
            marginRight: 10,
            transition: "transform 260ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          {truncateName(name)}
        </span>
      </span>

      <div
        className={`transition-transform duration-200 ease-out ${
          active ? "-translate-x-2.5 scale-110" : "scale-100"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Current account excluded — switching to the one you are on is a no-op. */
function otherAccounts(currentUserId: string): SavedAccount[] {
  return getSavedAccounts().filter((a) => a.userId !== currentUserId);
}

function truncateName(name: string) {
  const clean = name.trim();
  return clean.length > NAME_MAX ? `${clean.slice(0, NAME_MAX - 1)}…` : clean;
}
