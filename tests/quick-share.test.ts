// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Holding share is the nav bar's gesture, not a lookalike: the faces you send
 * to most rise out of the button, the one under the thumb is selected as it
 * moves, and letting go sends to it. A plain tap still opens the full sheet.
 */

const rpc = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => toast }));
vi.mock("@/lib/haptics", () => ({
  haptics: { tap() {}, select() {}, success() {} },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

const TARGETS = [
  { id: "t1", display_name: "Maya", username: "maya", avatar_hue: 10, avatar_url: null },
  { id: "t2", display_name: "Leo", username: "leo", avatar_hue: 20, avatar_url: null },
];

let root: Root;
let host: HTMLDivElement;
const openSheet = vi.fn();

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  rpc.mockReset();
  toast.mockReset();
  openSheet.mockReset();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "top_share_targets") return { data: TARGETS };
    if (fn === "get_or_create_dm") return { data: "c1", error: null };
    return { data: null, error: null };
  });
  const { forgetShareTargets, ShareButton } = await import("@/components/feed/QuickShare");
  forgetShareTargets();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(ShareButton, {
        postId: "p1",
        onOpenSheet: openSheet,
        children: createElement("span", null, "share"),
      }),
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const trigger = () => host.querySelector("button")!.parentElement as HTMLElement;
const tiles = () => [...document.querySelectorAll('[role="option"]')] as HTMLElement[];

function pointer(el: HTMLElement, type: string, x = 50, y = 400) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: "touch", button: 0, clientX: x, clientY: y });
  return act(async () => void el.dispatchEvent(e));
}

/**
 * jsdom lays nothing out, so every rect is zero and the menu's hit-testing —
 * which reads real geometry, because a thumb has no hover — would have
 * nothing to test against. Give the pieces the positions a phone would.
 */
function place(el: Element, box: { top: number; left: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({
      top: box.top,
      bottom: box.top + box.height,
      left: box.left,
      right: box.left + box.width,
      width: box.width,
      height: box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * Hold long enough for the card to rise, with the button 400px down, and give
 * the card and its faces the positions a phone would lay out: one row, left to
 * right, just above the button.
 */
async function hold() {
  place(trigger(), { top: 400, left: 20, width: 40, height: 40 });
  await pointer(trigger(), "pointerdown");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  const card = document.querySelector('[role="listbox"]');
  if (card) place(card, { top: 340, left: 20, width: 220, height: 52 });
  tiles().forEach((t, i) =>
    place(t, { top: 344, left: 26 + i * 52, width: 44, height: 44 }),
  );
}

describe("holding share", () => {
  it("raises the people you send to most, as faces, in one card", async () => {
    await hold();
    expect(tiles()).toHaveLength(2);
    // Over the page, not inside the post: drawn in the feed it would sit
    // under the veil and be blurred along with everything else.
    const card = document.querySelector('[role="listbox"]')!;
    expect(card.closest("article, [data-feed-card]")).toBeNull();
    expect(host.contains(card)).toBe(false);
    // Left corner above the button, running right — not centred on it, and
    // not off the screen: the trigger was placed at x=20.
    expect((card.parentElement as HTMLElement).style.left).toBe("20px");
    // Faces and nothing else. The name belongs to whichever one the thumb is
    // on, not to a caption under every tile.
    expect(card.textContent).not.toContain("Maya");
    expect(tiles()[0].querySelector("[aria-hidden], img, span")).toBeTruthy();
  });

  it("sends to whoever the thumb was on when it lifted", async () => {
    await hold();
    // The thumb comes to rest on the first face and lifts there.
    await pointer(trigger(), "pointermove", 48, 366);
    // The one under the thumb is marked, and named.
    expect(tiles()[0].getAttribute("aria-selected")).toBe("true");
    expect(document.body.textContent).toContain("Maya");
    await pointer(trigger(), "pointerup", 48, 366);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    const sends = rpc.mock.calls.filter(([fn]) => fn === "send_message");
    expect(sends).toHaveLength(1);
    expect(sends[0][1]).toMatchObject({ p_conversation_id: "c1", p_post_id: "p1", p_kind: "post" });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Sent to"), "success");
    // And it closes on release, as the nav stacks do.
    expect(tiles()).toHaveLength(0);
  });

  it("takes every touch while it is up, so nothing behind it can be used", async () => {
    await hold();
    const veil = document.querySelector("[data-hold-veil]") as HTMLElement;
    expect(veil).toBeTruthy();
    // Scrolling the feed underneath is off too, not just tapping it.
    expect(veil.style.touchAction).toBe("none");
    await pointer(veil, "pointerdown", 200, 700);
    expect(tiles()).toHaveLength(0);
  });

  it("sends nothing when the thumb lifts away from every face", async () => {
    await hold();
    // Well clear of the card: nothing is under the thumb to send to.
    await pointer(trigger(), "pointermove", 48, 120);
    await pointer(trigger(), "pointerup", 48, 120);
    expect(rpc.mock.calls.some(([fn]) => fn === "send_message")).toBe(false);
    expect(tiles()).toHaveLength(0);
  });

  it("still opens the full sheet on a plain tap", async () => {
    await pointer(trigger(), "pointerdown");
    await pointer(trigger(), "pointerup");
    await act(async () => void host.querySelector("button")!.click());
    expect(openSheet).toHaveBeenCalledTimes(1);
    expect(tiles()).toHaveLength(0);
  });
});
