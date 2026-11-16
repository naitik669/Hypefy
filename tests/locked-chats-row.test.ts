// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PULL_EVENT } from "@/components/ui/PullToRefresh";

/**
 * The way into locked chats: a row at the top of Messages that does not stay.
 *
 * It pops in when Messages opens, goes at the first scroll or click, and
 * comes back when the list is pulled down. That pull is the part a mouse
 * cannot perform, so on a desktop the row lingered out and the only way back
 * was to leave Messages and return.
 *
 * Returning to the top of the list now brings it back where there is a fine
 * pointer — the same movement as the pull without the overscroll, and Home
 * does it from the keyboard. On touch nothing changes, because there the
 * pull already does it and re-showing at scrollTop 0 would make the row
 * flicker in during the pull itself.
 */

vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children?: React.ReactNode }) =>
    createElement("a", rest, children),
}));

let root: Root;
let host: HTMLDivElement;

/** What matchMedia reports for (pointer: fine). */
let fine = true;

function installMatchMedia() {
  window.matchMedia = ((q: string) =>
    ({
      matches: q.includes("pointer: fine") ? fine : !fine,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

async function render(count = 2, unread = false) {
  const { LockedChatsRow } = await import("@/components/vault/LockedChatsRow");
  await act(async () => root.render(createElement(LockedChatsRow, { count, unread })));
}

/** "shown" or "hidden", straight off the element the transition is on. */
function state(): string | null {
  return host.querySelector("[data-locked-row]")?.getAttribute("data-locked-row") ?? null;
}

async function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, writable: true, configurable: true });
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fine = true;
  installMatchMedia();
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.resetModules();
});

describe("the locked chats row", () => {
  it("is there when Messages opens", async () => {
    await render();
    expect(state()).toBe("shown");
  });

  it("and the test can tell the two states apart", async () => {
    // Guards every assertion below: if the attribute never changed, each of
    // them would pass on whatever the first render happened to be.
    await render();
    expect(state()).toBe("shown");
    await scrollTo(400);
    expect(state()).toBe("hidden");
  });

  it("goes away on the first scroll down the list", async () => {
    await render();
    await scrollTo(40);
    expect(state()).toBe("hidden");
  });

  it("goes away on its own after the linger", async () => {
    const { LOCKED_ROW_LINGER_MS } = await import("@/lib/chat-vault");
    await render();
    await act(async () => {
      vi.advanceTimersByTime(LOCKED_ROW_LINGER_MS + 50);
    });
    expect(state()).toBe("hidden");
  });

  it("comes back when the list is pulled down", async () => {
    await render();
    await scrollTo(400);
    expect(state()).toBe("hidden");
    await act(async () => {
      window.dispatchEvent(new Event(PULL_EVENT));
    });
    expect(state()).toBe("shown");
  });

  it("comes back on returning to the top, with a pointer", async () => {
    // The desktop path. Without this the row lingered out and there was no
    // way back short of leaving Messages and returning.
    await render();
    await scrollTo(400);
    expect(state()).toBe("hidden");
    await scrollTo(0);
    expect(state()).toBe("shown");
  });

  it("but not on touch, where the pull already does it", async () => {
    fine = false;
    installMatchMedia();
    await render();
    await scrollTo(400);
    await scrollTo(0);
    expect(state()).toBe("hidden");
    // The pull still works there, which is the point.
    await act(async () => {
      window.dispatchEvent(new Event(PULL_EVENT));
    });
    expect(state()).toBe("shown");
  });

  it("does not re-show on a small scroll that never left the top", async () => {
    // Otherwise it pops in and out while reading the first few rows.
    await render();
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(state()).toBe("hidden");
    await scrollTo(4);
    expect(state()).toBe("hidden");
  });

  it("is out of the tab order while hidden", async () => {
    await render();
    expect(host.querySelector("a")?.getAttribute("tabindex")).toBe("0");
    await scrollTo(400);
    expect(host.querySelector("a")?.getAttribute("tabindex")).toBe("-1");
    expect(host.querySelector("[data-locked-row]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says how many and never who", async () => {
    await render(3);
    const text = host.textContent ?? "";
    expect(text).toContain("Locked chats");
    expect(text).toContain("3");
  });
});
