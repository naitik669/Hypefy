// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ColorPager } from "@/components/ui/ColorPager";
import { pageColorGroups } from "@/components/diary/DiaryPage";

/**
 * The colour line moves a line per swipe, however long or fast the swipe —
 * scroll-snap let a flick run through every line to the last.
 */

let root: Root;
let host: HTMLDivElement;
let picked: string[] = [];

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  picked = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(ColorPager, { groups: pageColorGroups(200), value: "rose", onChange: (k: string) => picked.push(k) }))
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const line = () => document.querySelector('button[aria-current="true"]')?.getAttribute("aria-label");
const track = () => document.querySelector('[role="radiogroup"] > div') as HTMLElement;
const fire = (type: string, x: number, y = 10) =>
  act(async () => void track().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })));

async function swipe(from: number, to: number, y = 10) {
  await fire("pointerdown", from);
  await fire("pointermove", from + (to - from) / 2, y);
  await fire("pointermove", to, y);
  await fire("pointerup", to, y);
}

describe("ColorPager", () => {
  it("opens on the chosen colour's line", () => {
    expect(line()).toBe("Reds and pinks colours");
  });

  it("moves one line per swipe, however far the finger goes", async () => {
    await swipe(900, 0);
    expect(line()).toBe("Oranges and golds colours");
    await swipe(900, 0);
    expect(line()).toBe("Greens colours");
    await swipe(0, 900);
    expect(line()).toBe("Oranges and golds colours");
  });

  it("stops at the ends", async () => {
    for (let i = 0; i < 10; i++) await swipe(900, 0);
    expect(line()).toBe("Purples colours");
    for (let i = 0; i < 10; i++) await swipe(0, 900);
    expect(line()).toBe("Neutrals colours");
  });

  it("leaves an up-or-down drag to the page, and a swipe never picks a colour", async () => {
    await swipe(100, 110, 300); // mostly vertical
    expect(line()).toBe("Reds and pinks colours");
    await swipe(900, 0);
    await act(async () => (document.querySelector('button[aria-label="Amber"]') as HTMLElement).click());
    // The click a swipe leaves behind is swallowed; the next real one counts.
    expect(picked).toEqual([]);
    await act(async () => (document.querySelector('button[aria-label="Amber"]') as HTMLElement).click());
    expect(picked).toEqual(["amber"]);
  });

  it("goes to a line from its dot", async () => {
    await act(async () => (document.querySelector('button[aria-label="Blues and teals colours"]') as HTMLElement).click());
    expect(line()).toBe("Blues and teals colours");
  });
});
