// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { pinSwipeYields } from "../src/lib/chat-pins";

/**
 * Two gestures, one direction (27 Nov 2026).
 *
 * A left swipe on the thread opens the pin board; a left swipe on somebody
 * else's message forwards it. The board's handler claimed at 10px and the
 * message's at 12px, so a left swipe on a message, a photo or a Shot opened
 * the board instead. The message's own gesture wins wherever there is one.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

function row(takesLeft: boolean) {
  const outer = document.createElement("div");
  const r = document.createElement("div");
  if (takesLeft) r.dataset.swipeTakesLeft = "1";
  const img = document.createElement("img");
  r.appendChild(img);
  outer.appendChild(r);
  return { outer, img };
}

describe("the pin board gives way to a message's own left swipe", () => {
  it("a touch that starts on a message that takes a left swipe is not the board's", () => {
    const { img } = row(true);
    expect(pinSwipeYields(img, false)).toBe(true);
  });

  it("a row with nothing on its left swipe still opens the board", () => {
    // Your own message once its edit window is over: the row does not move,
    // so the board is the only thing a left swipe there could mean.
    const { img } = row(false);
    expect(pinSwipeYields(img, false)).toBe(false);
  });

  it("empty thread still opens the board", () => {
    const { outer } = row(true);
    expect(pinSwipeYields(outer, false)).toBe(false);
    expect(pinSwipeYields(null, false)).toBe(false);
  });

  it("an open board always takes its own swipe back", () => {
    const { img } = row(true);
    expect(pinSwipeYields(img, true)).toBe(false);
  });
});

describe("the wiring", () => {
  it("the board's touch start asks before taking the gesture", () => {
    const pane = strip(read("src/components/messages/PinPane.tsx"));
    const fn = pane.slice(pane.indexOf("function start("), pane.indexOf("function move("));
    expect(fn).toContain("if (pinSwipeYields(e.target, openRef.current)) { drag.current = null; return; }");
  });

  it("the row marks itself on pointerdown, which fires before touchstart", () => {
    const sw = strip(read("src/components/messages/SwipeRow.tsx"));
    const fn = sw.slice(sw.indexOf("function onPointerDown("), sw.indexOf("function onPointerMove("));
    expect(fn).toContain('root.current.dataset.swipeTakesLeft = actionFor("left") ? "1" : "";');
    // before the mouse early-return would be wrong: a mouse never starts the board's touch gesture anyway
  });
});

describe("the avatar stays where it is", () => {
  const sw = strip(read("src/components/messages/SwipeRow.tsx"));
  const chat = read("src/components/messages/RealChatView.tsx");

  it("only the marked body moves, not the whole row", () => {
    expect(sw).toContain('slider.current?.querySelector<HTMLElement>("[data-swipe-body]") ?? slider.current');
    const paint = sw.slice(sw.indexOf("function schedule()"), sw.indexOf("function settle()"));
    expect(paint).toContain("const el = mover.current;");
    expect(paint).not.toContain("slider.current");
    const settle = sw.slice(sw.indexOf("function settle()"), sw.indexOf("function onPointerDown("));
    expect(settle).toContain("const el = mover.current;");
  });

  it("the bubble column is the body, and the avatar is outside it", () => {
    const open = chat.indexOf("<SwipeRow");
    const inside = chat.slice(open, chat.indexOf("</SwipeRow>"));
    const face = inside.indexOf("data-msg-face=");
    const body = inside.indexOf("data-swipe-body");
    expect(face).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(face);
    expect(inside.slice(face, body)).toContain("data-swipe-still");
  });

  it("and the mark sits past the avatar, not on top of it", () => {
    expect(sw).toContain('slider.current?.querySelector<HTMLElement>("[data-swipe-still]")');
    expect(sw).toContain("style={{ [showing.side]: showing.inset }}");
    expect(sw).toContain('side.current === "left" && still ? still.offsetLeft + still.offsetWidth + 4 : 12');
  });
});
