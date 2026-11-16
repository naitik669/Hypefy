// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The unread badge on the Messages tab, and when it clears.
 *
 * Written because the clearing moved: it was a setState inside an effect,
 * which react-hooks flags as an error — the bar renders once with the old
 * count, commits, then immediately renders again with zero, so the tab you
 * just opened flashes the number you came to clear. It is adjusted during
 * render now, the same pattern `seen` directly above it uses.
 *
 * That is a refactor, so the point of this file is that the behaviour did
 * not change with it, and nothing covered the badge at all before.
 *
 * Deliberately NOT asserted as source text: "is the setState in an effect or
 * in the render body" is the implementation detail, and what has to hold is
 * what the badge shows.
 */

let pathname = "/home";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// One cheap indexed RPC in the real thing. Never called in these tests —
// refresh() only runs from a realtime event, and nothing fires one here.
const rpc = vi.fn(async () => ({ data: 0 }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

vi.mock("@/components/messages/MessageStream", () => ({
  useMembershipUpdate: () => {},
  useMessageInsert: () => {},
}));

// The three that only exist to wrap a tab in a long-press gesture. Rendering
// their children is the whole of what this test needs from them.
const passthrough = ({ children }: { children?: ReactNode }) =>
  createElement("div", null, children);
vi.mock("@/components/layout/NavHoldMenu", () => ({ NavHoldMenu: passthrough }));
vi.mock("@/components/layout/ChatHoldMenu", () => ({ ChatHoldMenu: passthrough }));
vi.mock("@/components/layout/AccountSwitchPad", () => ({ AccountSwitchPad: passthrough }));
vi.mock("@/components/ui/Avatar", () => ({ Avatar: () => createElement("div") }));
vi.mock("@/lib/haptics", () => ({ haptics: { tap: () => {}, select: () => {} } }));

/**
 * The two icon barrels, stubbed.
 *
 * Not for isolation — for time. `@phosphor-icons/react` is one module
 * exporting every icon in the set, and importing BottomNav made Vite
 * compile the whole of it. The first test here took 5.4 seconds on its own,
 * then timed out at thirty under a full-suite run: a test failing on the
 * clock rather than on anything it was checking.
 *
 * Named explicitly rather than through a Proxy. A Proxy namespace is the
 * tidier-looking version and it does not work — Vitest needs a real module
 * object, and handing it one that answers every property made the run hang
 * rather than fail. An icon added to BottomNav later arrives here as
 * undefined and React says so loudly, which is a good enough signal.
 */
const Icon = () => createElement("span");
vi.mock("@phosphor-icons/react", () => ({
  House: Icon,
  Chat: Icon,
  Lightning: Icon,
  Plus: Icon,
  ImageSquare: Icon,
  FilmSlate: Icon,
  Broadcast: Icon,
}));
vi.mock("lucide-react", () => ({
  LibraryBig: Icon,
  Search: Icon,
  Settings: Icon,
  ShoppingBag: Icon,
}));

let root: Root;
let host: HTMLDivElement;

async function render(initialUnreadMsgs: number) {
  const { BottomNav } = await import("@/components/layout/BottomNav");
  await act(async () =>
    root.render(
      createElement(BottomNav, {
        avatarUrl: null,
        avatarHue: 200,
        displayName: "N",
        currentUserId: "u1",
        initialUnreadMsgs,
      }),
    ),
  );
}

/**
 * What the badge says, or null when there is no badge.
 *
 * `data-unread-badge`, not the aria-label and not the class. The first draft
 * of this file selected `[aria-label="Unread messages"]`, which matched
 * nothing — the badge had no label at all — so this returned null every time
 * and the three "it is cleared" tests below passed without rendering a thing.
 * The two tests that expected a NUMBER are what caught it.
 */
function badge(): string | null {
  const el = host.querySelector("[data-unread-badge]");
  return el ? (el.textContent ?? "") : null;
}

beforeEach(() => {
  pathname = "/home";
  rpc.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.resetModules();
});

describe("the unread badge", () => {
  it("shows the count it was given, away from the Messages tab", async () => {
    await render(3);
    expect(badge()).toBe("3");
  });

  it("renders no badge at all when there is nothing unread", async () => {
    await render(0);
    expect(badge()).toBe(null);
  });

  it("is cleared while standing on the Messages tab", async () => {
    // The guarantee: arriving at /messages does not show you the number you
    // came to clear. Not even for the one frame an effect would have cost.
    pathname = "/messages";
    await render(3);
    expect(badge()).toBe(null);
  });

  it("clears on a sub-route of Messages too, not just the tab root", async () => {
    pathname = "/messages/abc";
    await render(5);
    expect(badge()).toBe(null);
  });

  it("does not clear on a route that merely starts like it", async () => {
    // activeTab's whole-segment rule. A prefix match would call this Messages.
    pathname = "/messagesx";
    await render(2);
    expect(badge()).toBe("2");
  });

  /**
   * The one that actually tests the state write.
   *
   * Mutation checking found that it does NOT hide the badge on /messages —
   * the `!messagesActive` render guard does that on its own, so deleting the
   * setState left every "it is cleared" test above green. The two mechanisms
   * mask each other while you are standing on the tab.
   *
   * What the write is for is LEAVING: having read the inbox, the count must
   * not come back. That is only visible after a navigation, and nothing
   * tested it.
   */
  it("stays cleared after leaving the Messages tab", async () => {
    const { BottomNav } = await import("@/components/layout/BottomNav");
    const props = {
      avatarUrl: null,
      avatarHue: 200,
      displayName: "N",
      currentUserId: "u1",
      initialUnreadMsgs: 3,
    };

    pathname = "/messages";
    await act(async () => root.render(createElement(BottomNav, props)));
    expect(badge()).toBe(null);

    // Same root, so the component keeps its state — this is a navigation,
    // not a fresh mount.
    pathname = "/home";
    await act(async () => root.render(createElement(BottomNav, props)));
    expect(badge(), "the count came back after the inbox was read").toBe(null);
  });

  it("but a count that was never read survives a navigation", async () => {
    // The other side of it, so the test above cannot be satisfied by a
    // component that simply never shows a badge after any navigation.
    const { BottomNav } = await import("@/components/layout/BottomNav");
    const props = {
      avatarUrl: null,
      avatarHue: 200,
      displayName: "N",
      currentUserId: "u1",
      initialUnreadMsgs: 3,
    };

    pathname = "/home";
    await act(async () => root.render(createElement(BottomNav, props)));
    expect(badge()).toBe("3");

    pathname = "/shots";
    await act(async () => root.render(createElement(BottomNav, props)));
    expect(badge()).toBe("3");
  });

  it("names itself for a screen reader, in conversations", async () => {
    // A bare "3" announced with nothing saying what of. The locked dot
    // beside it already carried a label; this did not.
    await render(3);
    const el = host.querySelector("[data-unread-badge]");
    expect(el?.getAttribute("aria-label")).toBe("3 unread conversations");
  });

  it("and says conversation, singular, when there is one", async () => {
    await render(1);
    expect(
      host.querySelector("[data-unread-badge]")?.getAttribute("aria-label"),
    ).toBe("1 unread conversation");
  });

  it("caps the digits at 9+ while the label keeps the real number", async () => {
    // The badge is 18px wide. "12" fits, "128" does not.
    await render(12);
    const el = host.querySelector("[data-unread-badge]");
    expect(el?.textContent).toBe("9+");
    expect(el?.getAttribute("aria-label")).toBe("12 unread conversations");
  });

  it("settles without an extra committed render carrying the old count", async () => {
    // What the move was for. Adjusting during render means React discards the
    // first pass, so the count zero is the FIRST thing committed — there is
    // never a paint with "3" on the tab you just opened. Asserted as: the
    // badge is absent immediately after the first act(), with no second
    // flush needed.
    pathname = "/messages";
    const { BottomNav } = await import("@/components/layout/BottomNav");
    await act(async () =>
      root.render(
        createElement(BottomNav, {
          avatarUrl: null,
          avatarHue: 200,
          displayName: "N",
          currentUserId: "u1",
          initialUnreadMsgs: 7,
        }),
      ),
    );
    expect(host.textContent).not.toContain("7");
  });

  it("does not query the database just to render", async () => {
    // refresh() is coalesced and driven by realtime events. Mounting the bar
    // is not one, and this used to be a read per render in the shell.
    await render(3);
    expect(rpc).not.toHaveBeenCalled();
  });
});
