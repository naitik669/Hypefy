import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EDIT_WINDOW_MS,
  SWIPE_MAX_PX,
  SWIPE_SLOP_PX,
  SWIPE_TRIGGER_PX,
  canEdit,
  editTimeLeft,
  editableKind,
  swipeAction,
  swipeLabel,
  swipeTravel,
} from "../src/lib/chat-gestures";

/**
 * Swiping a message.
 *
 *            your own                 theirs
 *   right    reply                    forward
 *   left     edit (45 minutes)        reply
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

const NOW = Date.UTC(2026, 9, 28, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60 * 1000;

const msg = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  sender_id: "me",
  kind: "text",
  created_at: ago(MIN),
  is_unsent: false,
  ...over,
});

describe("your own message", () => {
  it("swipe right replies", () => {
    expect(swipeAction(msg(), "me", "right", NOW)).toBe("reply");
  });

  it("swipe left edits, inside the window", () => {
    expect(swipeAction(msg(), "me", "left", NOW)).toBe("edit");
    expect(swipeAction(msg({ created_at: ago(44 * MIN) }), "me", "left", NOW)).toBe("edit");
  });

  it("and does nothing once the 45 minutes are up", () => {
    // Not "replies instead": a gesture that changes meaning with the clock
    // is worse than one that stops.
    expect(swipeAction(msg({ created_at: ago(46 * MIN) }), "me", "left", NOW)).toBe(null);
    expect(swipeAction(msg({ created_at: ago(46 * MIN) }), "me", "right", NOW)).toBe("reply");
  });

  it("the window is 45 minutes, measured from when it was sent", () => {
    expect(EDIT_WINDOW_MS).toBe(45 * 60 * 1000);
    expect(editTimeLeft(ago(44 * MIN), NOW)).toBeGreaterThan(0);
    expect(editTimeLeft(ago(45 * MIN), NOW)).toBe(0);
    // Never negative, so nothing downstream has to guard the sign.
    expect(editTimeLeft(ago(500 * MIN), NOW)).toBe(0);
    expect(editTimeLeft("not a date", NOW)).toBe(0);
  });

  it("a photo, a voice note or a poll of yours cannot be edited", () => {
    // Only the kinds the server will actually rewrite.
    expect(editableKind("text")).toBe(true);
    expect(editableKind("album")).toBe(true);
    for (const kind of ["image", "video", "voice", "poll", "gif", "document", "post", "shot"]) {
      expect(editableKind(kind)).toBe(false);
      expect(swipeAction(msg({ kind }), "me", "left", NOW)).toBe(null);
    }
  });

  it("but an album's caption can", () => {
    expect(swipeAction(msg({ kind: "album" }), "me", "left", NOW)).toBe("edit");
  });
});

describe("a message you received", () => {
  const theirs = (over: Record<string, unknown> = {}) => msg({ sender_id: "them", ...over });

  it("swipe left replies — the mirror of your own", () => {
    expect(swipeAction(theirs(), "me", "left", NOW)).toBe("reply");
  });

  it("and so does swipe right — either way, on anybody else's message", () => {
    // Forwarding used to sit on this side, which made the gesture
    // something you had to aim: the thing you nearly always want was on
    // one half only, and missing it sent the message to somebody instead
    // of quoting them.
    expect(swipeAction(theirs(), "me", "right", NOW)).toBe("reply");
  });

  it("and nothing about it is editable, however new it is", () => {
    expect(canEdit(theirs(), "me", NOW)).toBe(false);
    expect(canEdit(theirs({ created_at: ago(1) }), "me", NOW)).toBe(false);
  });

  it("a view-once photo answers both ways too", () => {
    // It used to refuse a right swipe, because that meant forward and
    // send_message rejects a oneshot with no storage path. Replying to
    // one was always allowed on the other side, so now both agree.
    expect(swipeAction(theirs({ kind: "oneshot" }), "me", "right", NOW)).toBe("reply");
    expect(swipeAction(theirs({ kind: "oneshot" }), "me", "left", NOW)).toBe("reply");
  });

  it("there is no half of a received message that does anything else", () => {
    // The property, rather than two examples of it: whatever the kind,
    // neither direction can produce anything but a reply.
    for (const kind of ["text", "image", "video", "album", "voice", "document", "gif", "poll", "post", "shot", "oneshot"]) {
      for (const d of ["left", "right"] as const) {
        expect(swipeAction(theirs({ kind }), "me", d, NOW)).toBe("reply");
      }
    }
  });
});

describe("messages that take no gesture at all", () => {
  it("an unsent one", () => {
    for (const d of ["left", "right"] as const) {
      expect(swipeAction(msg({ is_unsent: true }), "me", d, NOW)).toBe(null);
      expect(swipeAction(msg({ sender_id: "them", is_unsent: true }), "me", d, NOW)).toBe(null);
    }
  });

  it("a system notice, which nobody said", () => {
    for (const d of ["left", "right"] as const) {
      expect(swipeAction(msg({ kind: "system" }), "me", d, NOW)).toBe(null);
    }
  });

  it("and one still on its way", () => {
    // reply_to_id would point at an id that exists only on this device.
    for (const d of ["left", "right"] as const) {
      expect(swipeAction(msg({ id: "temp-1759" }), "me", d, NOW)).toBe(null);
    }
    expect(canEdit(msg({ id: "temp-1759" }), "me", NOW)).toBe(false);
  });
});

describe("attachments swipe like anything else", () => {
  const chat = read("src/components/messages/RealChatView.tsx");

  it("a photo, a folder, a voice note, a document, a poll and a shared post all answer", () => {
    // Nothing about the gesture is gated on the body being words.
    for (const kind of ["image", "video", "album", "voice", "document", "gif", "poll", "post", "shot"]) {
      expect(swipeAction(msg({ kind, sender_id: "them" }), "me", "left", NOW)).toBe("reply");
      expect(swipeAction(msg({ kind, sender_id: "them" }), "me", "right", NOW)).toBe("reply");
      expect(swipeAction(msg({ kind }), "me", "right", NOW)).toBe("reply");
    }
  });

  it("because the swipe wraps the row, not the text bubble", () => {
    // Every kind is rendered inside this one container. If the wrapper
    // ever moved inside a branch, only that kind would swipe.
    const open = chat.indexOf("<SwipeRow");
    const close = chat.indexOf("</SwipeRow>");
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    const inside = chat.slice(open, close);
    for (const branch of [
      'm.kind === "album" && albumOf(m) ?',
      'm.kind === "voice" && m.body ?',
      "readPoll(m) ?",
    ]) {
      expect(inside).toContain(branch);
    }
  });

  it("and nothing in the thread takes the horizontal gesture away from it", () => {
    // A scrubber or a pager that claimed the drag would make the swipe
    // work everywhere except on the bubbles people share most.
    const voice = read("src/components/messages/VoiceMessage.tsx");
    expect(voice).not.toContain("onPointerMove");
    // The folder's touch-action: none belongs to the full-screen viewer,
    // which is a portal and not in the thread at all.
    const folder = read("src/components/messages/MediaFolder.tsx");
    const guard = folder.slice(0, folder.indexOf('style={{ touchAction: "none" }}'));
    expect(guard).toContain("createPortal(");
  });
});

describe("the distances", () => {
  it("the trigger is reachable but not accidental, and travel is capped", () => {
    expect(SWIPE_SLOP_PX).toBeGreaterThan(0);
    expect(SWIPE_SLOP_PX).toBeLessThan(SWIPE_TRIGGER_PX);
    expect(SWIPE_TRIGGER_PX).toBeLessThan(SWIPE_MAX_PX);
    expect(SWIPE_MAX_PX).toBeLessThanOrEqual(120);
  });

  it("every action has words for the screen reader", () => {
    expect(swipeLabel("reply")).toBe("Reply");
    expect(swipeLabel("edit")).toBe("Edit");
  });

  it("and forwarding is not one of them, but is still reachable", () => {
    // It left the gesture, not the app: the hold menu still offers it,
    // where it cannot be reached by a thumb going the wrong way.
    const gestures = read("src/lib/chat-gestures.ts");
    expect(gestures).not.toContain('"forward"');
    expect(read("src/components/messages/RealChatView.tsx")).toContain('label="Forward"');
  });
});

describe("the gesture itself", () => {
  const row = read("src/components/messages/SwipeRow.tsx");

  it("the thread scrolls first: the swipe is claimed only when it is sideways", () => {
    // Both halves matter — the slop stops a tap counting, the comparison
    // leaves vertical scrolling alone.
    expect(row).toContain("if (Math.abs(dx) < SWIPE_SLOP_PX || Math.abs(dx) <= Math.abs(dy)) return;");
    expect(row).toContain('touchAction: "pan-y"');
  });

  it("a row with nothing to do does not move", () => {
    const claim = row.slice(row.indexOf("if (!claimed.current) {"));
    expect(claim.slice(0, 700)).toContain("if (!next) {");
    expect(claim.slice(0, 700)).toContain("start.current = null;");
  });

  it("only transform and opacity, never clip-path", () => {
    // clip-path is not composited in Android's WebView, so a reveal drawn
    // by clipping repaints the whole row every frame.
    expect(strip(row)).not.toContain("clip-path");
    expect(strip(row)).not.toContain("clipPath");
    expect(row).toContain("translate3d(");
  });

  it("letting go short of the trigger does nothing", () => {
    expect(row).toContain("const far = Math.abs(offset.current) >= SWIPE_TRIGGER_PX;");
    expect(row).toContain("if (far && chosen) onAction(chosen);");
  });

  it("the action is read from a ref, so a fast flick still fires", () => {
    // It was read out of React state set during the move. A swipe quick
    // enough to claim and release inside one tick found it still empty and
    // did nothing — the faster you swiped, the more often reply dropped.
    expect(row).toContain("const action = useRef<SwipeAction | null>(null);");
    expect(row).toContain("const chosen = action.current;");
    const up = row.slice(row.indexOf("function onPointerUp()"));
    expect(up.slice(0, up.indexOf("return ("))).not.toContain("showing");
  });

  it("the drag writes to the node, not through a render", () => {
    // A re-render on the frame the swipe is claimed is a hitch exactly
    // where the movement starts, which is the part a finger notices.
    expect(row).toContain("requestAnimationFrame(");
    // One write per frame however many pointer events arrive: without the
    // guard a finger that outpaces the display queues a frame per event.
    const sched = row.slice(row.indexOf("function schedule()"));
    expect(sched.slice(0, 120)).toContain("if (frame.current) return;");
    const move = row.slice(row.indexOf("function onPointerMove"));
    const body = move.slice(0, move.indexOf("function onPointerUp"));
    // One setState in the whole drag: the glyph, once, at the claim.
    expect(body.match(/setShowing\(/g)).toHaveLength(1);
    expect(body).not.toContain("setShowing(null)");
  });

  it("the row is promoted for the gesture and let go afterwards", () => {
    // A layer kept on every row of a long thread is memory nobody asked
    // for; promoted only while something is actually moving.
    expect(row).toContain('el.style.willChange = "transform";');
    expect(row).toContain('if (slider.current === el) el.style.willChange = "";');
  });

  it("and the transition is set once, not on every frame", () => {
    const move = row.slice(row.indexOf("function onPointerMove"));
    const body = move.slice(0, move.indexOf("function onPointerUp"));
    // Both nodes are set at the claim — the bubble and its mark — and
    // neither is touched again while the finger moves. What matters is the
    // per-frame work, so that is what is counted: the frame callback must
    // not write a transition at all.
    expect(body).toContain('el.style.transition = "none";');
    // The arrow keeps one transition of its own — its colour, which
    // changes twice in a gesture, not sixty times a second.
    expect(body).toContain("if (g) g.style.transition = GLYPH_EASE;");
    const paint = row.slice(row.indexOf("function schedule()"), row.indexOf("function settle()"));
    expect(paint).not.toContain("style.transition");
  });

  it("nothing but transform and opacity is written while the finger moves", () => {
    // This is the whole of why the old one was choppy. It lerped the
    // mark's background and its arrow colour on every frame, and colour
    // is a paint: sixty repaints a second for a change nobody could name.
    // Only the two properties the compositor can carry belong in here.
    const paint = row.slice(row.indexOf("function schedule()"), row.indexOf("function settle()"));
    const writes = [...paint.matchAll(/\.style\.([A-Za-z]+)\s*=/g)].map((m) => m[1]);
    expect([...new Set(writes)].sort()).toEqual(["opacity", "transform"]);
  });

  it("the arrow arrives by moving, not by growing", () => {
    // It slides in from the edge the bubble is leaving, at the rate the
    // finger sets, so the mark is already legible before it lands.
    const paint = row.slice(row.indexOf("function schedule()"), row.indexOf("function settle()"));
    expect(paint).toContain("(1 - reach) * (side.current === \"left\" ? -ARROW_TRAVEL_PX : ARROW_TRAVEL_PX)");
    expect(paint).toContain("g.style.transform = \`translate3d(\${out}px, 0, 0)\`;");
    expect(paint).not.toContain("scale(");
  });

  it("and the plate grows behind it only once the swipe is far enough", () => {
    // The plate is the answer to "would letting go do anything", so it is
    // a state rather than a ramp — written when the gesture crosses the
    // line, and never in the frame callback.
    const arm = row.slice(row.indexOf("function setArmed"), row.indexOf("/** One write per frame"));
    expect(arm).toContain('p.style.transform = on ? "scale(1)" : "scale(0.2)";');
    expect(arm).toContain('p.style.opacity = on ? "1" : "0";');
    const paint = row.slice(row.indexOf("function schedule()"), row.indexOf("function settle()"));
    expect(paint).not.toContain("plate.current");
  });

  it("the plate is a squircle in the brand's own lime", () => {
    // The same corner the avatars and the music case use, so the mark
    // belongs to Hypefy rather than to the gesture; and the colour is the
    // token, so a change to the brand reaches the gesture without anybody
    // remembering this file.
    expect(row).toContain("rounded-[32%]");
    expect(row).toContain('backgroundColor: "var(--color-accent)"');
  });

  it("and the arrow turns deep-lime on it, in one write rather than per frame", () => {
    const arm = row.slice(row.indexOf("function setArmed"), row.indexOf("/** One write per frame"));
    expect(arm).toContain('g.style.color = on ? "var(--color-accent-deep)" : "#ffffff";');
  });

  it("the mark leaves the way it came, and a second swipe is not tidied away by the first", () => {
    expect(row).toContain("const mine = ++gen.current;");
    expect(row).toContain("if (gen.current === mine) setShowing(null);");
  });

  it("one tick when it becomes a real swipe, not one per wobble", () => {
    // Crossing the line in either direction is one write; staying on one
    // side of it is none.
    expect(row).toContain("if (far !== armed.current) {");
    expect(row).toContain("armed.current = far;");
    expect(row).toContain("if (far && typeof navigator !== \"undefined\" && navigator.vibrate)");
  });

  it("a claimed swipe cancels the long-press", () => {
    // Otherwise the hold menu opens under a moving bubble.
    expect(row).toContain("onClaim();");
    expect(read("src/components/messages/RealChatView.tsx")).toContain("onClaim={onPressEnd}");
  });

  it("and the restore respects reduced motion", () => {
    expect(row).toContain("el.style.transition = reducedMotion()");
  });
});

describe("the edit window is the server's rule, not the gesture's", () => {
  const sql = strip(read("supabase/migrations/0175_edit_window.sql"));
  const chat = read("src/components/messages/RealChatView.tsx");

  it("edit_message refuses anything older than 45 minutes", () => {
    // Scoped to this function's own body. A file-wide search passed on the
    // album function's copy of the clause even with this one deleted.
    const fn = sql.slice(
      sql.indexOf("function public.edit_message"),
      sql.indexOf("function public.edit_album_caption"),
    );
    expect(fn).toContain("and created_at > now() - interval '45 minutes'");
    // Measured from created_at, not edited_at: otherwise a message could be
    // kept alive for ever by editing it every 44 minutes.
    expect(sql).not.toContain("edited_at > now() -");
  });

  it("the album caption gets the same window, so the two cannot disagree", () => {
    const album = sql.slice(sql.indexOf("edit_album_caption"));
    expect(album).toContain("and created_at > now() - interval '45 minutes'");
  });

  it("and a refused edit says so instead of looking like a success", () => {
    // It was a bare UPDATE with no row count checked, so editing somebody
    // else's message returned void and the client showed the new words.
    expect(sql).toContain("if v_id is null then");
    expect(sql).toContain("raise exception 'That message can no longer be edited'");
  });

  it("one function holds the rule, and both the menu and the swipe go through it", () => {
    expect(chat).toContain("function startEdit(m: ChatMsg) {");
    const fn = chat.slice(chat.indexOf("function startEdit(m: ChatMsg) {"));
    expect(fn.slice(0, 500)).toContain("if (!canEdit(m, currentUserId, Date.now())) {");
    expect(chat).toContain("startEdit(m);");
    expect(chat).toContain("startEdit(menu.msg);");
  });

  it("the menu stops offering Edit once the window has closed", () => {
    expect(chat).toContain('{canEdit(menu.msg, currentUserId, menu.at) && menu.msg.kind === "text" && (');
    expect(chat).toContain('{canEdit(menu.msg, currentUserId, menu.at) && menu.msg.kind === "album" && (');
  });

  it("and the clock is read when the menu opens, not while rendering", () => {
    expect(chat).toContain("setMenuState(next ? { ...next, at: Date.now() } : null);");
  });
});

describe("how far the bubble moves for a finger that has moved dx", () => {
  it("is under the finger, right up to the trigger", () => {
    // The line this replaced was min(TRIGGER + over / 3, MAX), which
    // cannot return less than TRIGGER. So from the moment the gesture was
    // claimed — twelve pixels — the bubble jumped the whole fifty-six and
    // the swipe already counted as complete. A snap, then a dead stretch
    // where the finger moved and nothing did. That was the chop.
    expect(swipeTravel(0)).toBe(0);
    expect(swipeTravel(12)).toBe(12);
    expect(swipeTravel(30)).toBe(30);
    expect(swipeTravel(55)).toBe(55);
    expect(swipeTravel(SWIPE_TRIGGER_PX)).toBe(SWIPE_TRIGGER_PX);
  });

  it("and nothing short of the trigger ever counts as a complete swipe", () => {
    // The property the old formula broke, stated directly.
    for (let dx = 0; dx < SWIPE_TRIGGER_PX; dx += 1) {
      expect(swipeTravel(dx)).toBeLessThan(SWIPE_TRIGGER_PX);
    }
  });

  it("past it, it gives at a third of the speed", () => {
    // Felt as resistance rather than as a wall.
    expect(swipeTravel(SWIPE_TRIGGER_PX + 30)).toBeCloseTo(SWIPE_TRIGGER_PX + 10, 5);
    expect(swipeTravel(SWIPE_TRIGGER_PX + 3)).toBeCloseTo(SWIPE_TRIGGER_PX + 1, 5);
  });

  it("and stops, however hard it is pulled", () => {
    expect(swipeTravel(200)).toBe(SWIPE_MAX_PX);
    expect(swipeTravel(10_000)).toBe(SWIPE_MAX_PX);
  });

  it("it never goes backwards as the finger goes further", () => {
    let last = -1;
    for (let dx = 0; dx <= 300; dx += 1) {
      const t = swipeTravel(dx);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it("a finger that has not moved, or has gone the other way, moves nothing", () => {
    // The caller owns the direction and hands over a distance.
    expect(swipeTravel(-40)).toBe(0);
  });

  it("and the row uses it rather than keeping its own copy", () => {
    const row = read("src/components/messages/SwipeRow.tsx");
    expect(row).toContain("const travel = swipeTravel(Math.abs(dx));");
    expect(row).not.toContain("SWIPE_TRIGGER_PX + over / 3");
  });
});
