// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The sheet every overlay in the app arrives in. It is held, not flicked: it
 * follows the finger, a short pull springs back, a long one takes it one step
 * down, and a pull up makes it taller when there is more to read.
 */

vi.mock("@/lib/useFocusTrap", () => ({ useFocusTrap: () => ({ current: null }) }));

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();

async function render(open = true) {
  const { BottomSheet } = await import("@/components/ui/BottomSheet");
  await act(async () =>
    root.render(
      createElement(BottomSheet, {
        open,
        onClose,
        title: "Comments",
        children: createElement("p", null, "a thread"),
      }),
    ),
  );
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  onClose.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const sheet = () => document.querySelector("[data-sheet]") as HTMLElement | null;
const handle = () => document.querySelector("[data-sheet-handle]") as HTMLElement;
const body = () => sheet()!.lastElementChild as HTMLElement;

function touch(el: Element, type: string, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const points = type === "touchend" ? [] : [{ clientX: 100, clientY: y }];
  Object.defineProperty(e, "touches", { value: points });
  Object.defineProperty(e, "changedTouches", { value: [{ clientX: 100, clientY: y }] });
  return act(async () => void el.dispatchEvent(e));
}

/** A drag of `dy`, slow enough that distance rather than speed decides it. */
async function drag(el: Element, dy: number) {
  await touch(el, "touchstart", 300);
  for (let i = 1; i <= 4; i++) await touch(el, "touchmove", 300 + (dy * i) / 4);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 260));
  });
  await touch(el, "touchend", 300 + dy);
}

/** Give the body something to scroll, which jsdom will not do on its own. */
function makeScrollable(scrollTop = 0) {
  const b = body();
  Object.defineProperty(b, "scrollHeight", { value: 2000, configurable: true });
  Object.defineProperty(b, "clientHeight", { value: 500, configurable: true });
  Object.defineProperty(b, "scrollTop", { value: scrollTop, writable: true, configurable: true });
}

describe("a bottom sheet", () => {
  it("follows the finger down", async () => {
    await touch(handle(), "touchstart", 300);
    await touch(handle(), "touchmove", 340);
    expect(sheet()!.style.transform).toBe("translate3d(0,40px,0)");
    await touch(handle(), "touchmove", 380);
    expect(sheet()!.style.transform).toBe("translate3d(0,80px,0)");
  });

  it("springs back from a short pull, and is still there", async () => {
    await drag(handle(), 50);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet()!.style.transform).toBe("translate3d(0,0,0)");
  });

  it("closes when the pull is long enough", async () => {
    await drag(handle(), 140);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("grows when pulled up, if there is more to read", async () => {
    makeScrollable();
    expect(sheet()!.style.maxHeight).toBe("85dvh");
    await drag(handle(), -70);
    expect(sheet()!.style.maxHeight).toBe("95dvh");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("comes back to its resting height before it closes", async () => {
    makeScrollable();
    await drag(handle(), -70);
    expect(sheet()!.dataset.expanded).toBe("");

    // One drag down is one step: back to resting height, still open.
    await drag(handle(), 140);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet()!.style.maxHeight).toBe("85dvh");

    // The next one closes it.
    await drag(handle(), 140);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves a pull in the middle of a scrolled thread to the scroll", async () => {
    makeScrollable(300);
    await drag(body(), 140);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet()!.style.transform).not.toContain("140");
  });

  it("can be pulled from the thread itself when it is at the top", async () => {
    makeScrollable(0);
    await drag(body(), 140);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays on screen while it leaves, then goes", async () => {
    await render(false);
    // Still mounted, on its way out.
    expect(sheet()).toBeTruthy();
    expect(sheet()!.style.transform).toBe("translate3d(0,100%,0)");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 260));
    });
    expect(sheet()).toBeNull();
  });
});

/**
 * A composer belongs to the sheet, not to the end of its contents. Sticky
 * inside the scroller left it a safe-area's height off the floor with the
 * thread running through the gap underneath — which is what you saw through
 * the row you were typing into.
 */
describe("a sheet with a footer", () => {
  beforeEach(async () => {
    const { BottomSheet } = await import("@/components/ui/BottomSheet");
    await act(async () =>
      root.render(
        createElement(BottomSheet, {
          open: true,
          onClose,
          title: "Comments",
          footer: createElement("input", { placeholder: "Add a comment..." }),
          children: createElement("p", null, "a thread"),
        }),
      ),
    );
  });

  it("sits under the scrolling part, not inside it", () => {
    const footer = document.querySelector("[data-sheet-footer]") as HTMLElement;
    expect(footer).toBeTruthy();
    expect(footer.querySelector("input")).toBeTruthy();
    // A sibling of the scroller: nothing can pass behind it.
    const scroller = footer.previousElementSibling as HTMLElement;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.contains(footer)).toBe(false);
    expect(footer.className).not.toContain("sticky");
  });

  it("owns the floor, and the phone's own inset with it", () => {
    const footer = document.querySelector("[data-sheet-footer]") as HTMLElement;
    const scroller = footer.previousElementSibling as HTMLElement;
    expect(footer.className).toContain("pb-[calc(var(--sab)+10px)]");
    // Which the scrolling part above it therefore must not also pay for.
    expect(scroller.className).not.toContain("var(--sab)");
    expect(footer.className).toContain("bg-elevated");
  });
});
