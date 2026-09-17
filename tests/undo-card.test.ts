// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * One tap deletes, and for five seconds a card shows what went, with Undo and
 * a line draining along its bottom. Nothing is actually deleted until the
 * five seconds are up.
 */

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { resetRemovedChats } = await import("@/lib/chat-removal");
  resetRemovedChats();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

type ToastFn = (m: string, k?: "success" | "error" | "plain", a?: import("@/components/ui/ToastProvider").ToastAction) => void;

async function mountToasts(): Promise<ToastFn> {
  const { ToastProvider, useToast } = await import("@/components/ui/ToastProvider");
  let fire: ToastFn = () => {};
  function Grab() {
    const t = useToast();
    useEffect(() => {
      fire = t;
    }, [t]);
    return null;
  }
  await act(async () => root.render(createElement(ToastProvider, null, createElement(Grab))));
  return (m, k, a) => fire(m, k, a);
}

describe("the undo card", () => {
  it("shows what was deleted, its picture, Undo and the draining line", async () => {
    const toast = await mountToasts();
    await act(async () =>
      toast("Post deleted", "plain", {
        label: "Undo",
        detail: "sunset run",
        thumb: { src: "https://example.test/p.jpg" },
        onClick: () => {},
      }),
    );
    const card = document.querySelector("[data-undo-toast]")!;
    expect(card.textContent).toContain("Post deleted");
    expect(card.textContent).toContain("sunset run");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://example.test/p.jpg");
    expect(card.querySelector("button")?.textContent).toBe("Undo");
    expect((card.querySelector(".undo-drain") as HTMLElement).style.animationDuration).toBe("5000ms");
  });

  it("keeps a plain message a plain pill", async () => {
    const toast = await mountToasts();
    await act(async () => toast("Saved", "success"));
    expect(document.querySelector("[data-undo-toast]")).toBeNull();
    expect(document.body.textContent).toContain("Saved");
  });
});

describe("deleting a chat", () => {
  it("leaves the inbox at once, and only really goes after five seconds", async () => {
    const { removeChat, isChatRemoved } = await import("@/lib/chat-removal");
    const leave = vi.fn(async () => ({ error: null }));
    const toast = vi.fn();

    act(() => removeChat({ id: "c1", isGroup: false, name: "sana", leave, toast }));
    expect(isChatRemoved("c1")).toBe(true);
    expect(toast.mock.calls[0][0]).toBe("Chat deleted");
    expect(toast.mock.calls[0][2].detail).toBe("Chat with sana");
    expect(leave).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(isChatRemoved("c1")).toBe(true);
  });

  it("Undo brings it back and nothing is deleted", async () => {
    const { removeChat, isChatRemoved } = await import("@/lib/chat-removal");
    const leave = vi.fn(async () => ({ error: null }));
    const toast = vi.fn();

    act(() => removeChat({ id: "g1", isGroup: true, name: "Trip", leave, toast }));
    expect(toast.mock.calls[0][0]).toBe("Left group");
    act(() => toast.mock.calls[0][2].onClick());
    expect(isChatRemoved("g1")).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(leave).not.toHaveBeenCalled();
  });

  it("puts it back if the delete fails", async () => {
    const { removeChat, isChatRemoved } = await import("@/lib/chat-removal");
    const leave = vi.fn(async () => ({ error: { message: "nope" } }));
    const toast = vi.fn();

    act(() => removeChat({ id: "c2", isGroup: false, name: "leo", leave, toast }));
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(isChatRemoved("c2")).toBe(false);
    expect(toast).toHaveBeenLastCalledWith("Couldn't delete that chat.", "error");
  });
});
