"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { haptics } from "@/lib/haptics";
import { useOverlayBackButton } from "@/lib/overlay-stack";

/** Hold before the stack appears. Matches AccountSwitchPad. */
const HOLD_MS = 320;
/** Movement that cancels the hold — treat it as a scroll, not a press. */
const CANCEL_SLOP_PX = 10;

/**
 * Any icon that takes a size and a class — lucide's, Phosphor's, or one of
 * ours. Typed structurally rather than as LucideIcon so a menu can use
 * whichever family reads best at its size, which is how the create fan came
 * to use Phosphor's while the stacks stay on lucide's.
 */
type IconType = React.ComponentType<{ size?: number; className?: string }>;

export type HoldAction = {
  /** Ignored when `avatar` is set. One of the two is required. */
  icon?: IconType;
  label: string;
  /** Where choosing this goes. Omitted when `onSelect` does the work. */
  href?: string;
  /**
   * Chosen without going anywhere — sending a post to someone, say.
   *
   * Takes precedence over `href`. It exists because the same hold-and-slide
   * is worth having outside the nav bar: the share button uses this menu so
   * that holding it behaves exactly like holding a tab, rather than being a
   * second gesture that looks similar and works differently.
   */
  onSelect?: () => void;
  /** Distinguishes two options that share a label and have no href. */
  key?: string;
  /**
   * Renders a person in the tile instead of a glyph.
   *
   * The chat shortcuts are people, and a row of identical speech bubbles
   * would make you read four labels to tell them apart — the whole point of
   * the gesture is that you can pick without reading. A face is recognisable
   * at 48px in a way a name is not.
   */
  avatar?: { name: string; hue: number; src?: string | null };
  /** Unread messages waiting in this thread. 0 or absent draws nothing. */
  unread?: number;
  /**
   * Colour of this option WHEN IT IS UNDER THE THUMB. Nothing is tinted at
   * rest.
   *
   * The fan first shipped with a different gradient on every tile, which is
   * four competing colours to say one thing — and the thing they were saying,
   * "these are four different features", the icons and the caption already
   * said. Resting tiles are the app's own dark material now, and the accent
   * appears on exactly one tile at a time: the one you are choosing, in the
   * same lime as the button still under your thumb.
   *
   * "danger" is for Live alone. A broadcast is the one thing here that other
   * people see the instant you tap it, and red is what every camera in
   * history has used to say "you are on".
   */
  tone?: "accent" | "danger";
  /**
   * Row only: on release, show a check on this option for a moment before
   * the card closes. For choices that happen in place (sending a post to
   * someone), where closing at once left nothing to say it had worked.
   */
  confirm?: boolean;
};

/** Row tiles: the face, the gap between faces, the card's inner padding. */
const ROW_TILE = 52;
const ROW_GAP = 4;
const ROW_PAD = 8;
/** How long a confirmed pick stays on screen with its check. */
const CONFIRM_MS = 420;
/** Row triggers sit in a scrolling page, so a thumb gets a little more drift. */
const ROW_SLOP_PX = 16;

/**
 * How much a row tile swells for a thumb this far from its centre: 1 on top
 * of it, falling to 0 a tile and a half away. Drives the Dock-style lens.
 */
export function rowLens(distance: number): number {
  const reach = ROW_TILE * 1.6;
  return Math.max(0, 1 - Math.abs(distance) / reach);
}

/**
 * Hold a nav tab to raise a stack of shortcuts, slide the thumb to one, let go.
 *
 * The same gesture as AccountSwitchPad, deliberately: one hold-and-slide idiom
 * across the nav bar rather than two that behave almost alike. Purpose-built
 * rather than extracted from it, because that component's bulk is the account
 * list — a scrolling window over an unbounded set, session switching, a
 * full-screen switch overlay — and none of it applies to four fixed links.
 * Sharing the mechanics would have meant a 500-line refactor of a working
 * interaction to save about eighty lines here.
 *
 * The parts that matter, all learned from that component:
 *
 *  - The trigger captures the pointer on long-press, so pointermove keeps
 *    arriving after the thumb leaves a 48px target — which it does immediately.
 *  - Hit-testing is against measured rects on the Y axis alone. A finger
 *    produces no hover, and thumbs arc sideways as they reach up, so demanding
 *    X containment breaks the top of the stack for the longest reaches.
 *  - A plain tap falls through untouched: if the hold never completes, the
 *    click reaches the link underneath as normal.
 */
