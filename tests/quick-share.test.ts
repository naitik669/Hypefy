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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {} }),
  usePathname: () => "/home",
}));
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

describe("rowLens", () => {
  it("swells the face under the thumb most and its neighbours a little", async () => {
    const { rowLens } = await import("@/components/layout/NavHoldMenu");
    expect(rowLens(0)).toBe(1);
    expect(rowLens(40)).toBeGreaterThan(0);
    expect(rowLens(40)).toBeLessThan(rowLens(10));
    expect(rowLens(200)).toBe(0);
  });
});

describe("holding share", () => {
  it("raises the people you send to most, as faces, in one card", async () => {
    await hold();
    // The two faces, then More for everyone and everything else.
    expect(tiles()).toHaveLength(3);
    expect(tiles()[2].getAttribute("aria-selected")).toBe("false");
    // Over the page, not inside the post: drawn in the feed it would sit
    // under the veil and be blurred along with everything else.
    const card = document.querySelector('[role="listbox"]')!;
    expect(card.closest("article, [data-feed-card]")).toBeNull();
    expect(host.contains(card)).toBe(false);
    // Left corner above the button, running right — not centred on it, and
    // not off the screen: the trigger was placed at x=20.
    expect((card.closest(".fixed") as HTMLElement).style.left).toBe("20px");
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
    // The pick lands visibly first: a check on the face, and the card says so.
    expect(tiles()).toHaveLength(3);
    expect(document.body.textContent).toContain("Sent to Maya");
    // Then it goes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(tiles()).toHaveLength(0);
  });

  it("opens the full sheet when the thumb lifts on More", async () => {
    await hold();
    await pointer(trigger(), "pointermove", 26 + 2 * 52 + 22, 366);
    expect(tiles()[2].getAttribute("aria-selected")).toBe("true");
    await pointer(trigger(), "pointerup", 26 + 2 * 52 + 22, 366);
    expect(openSheet).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.some(([fn]) => fn === "send_message")).toBe(false);
    expect(tiles()).toHaveLength(0);
  });

  it("keeps the choice while the thumb crosses the gap between two faces", async () => {
    await hold();
    // Between Maya (26..70) and Leo (78..122): nearest wins, nothing drops.
    await pointer(trigger(), "pointermove", 73, 366);
    expect(tiles().some((t) => t.getAttribute("aria-selected") === "true")).toBe(true);
  });

  it("takes every touch while it is up, so nothing behind it can be used", async () => {
    const { overlayCount } = await import("@/lib/overlay-stack");
    await hold();
    const veil = document.querySelector("[data-hold-veil]") as HTMLElement;
    expect(veil).toBeTruthy();
    // Scrolling the feed underneath is off too, not just tapping it.
    expect(veil.style.touchAction).toBe("none");
    // And the app is told something is open. A veil only stops what the DOM
    // sends; React sends a portalled veil's events up the component tree as
    // well, which is how sliding to a face was also dragging the feed
    // sideways underneath it. Everything that watches this — SwipeNav, the
    // Android back button — stands down while the count is up.
    expect(overlayCount()).toBe(1);

    await pointer(veil, "pointerdown", 200, 700);
    expect(tiles()).toHaveLength(0);
    expect(overlayCount()).toBe(0);
  });

  it("picks nobody while the thumb is still on the button, and sends nothing on release", async () => {
    await hold();
    // The card ends at y=392; the button is at 400..440. A thumb that has not
    // moved up onto the card is not on a face, however close.
    await pointer(trigger(), "pointermove", 48, 420);
    expect(tiles().some((t) => t.getAttribute("aria-selected") === "true")).toBe(false);
    await pointer(trigger(), "pointermove", 48, 400);
    expect(tiles().some((t) => t.getAttribute("aria-selected") === "true")).toBe(false);
    await pointer(trigger(), "pointerup", 48, 400);
    expect(rpc.mock.calls.some(([fn]) => fn === "send_message")).toBe(false);
    expect(tiles()).toHaveLength(0);
  });

  it("drops the pick when the thumb slides back off the card before letting go", async () => {
    await hold();
    await pointer(trigger(), "pointermove", 48, 366);
    expect(tiles()[0].getAttribute("aria-selected")).toBe("true");
    await pointer(trigger(), "pointermove", 48, 425);
    expect(tiles()[0].getAttribute("aria-selected")).toBe("false");
    await pointer(trigger(), "pointerup", 48, 425);
    expect(rpc.mock.calls.some(([fn]) => fn === "send_message")).toBe(false);
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

/**
 * The share button lives inside the feed, which is inside SwipeNav — and a
 * portalled veil does not stop a React event reaching it. This is the case
 * that made the app feel live behind the card: the sideways slide onto a face
 * was also a sideways drag on the page.
 */
describe("holding share, inside the swipeable feed", () => {
  it("does not drag the page sideways while the faces are up", async () => {
    await act(async () => root.unmount());
    const { SwipeNav } = await import("@/components/layout/SwipeNav");
    const { ShareButton } = await import("@/components/feed/QuickShare");
    root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          SwipeNav,
          null,
          createElement("div", { id: "feed" }, "the feed"),
          createElement(ShareButton, {
            postId: "p1",
            onOpenSheet: openSheet,
            children: createElement("span", null, "share"),
          }),
        ),
      ),
    );

    const page = document.getElementById("feed")!.parentElement as HTMLElement;
    const share = host.querySelector('[aria-label="Share"]')!.parentElement as HTMLElement;

    function touch(type: string, x: number, y: number) {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(e, "touches", {
        value: type === "touchend" ? [] : [{ clientX: x, clientY: y }],
      });
      return act(async () => void share.dispatchEvent(e));
    }

    // A finger produces both: the hold is pointer events, the page's own
    // swipe is touch events, and both reach their handlers.
    await touch("touchstart", 300, 400);
    await pointer(share, "pointerdown", 300, 400);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(document.querySelector("[data-hold-veil]")).toBeTruthy();

    // Now slide sideways, the way you would to reach a face.
    await touch("touchmove", 280, 400);
    await touch("touchmove", 160, 400);
    expect(page.style.transform).toBe("");
  });
});
