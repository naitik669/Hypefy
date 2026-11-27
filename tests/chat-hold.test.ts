import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { HOLD_SLOP_PX, SWIPE_SLOP_PX, contextMenuOpensHold, holdMoved } from "../src/lib/chat-gestures";

/**
 * Holding a message (27 Nov 2026).
 *
 * Two defects Naitik hit on attachments:
 *  1. A swipe opened the hold menu. Every row also opened the menu from the
 *     browser's `contextmenu` event, which Android fires on a long touch
 *     whatever the gesture became. Touch now holds only through the timer;
 *     `contextmenu` opens the menu for a mouse (right-click) alone.
 *  2. The timer was cancelled by ANY pointermove, so a still finger's 1px
 *     jitter killed it and `contextmenu` opened the menu later instead. It
 *     now survives movement under HOLD_SLOP_PX.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// Block comments only where a comment can start (a line's beginning, or a
// JSX {/* */}): a bare /\*...\*/ pattern also matches from "image/*" in a
// string to the next comment's end and eats the code between.
const strip = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("what counts as moving", () => {
  it("a jittering finger is still holding", () => {
    expect(holdMoved(1, 1)).toBe(false);
    expect(holdMoved(HOLD_SLOP_PX - 1, 0)).toBe(false);
  });
  it("past the slop, in any direction, it is not a hold", () => {
    expect(holdMoved(HOLD_SLOP_PX + 1, 0)).toBe(true);
    expect(holdMoved(0, -(HOLD_SLOP_PX + 1))).toBe(true);
  });
  it("and a swipe has stopped being a hold before it is claimed", () => {
    expect(HOLD_SLOP_PX).toBeLessThan(SWIPE_SLOP_PX);
  });
});

describe("who the browser's contextmenu event is for", () => {
  it("a mouse right-click opens the menu", () => {
    expect(contextMenuOpensHold("mouse")).toBe(true);
  });
  it("a touch or a pen never does: the timer is the only hold", () => {
    expect(contextMenuOpensHold("touch")).toBe(false);
    expect(contextMenuOpensHold("pen")).toBe(false);
  });
  it("no pointer at all (keyboard menu key) still opens it", () => {
    expect(contextMenuOpensHold(null)).toBe(true);
  });
});

describe("the rows use them", () => {
  const chat = strip(read("src/components/messages/RealChatView.tsx"));

  it("no row cancels the hold on every pointermove any more", () => {
    expect(chat).not.toContain("onPointerMove={onPressEnd}");
    expect((chat.match(/onPointerMove=\{onPressMove\}/g) ?? []).length).toBeGreaterThan(10);
  });

  it("no row opens the menu straight from contextmenu", () => {
    expect(chat).not.toContain("onContextMenu={(e) => { e.preventDefault(); setMenu(");
    expect((chat.match(/onContextMenu=\{\(e\) => onHoldContextMenu\(m, e\)\}/g) ?? []).length).toBeGreaterThan(10);
  });

  it("the move handler cancels only past the slop", () => {
    const fn = chat.slice(chat.indexOf("function onPressMove("));
    const body = fn.slice(0, fn.indexOf("\n  }\n"));
    expect(body).toContain("if (holdMoved(e.clientX - s.x, e.clientY - s.y)) onPressEnd();");
  });

  it("the contextmenu handler asks who pressed", () => {
    const fn = chat.slice(chat.indexOf("function onHoldContextMenu("));
    const body = fn.slice(0, fn.indexOf("\n  }\n"));
    expect(body).toContain("e.preventDefault();");
    expect(body).toContain("if (!contextMenuOpensHold(pressStart.current?.type ?? null)) return;");
  });

  it("and the press records where and with what", () => {
    const fn = chat.slice(chat.indexOf("function onPressStart("));
    const body = fn.slice(0, fn.indexOf("\n  }\n"));
    expect(body).toContain("pressStart.current = { x: e.clientX, y: e.clientY, type: e.pointerType };");
  });
});