export function NavHoldMenu({
  actions,
  label,
  layout = "stack",
  touchAction = "none",
  onArm,
  holdMs = HOLD_MS,
  children,
}: {
  actions: HoldAction[];
  /**
   * How the options are laid out around the trigger.
   *
   * "stack" climbs straight up from a tab on the edge of the bar. "arc" fans
   * across the top of the trigger and is for the CENTRE button, which is the
   * one place with room on both sides — a column there would rise out of the
   * middle of the screen and cover the thing you are creating from.
   *
   * "row" lays the options along one card just above the trigger, starting at
   * its left edge. It is for a trigger in the PAGE rather than the bar: a
   * column there covers the very post you are sharing, and — because a feed
   * card is its own stacking context — anything drawn in place ends up under
   * the veil and gets blurred along with the page. A row is portalled to the
   * body and placed from the trigger's measured position, so it sits over
   * everything, unblurred, wherever the button happens to be.
   *
   * The mechanics below are shared on purpose: the hold, the pointer capture,
   * the detach fallback and the commit were all hard-won once, and a second
   * component would have re-earned the same bugs.
   */
  layout?: "stack" | "arc" | "row";
  /**
   * What the browser may do with a touch that starts on the trigger.
   *
   * "none" is right for the nav bar, which never scrolls: it is read at
   * touchstart, so it cannot be switched on once the hold completes — by then
   * the browser has reserved the gesture for panning. A trigger inside the
   * feed cannot take that: it would leave a strip of the page that does not
   * scroll. Those pass "pan-y" and the menu blocks scrolling itself, but only
   * while it is open (see the effect below).
   */
  touchAction?: "none" | "pan-y";
  /** Names the stack for assistive tech, e.g. "Home shortcuts". */
  label: string;
  /**
   * Fired the instant the tab is touched, before the hold completes.
   *
   * Gives a caller whose actions need fetching the HOLD_MS window to get
   * them, so the stack is populated by the time it appears — without every
   * session paying for a query it may never open.
   */
  onArm?: () => void;
  /** How long the press is held before the menu opens. */
  holdMs?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  /** Pointer was taken away mid-gesture; the stack stays up and is tapped. */
  const [detached, setDetached] = useState(false);
  /**
   * Which side the labels unfurl towards.
   *
   * Measured from the trigger rather than hardcoded: this component hangs off
   * the leftmost tab today, but a menu on a right-hand tab needs the mirror
   * image, and a label that opens into the nearest screen edge is clipped to
   * nothing.
   */
  const [labelSide, setLabelSide] = useState<"left" | "right">("right");
  /**
   * Which way the stack unfurls.
   *
   * Up, unless there is not enough room above the trigger — a share button
   * halfway up the feed has the whole column hanging off the top of the
   * screen. Measured when the hold completes, because it depends on where
   * the page has been scrolled to.
   */
  const [openDir, setOpenDir] = useState<"up" | "down">("up");
  /**
   * Where a row card sits on the screen, measured when the hold completes.
   *
   * A row is portalled, so it cannot be positioned relative to the trigger in
   * CSS. Left edge under the trigger's left edge, pulled back from the screen
   * edge if the card would overhang. "top" is the distance from whichever edge
   * the card hangs off: normally the viewport's bottom, so the card's own
   * bottom lands just above the button whatever height it turns out to be, and
   * the top when there is no room above.
   */
  const [rowPos, setRowPos] = useState<
    { left: number; top: number; below: boolean; tile: number } | null
  >(null);
  /** Row: where the thumb is along the card, for the lens. null off the card. */
  const [rowX, setRowX] = useState<number | null>(null);
  /** Row: the option just picked, showing its check until the card closes. */
  const [sentIdx, setSentIdx] = useState<number | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef(0);
  const startX = useRef(0);
  /** Set once the hold completes, so the trailing click is swallowed. */
  const didHold = useRef(false);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  /**
   * The current options, readable from inside the hold timer.
   *
   * That timer is created when the tab is touched and fires a third of a
   * second later, so the `actions` it closes over are the ones from before
   * onArm fetched anything — which is why a menu whose contents are loaded on
   * demand never opened on the FIRST hold, only on the second, once a
   * previous press had already left them in state.
   */
  const actionsRef = useRef(actions);
  useLayoutEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  // Bottom-of-column is nearest the thumb, so a stack's visual order is the
  // reverse of the caller's priority order. An arc has no near end — every
  // tile is one flick away — so it reads left to right instead. Everything
  // below (hit-testing, the stagger, commit) indexes into THIS list, so they
  // cannot disagree.
  const ordered =
    layout === "arc" || layout === "row" || openDir === "down"
      ? actions
      : [...actions].reverse();

  /**
   * Where each arc tile sits, relative to the trigger's centre.
   *
   * An ellipse rather than a circle, lifted clear of the bar: on a true circle
   * the outermost tiles sit barely above the trigger and collide with the nav,
   * and stretching it sideways is also what gives the fan its shape. Angles
   * run right to left in screen terms because CSS y grows downward.
   */
  function arcPos(i: number, n: number) {
    const RX = 112;
    const RY = 116;
    /** Half a tile, so left/top can centre it without a transform. */
    const HALF = 27;
    const LIFT = 22;
    const FROM = -152;
    const TO = -28;
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = ((FROM + (TO - FROM) * t) * Math.PI) / 180;
    return {
      x: Math.cos(a) * RX - HALF,
      y: Math.sin(a) * RY - LIFT - HALF,
    };
  }

  const close = useCallback(() => {
    if (confirmTimer.current) {
      clearTimeout(confirmTimer.current);
      confirmTimer.current = null;
    }
    setOpen(false);
    setActiveIdx(null);
    setDetached(false);
    setRowX(null);
    setSentIdx(null);
  }, []);
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

  /**
   * Counted as an overlay for as long as it is up.
   *
   * Two things follow from it, and the first is why the app was still live
   * behind the share card. A veil stops the page being TOUCHED, but React
   * routes events through the component tree rather than the DOM one, so a
   * finger on a portalled veil still reaches the handlers of everything this
   * menu is rendered inside — and the menu the share button raises is
   * rendered inside SwipeNav. Sliding the thumb sideways to pick a face was
   * also a sideways drag on the page, which slid the feed under the card and,
   * far enough, changed tab. SwipeNav abandons a drag the moment an overlay
   * appears; it just had to be told this is one.
   *
   * The second is Android's back button, which now closes the menu instead of
   * navigating the page away underneath it.
   */
  useOverlayBackButton(open, close);

  /**
   * Hold the page still while the stack is up.
   *
   * Only for triggers that let the page scroll at rest: with touch-action
   * "pan-y" the browser would take the upward slide as a scroll and cancel
   * the pointer mid-choice. The listener has to be non-passive, which React's
   * own onTouchMove is not, so it is attached by hand — and only while open,
   * so nothing else on the page is affected.
   */
  useEffect(() => {
    if (!open || touchAction === "none") return;
    const stop = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", stop, { passive: false });
    return () => document.removeEventListener("touchmove", stop);
  }, [open, touchAction]);

  // Escape and the Android back button both dismiss before doing anything else.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  /**
   * Which row is under this Y position, or null.
   *
   * Reads the rendered rows straight out of the stack rather than an array
   * kept in sync by ref callbacks. The ref version silently held nothing —
   * every hit-test missed, so sliding highlighted nothing and releasing
   * committed nothing, which is exactly what "can't choose options" looked
   * like. Whatever the cause (inline ref callbacks are re-created and
   * re-invoked on every render, and this list re-renders on every move), the
   * DOM is the thing being pointed at, so asking it directly cannot drift.
   */
  function rowAt(x: number, y: number): number | null {
    const stack = stackRef.current;
    if (!stack) return null;
    const els = stack.querySelectorAll<HTMLElement>('[role="option"]');

    if (layout === "row") {
      // Along the card, and only while the thumb is near it: X alone would
      // mean a small move down — or no move at all — landing on whichever
      // face happens to be above the button, and sending to them. Within the
      // card the nearest face wins, so crossing the gap between two never
      // drops the choice mid-slide.
      const band = stack.getBoundingClientRect();
      if (y < band.top - 56 || y > band.bottom + 56) return null;
      if (x < band.left - 24 || x > band.right + 24) return null;
      let best: number | null = null;
      let bestD = Infinity;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        const d = Math.abs(x - (r.left + r.width / 2));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    if (layout === "arc") {
      // Nearest centre wins, not containment. Tiles on an arc have gaps
      // between them, and a thumb travelling from one to the next crosses
      // those gaps — deselecting mid-slide makes the fan feel broken. The
      // radius is generous for the same reason: the tile you are heading for
      // should light up before you are on top of it.
      const REACH = 74;
      let best: number | null = null;
      let bestD = REACH;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        const dx = x - (r.left + r.width / 2);
        const dy = y - (r.top + r.height / 2);
        const d = Math.hypot(dx, dy);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return best;
    }

    // A stack is a column: the thumb arcs sideways as it reaches up, so
    // demanding X containment breaks the top of the tallest reaches.
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return i;
    }
    return null;
  }

  /** Do whatever this option is: send it somewhere, or go somewhere. */
  function run(action: HoldAction) {
    haptics.tap();
    if (action.onSelect) action.onSelect();
    else if (action.href) router.push(action.href);
  }

  /** Close, and act on the row the thumb was resting on. null just closes. */
  function commit(idx: number | null) {
    if (idx === null) return close();
    const action = ordered[idx];
    if (layout === "row" && action.confirm) {
      // Act now, but keep the card up a beat with a check on the face, so the
      // pick visibly lands before it goes.
      run(action);
      haptics.success();
      setSentIdx(idx);
      setActiveIdx(idx);
      confirmTimer.current = setTimeout(close, CONFIRM_MS);
      return;
    }
    close();
    run(action);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    didHold.current = false;
    onArm?.();
    startY.current = e.clientY;
    startX.current = e.clientX;
    const pid = e.pointerId;

    clearHold();
    if (confirmTimer.current) return;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      // Nothing to raise — let the press behave like a plain tap rather than
      // flashing up an empty panel. The chat stack loads asynchronously, so
      // this is a real state, not a defensive nicety.
      const ready = actionsRef.current;
      if (ready.length === 0) return;
      didHold.current = true;
      const box = triggerRef.current?.getBoundingClientRect();
      if (box) {
        setLabelSide(
          box.left + box.width / 2 < window.innerWidth / 2 ? "right" : "left"
        );
        if (layout === "row") {
          // Tile, gap and the card's own padding: enough to keep it on screen
          // without measuring something that has not been drawn yet.
          // Tiles shrink to fit a narrow screen rather than run off its edge.
          const n = ready.length;
          const tile = Math.min(
            ROW_TILE,
            Math.floor((window.innerWidth - 16 - ROW_PAD * 2 - (n - 1) * ROW_GAP) / n),
          );
          const width = n * tile + (n - 1) * ROW_GAP + ROW_PAD * 2;
          // Card, the name above it, and the 8px it stands off the button.
          const CARD_H = 104;
          const below = box.top < CARD_H + 8;
          setRowPos({
            left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)),
            top: below ? box.bottom + 8 : window.innerHeight - box.top + 8,
            below,
            tile,
          });
        } else {
          // 48px tile + 12px gap each, and a little air above the last one.
          const needed = ready.length * 60 + 24;
          setOpenDir(box.top < needed ? "down" : "up");
        }
      }
      setOpen(true);
      setActiveIdx(null);
      setRowX(null);
      setSentIdx(null);
      haptics.select();
      // Keep receiving moves after the thumb leaves the small tab.
      try {
        triggerRef.current?.setPointerCapture(pid);
      } catch {
        /* capture unsupported — the gesture still works over the tab */
      }
    }, holdMs);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!open) {
      const slop = layout === "row" ? ROW_SLOP_PX : CANCEL_SLOP_PX;
      const moved =
        Math.abs(e.clientY - startY.current) > slop ||
        Math.abs(e.clientX - startX.current) > slop;
      if (moved) clearHold();
      return;
    }
    if (sentIdx !== null) return;
    const hit = rowAt(e.clientX, e.clientY);
    if (layout === "row") setRowX(hit === null ? null : e.clientX);
    if (hit !== activeIdx) {
      setActiveIdx(hit);
      if (hit !== null) haptics.select();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    clearHold();
    try {
      triggerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured */
    }
    if (!open) return;
    // The pointer was already taken away — the stack is being tapped now,
    // so a stray release must not commit or dismiss it.
    if (detached || sentIdx !== null) return;

    // Commits on the row the MOVE handler last landed on, not a fresh
    // hit-test of the release coordinates. After a capture those can be
    // stale or outside every row, which is how a deliberate pick ended up
    // committing nothing.
    commit(activeIdx);
  }
  /**
   * A row, drawn over the page rather than inside it.
   *
   * Both halves go to the body: the veil first, then the card, so the card is
   * above it and stays sharp — drawn in place, the feed card's own stacking
   * context capped the tiles below the veil and blurred the very faces being
   * chosen.
   */
  const rowMenu =
    open && layout === "row" && typeof document !== "undefined"
      ? createPortal(
          <>
            {/* Takes every touch that is not on the card — nothing behind it
                can be scrolled, tapped or held while this is up — and closes
                on one. Lighter than the nav's veil and not blurred: this one
                sits a finger's width from what you are sharing, and dimming
                the post into the dark made the card feel like a different
                screen rather than something the button opened. */}
            <div
              data-hold-veil=""
              className="animate-switch-veil fixed inset-0 z-[200] bg-black/25"
              aria-hidden
              style={{ touchAction: "none" }}
              onPointerDown={close}
            />
            <div
              className="fixed z-[201]"
              style={{
                left: rowPos?.left ?? 8,
                // Anchored by the edge nearest the button, so the gap between
                // the two is the 8px below and nothing else — measuring the
                // card's height to place its top left a hole the thumb had to
                // cross.
                ...(rowPos?.below
                  ? { top: rowPos.top }
                  : { bottom: rowPos ? rowPos.top : 8 }),
                opacity: rowPos ? 1 : 0,
              }}
            >
              <RowCard
                stackRef={stackRef}
                label={label}
                options={ordered}
                activeIdx={activeIdx}
                sentIdx={sentIdx}
                rowX={rowX}
                tile={rowPos?.tile ?? ROW_TILE}
                detached={detached}
                onHover={(i) => setActiveIdx(i)}
                onTap={(action, i) => {
                  if (action.confirm) {
                    run(action);
                    haptics.success();
                    setSentIdx(i);
                    setActiveIdx(i);
                    confirmTimer.current = setTimeout(close, CONFIRM_MS);
                  } else {
                    close();
                    run(action);
                  }
                }}
              />
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div className="relative flex items-center justify-center">
      {rowMenu}
      {open && layout !== "row" && (
        <>
          {/* Portalled because the nav carries backdrop-blur, which makes it
              the containing block for fixed children — rendered in place this
              dimmed the tab bar and nothing else.

              z-25 puts it UNDER the nav (z-30). The tiles live inside the nav,
              and the nav is its own stacking context, so their z-50 is capped
              at 30 against the root: a veil at z-40 sits ON TOP of them and
              blurs the very options being chosen. AccountSwitchPad documents
              this exact trap and I walked into it anyway — hence the identical
              value here rather than a fresh guess. */}
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
            ref={stackRef}
            className={
              layout === "arc"
                ? // A zero-size anchor at the trigger's centre; every tile is
                  // placed from there, so the fan is symmetric about the
                  // button no matter how wide the bar is.
                  "absolute left-1/2 top-1/2 z-50 h-0 w-0"
                : `absolute left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-3 ${
                    openDir === "down"
                      ? "top-[calc(100%+14px)]"
                      : "bottom-[calc(100%+14px)]"
                  }`
            }
            role="listbox"
            aria-label={label}
          >
            {/* Rendered in REVERSE, matching AccountSwitchPad: the stack grows
                upward from a tab on the bottom edge, so "first" has to mean
                "nearest the thumb", which is the bottom of the column. Left in
                source order, actions[0] landed furthest away — the longest
                reach for the item that most deserves the shortest. */}
            {ordered.map((action, i) => {
              const active = i === activeIdx;
              const Icon = action.icon;
              return (
                <div
                  key={action.key ?? action.href ?? action.label}
                  role="option"
                  aria-selected={active}
                  onPointerEnter={detached ? () => setActiveIdx(i) : undefined}
                  onPointerDown={
                    detached
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          close();
                          run(action);
                        }
                      : undefined
                  }
                  className={
                    layout === "arc"
                      ? "absolute"
                      : `relative flex items-center ${
                          labelSide === "right"
                            ? "justify-start"
                            : "justify-end"
                        }`
                  }
                  style={
                    layout === "arc"
                      ? ({
                          left: arcPos(i, ordered.length).x,
                          top: arcPos(i, ordered.length).y,
                          // Centred by offsetting left/top, NOT by a
                          // translate: switch-rise animates `transform`, and a
                          // transform in an animation replaces the element's
                          // own outright. Centring there put every tile half a
                          // tile down and to the right for the length of the
                          // animation — and permanently, on any surface that
                          // pauses animations (a hidden tab does exactly
                          // that). Offsets cannot be overridden by a keyframe.
                          // Each tile flies out of the (+) along its own
                          // radius, so the fan opens FROM the thing you are
                          // holding. switch-rise nudged everything 14px
                          // upward instead, which is the same motion whatever
                          // the layout — fine for a column, and the reason
                          // this arc felt like four squares appearing rather
                          // than one control unfolding.
                          //
                          // The offsets are handed to the keyframes as custom
                          // properties because each tile travels a different
                          // way; the keyframe itself stays one rule.
                          ["--dx"]: `${-arcPos(i, ordered.length).x - 27}px`,
                          ["--dy"]: `${-arcPos(i, ordered.length).y - 27}px`,
                          animation: `arc-fan 340ms cubic-bezier(0.2,1.12,0.4,1) ${
                            Math.abs(i - (ordered.length - 1) / 2) * 40
                          }ms backwards`,
                        } as React.CSSProperties)
                      : ({
                          // Stagger outwards from the thumb, so the stack
                          // unfurls away from the finger rather than at it.
                          animation: `switch-rise 260ms cubic-bezier(0.16,1,0.3,1) ${
                            (actions.length - 1 - i) * 38
                          }ms backwards`,
                        } as React.CSSProperties)
                  }
                >
                  {/* Label slides out from behind the tile, away from the
                      screen edge, and only for the row under the thumb.

                      Which side is not a style choice. This menu hangs off the
                      LEFTMOST tab, so a label sliding left — the direction
                      AccountSwitchPad uses, because it hangs off the RIGHTMOST
                      tab — runs straight into the edge of the screen and gets
                      clipped to nothing. The side is picked from where the
                      trigger actually sits (see labelSide).

                      Clipped rather than faded: the wrapper's inner edge meets
                      the tile's, so a parked label is invisible without ever
                      being transparent. Padding on three sides gives the shadow
                      room — overflow clips at the padding box, so only the
                      un-padded inner edge cuts. */}
                  {layout === "stack" && (
                    <span
                      className={`pointer-events-none absolute overflow-hidden py-2 ${
                        labelSide === "right"
                          ? "left-full pr-3"
                          : "right-full pl-3"
                      }`}
                    >
                      <span
                        className="block max-w-[42vw] truncate whitespace-nowrap rounded-lg bg-elevated px-2.5 py-1 text-[13px] font-bold text-foreground shadow-lg ring-1 ring-border"
                        style={{
                          // Parked: its own width plus the gap, which puts it
                          // wholly past the clip edge and under the tile.
                          transform: active
                            ? "translate3d(0,0,0)"
                            : labelSide === "right"
                            ? "translate3d(calc(-100% - 10px), 0, 0)"
                            : "translate3d(calc(100% + 10px), 0, 0)",
                          [labelSide === "right"
                            ? "marginLeft"
                            : "marginRight"]: 10,
                          transition:
                            "transform 260ms cubic-bezier(0.16,1,0.3,1)",
                        }}
                      >
                        {action.label}
                      </span>
                    </span>
                  )}

                  <div
                    className={`transition-transform duration-200 ease-out ${
                      active
                        ? layout === "arc"
                          ? "scale-[1.18]"
                          : labelSide === "right"
                          ? "translate-x-2.5 scale-110"
                          : "-translate-x-2.5 scale-110"
                        : "scale-100"
                    }`}
                  >
                    <span
                      className={`relative flex items-center justify-center overflow-visible border-2 transition-[background-color,border-color,box-shadow,color] duration-200 ${
                        layout === "arc"
                          ? "h-[54px] w-[54px] rounded-[18px]"
                          : "h-12 w-12 rounded-[16px]"
                      } ${
                        // The same treatment on both layouts: outlined at
                        // rest, and a stroke plus a wash when chosen.
                        //
                        // The arc used to fill solid — a whole lime or red
                        // tile under your thumb. It was loud in a way the
                        // Home stack never is, and with four of them fanned
                        // out the screen turned into a block of colour. The
                        // stroke is enough to say "this one", and it leaves
                        // the icon legible instead of knocking it out.
                        !active
                          ? "border-border bg-surface/95 text-foreground"
                          : action.tone === "danger"
                          ? "border-danger bg-danger/15 text-danger"
                          : "border-accent bg-accent/15 text-accent"
                      }`}
                    >
                      {action.avatar ? (
                        <Avatar
                          name={action.avatar.name}
                          hue={action.avatar.hue}
                          src={action.avatar.src ?? undefined}
                          size={38}
                          className="rounded-[12px]"
                        />
                      ) : Icon ? (
                        <Icon size={layout === "arc" ? 24 : 21} />
                      ) : null}
                      {action.tone === "danger" && (
                        // Live is the one option other people see the moment
                        // you let go, so it carries a mark at rest as well as
                        // when chosen — it stays visible either way now that
                        // selection is a stroke rather than a fill.
                        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />
                      )}
                      {!!action.unread && (
                        // A bare dot said "something happened" and stopped
                        // there, which is the one thing you already knew.
                        // Capped at 5+ because past five the exact number
                        // stops changing what you do about it — and a
                        // three-digit count would not fit the corner of a
                        // 48px tile anyway.
                        <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-black leading-none text-accent-ink ring-2 ring-background">
                          {action.unread > 5 ? "5+" : action.unread}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}

            {layout === "arc" && (
              // One caption for the whole fan instead of a label per tile.
              // Four labels around an arc collide with each other and with the
              // tiles; one line above the fan, where your eye already is, says
              // the same thing without the clutter — and it is the only text
              // on screen, so it cannot be misread.
              <span
                aria-hidden
                // A fixed-width centring track, so the pill inside can shrink
                // to its own text. Centring the pill itself with a translate
                // is not available here — switch-rise owns `transform` on
                // this subtree, and a scale on the pill would fight it.
                className="pointer-events-none absolute flex justify-center"
                style={{ left: 0, top: -198, marginLeft: -90, width: 180 }}
              >
                <span
                  className="whitespace-nowrap rounded-full bg-elevated px-3 py-1.5 text-[13px] font-bold text-foreground shadow-lg ring-1 ring-border"
                  style={{
                    opacity: activeIdx === null ? 0 : 1,
                    transform: `scale(${activeIdx === null ? 0.92 : 1})`,
                    transition:
                      "opacity 160ms ease-out, transform 220ms cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  {activeIdx === null ? "\u00a0" : ordered[activeIdx].label}
                </span>
              </span>
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
          clearHold();
          // Deliberately does NOT close. Some WebViews cancel the pointer even
          // with touch-action: none, and dropping the stack here is what makes
          // it flash up and vanish. Fall back to tap-to-choose.
          if (open) {
            setDetached(true);
            setActiveIdx(null);
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
        // The single most important line here, and the one this component
        // shipped without. touch-action is read at TOUCHSTART, so it cannot be
        // switched on once the hold completes — by then the browser has
        // reserved the gesture for panning and cancels the pointer the moment
        // the thumb moves. That is why releasing did not close the menu (no
        // pointerup ever arrived) and why sliding could not pick anything (no
        // pointermove either). It has to be "none" from the first contact.
        // A long-press on a link or image also raises the WebView's own
        // callout, which cancels the pointer too; hence the rest.
        style={{
          touchAction,
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
 * The row card: faces along one line that swell under the thumb like the
 * Dock, the name of the one you are on floating over it, and a check on the
 * one you let go on.
 */
function RowCard({
  stackRef,
  label,
  options,
  activeIdx,
  sentIdx,
  rowX,
  tile,
  detached,
  onHover,
  onTap,
}: {
  stackRef: React.MutableRefObject<HTMLDivElement | null>;
  label: string;
  options: HoldAction[];
  activeIdx: number | null;
  sentIdx: number | null;
  rowX: number | null;
  /** Tile size, shrunk from ROW_TILE when the screen is too narrow. */
  tile: number;
  detached: boolean;
  onHover: (i: number) => void;
  onTap: (action: HoldAction, i: number) => void;
}) {
  // Tile centres along the card, measured once it is laid out: the lens reads
  // them against the thumb, and the name floats over the active one.
  const [centres, setCentres] = useState<number[]>([]);
  const [cardLeft, setCardLeft] = useState(0);
  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;
    const els = stack.querySelectorAll<HTMLElement>('[role="option"]');
    setCardLeft(stack.getBoundingClientRect().left);
    setCentres(Array.from(els, (el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    }));
  }, [options.length, stackRef, tile]);

  const active = activeIdx === null ? null : options[activeIdx];
  const nameLeft = activeIdx !== null && centres[activeIdx] !== undefined ? centres[activeIdx] - cardLeft : null;

  return (
    <div className="relative pt-9">
      {/* The name over the face under the thumb, or what to do before there is one. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 whitespace-nowrap rounded-full bg-elevated px-2.5 py-1 text-[12px] font-bold text-foreground shadow-lg ring-1 ring-border transition-[left,transform,opacity] duration-150 ease-out"
        style={
          nameLeft === null
            ? { left: 8, transform: "translateX(0)", opacity: 1 }
            : { left: nameLeft, transform: "translateX(-50%)", opacity: 1 }
        }
      >
        {sentIdx !== null && active
          ? `Sent to ${active.label}`
          : active
            ? active.label
            : <span className="font-semibold text-muted">Slide to a friend</span>}
      </span>
      <div
        ref={stackRef}
        role="listbox"
        aria-label={label}
        className="flex items-end rounded-[20px] border border-white/10 bg-elevated/95 shadow-2xl backdrop-blur-xl"
        style={{ gap: ROW_GAP, padding: ROW_PAD }}
      >
        {options.map((action, i) => {
          const isActive = i === activeIdx;
          const isSent = i === sentIdx;
          const lens = rowX === null || centres[i] === undefined ? 0 : rowLens(rowX - centres[i]);
          const Icon = action.icon;
          return (
            <div
              key={action.key ?? action.href ?? action.label}
              role="option"
              aria-selected={isActive}
              onPointerEnter={detached ? () => onHover(i) : undefined}
              onPointerDown={
                detached
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTap(action, i);
                    }
                  : undefined
              }
              style={{
                // The swollen, chosen face sits over its neighbours, check and all.
                position: "relative",
                zIndex: isActive || isSent ? 2 : 1,
                width: tile,
                height: tile,
                animation: `switch-rise 240ms cubic-bezier(0.16,1,0.3,1) ${i * 30}ms backwards`,
              }}
            >
              <div
                className="relative h-full w-full"
                style={{
                  transform: `translateY(${-lens * 10}px) scale(${1 + lens * 0.28})`,
                  transformOrigin: "50% 100%",
                  transition: "transform 120ms ease-out",
                }}
              >
                <span
                  className={`flex h-full w-full items-center justify-center overflow-hidden rounded-[16px] border-2 transition-[border-color,background-color] duration-150 ${
                    isActive || isSent ? "border-accent bg-accent/15 text-accent" : "border-transparent bg-surface text-foreground"
                  }`}
                >
                  {action.avatar ? (
                    <Avatar
                      name={action.avatar.name}
                      hue={action.avatar.hue}
                      src={action.avatar.src ?? undefined}
                      size={tile - 8}
                      className="rounded-[12px]"
                    />
                  ) : Icon ? (
                    <Icon size={22} />
                  ) : null}
                </span>
                {isSent && (
                  <span className="animate-react-pop absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink ring-2 ring-elevated">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12.5l4.5 4.5L19 7" />
                    </svg>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
