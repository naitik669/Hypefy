// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { CHAT_PATH, leaveChatAnimated } from "@/lib/leave-chat";

/**
 * Leaving a chat slides it away, or simply goes back where the browser can't
 * animate it.
 */

afterEach(() => {
  delete (document as { startViewTransition?: unknown }).startViewTransition;
  delete document.documentElement.dataset.dmLeave;
});

describe("leaving a chat", () => {
  it("knows a chat from the pages inside it", () => {
    expect(CHAT_PATH.test("/messages/ab45aee8-4ff1-4315-9a37-7ff3766a51f1")).toBe(true);
    expect(CHAT_PATH.test("/messages/ab45aee8-4ff1-4315-9a37-7ff3766a51f1/info")).toBe(false);
    expect(CHAT_PATH.test("/messages/new")).toBe(false);
  });

  it("just goes back where there are no view transitions", () => {
    const back = vi.fn();
    leaveChatAnimated(back);
    expect(back).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute("data-dm-leave")).toBe(false);
  });

  it("goes back inside a view transition, marked so the chat slides off", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((r) => (finish = r));
    const start = vi.fn((update: () => Promise<void>) => {
      void update();
      return { finished };
    });
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    const back = vi.fn();
    leaveChatAnimated(back);
    expect(start).toHaveBeenCalledOnce();
    expect(back).toHaveBeenCalledOnce();
    expect(document.documentElement.hasAttribute("data-dm-leave")).toBe(true);
    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.hasAttribute("data-dm-leave")).toBe(false);
  });
});
