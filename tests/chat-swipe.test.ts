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

  it("swipe right forwards", () => {
    expect(swipeAction(theirs(), "me", "right", NOW)).toBe("forward");
  });

  it("and nothing about it is editable, however new it is", () => {
    expect(canEdit(theirs(), "me", NOW)).toBe(false);
    expect(canEdit(theirs({ created_at: ago(1) }), "me", NOW)).toBe(false);
  });

  it("a view-once photo is not forwardable", () => {
    // send_message refuses a oneshot with no storage path, so the gesture
    // would only ever fail.
    expect(swipeAction(theirs({ kind: "oneshot" }), "me", "right", NOW)).toBe(null);
    expect(swipeAction(theirs({ kind: "oneshot" }), "me", "left", NOW)).toBe("reply");
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
    expect(swipeLabel("forward")).toBe("Forward");
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
    expect(claim.slice(0, 700)).toContain("if (!action) {");
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
    expect(row).toContain("if (far && action) {");
  });

  it("a claimed swipe cancels the long-press", () => {
    // Otherwise the hold menu opens under a moving bubble.
    expect(row).toContain("onClaim();");
    expect(read("src/components/messages/RealChatView.tsx")).toContain("onClaim={onPressEnd}");
  });

  it("and the restore respects reduced motion", () => {
    expect(row).toContain("paint(0, !reducedMotion());");
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
