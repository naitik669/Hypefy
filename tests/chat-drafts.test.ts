// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readDraft, writeDraft } from "@/lib/chat-drafts";
import type { InboxRow } from "@/components/messages/MessagesInbox";

/**
 * What you typed in a chat and did not send is kept: it is in the box when
 * you come back, and the chat's row in Messages shows it as "Draft: …".
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push() {}, back() {}, refresh() {} }),
  usePathname: () => "/messages",
}));
vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => {
    // transitionTypes is Next's own; a plain anchor must not be handed it.
    const rest = { ...props };
    delete rest.transitionTypes;
    delete rest.children;
    return createElement("a", rest, props.children as never);
  },
}));
vi.mock("@/components/calls/CallProvider", () => ({ useCallControls: () => ({ startCall: () => {} }) }));
vi.mock("@/components/calls/GroupCallProvider", () => ({ useGroupCall: () => ({ startGroupCall: () => {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/components/native/CaptureGuard", () => ({ CaptureGuard: () => null }));
vi.mock("@/components/diary/FloatingPages", () => ({ FloatingPages: () => null }));
vi.mock("@/lib/haptics", () => ({ haptics: { tap() {}, select() {}, success() {}, error() {} } }));
vi.mock("@/lib/supabase/client", () => {
  const chain: unknown = new Proxy(() => {}, {
    get: (_t, key) =>
      key === "then" ? (res: (v: unknown) => void) => res({ data: [], error: null, count: 0 }) : chain,
    apply: () => chain,
  });
  const channel = { on: () => channel, subscribe: () => channel, send: () => {}, track: () => {} };
  return {
    createClient: () => ({
      from: () => chain,
      rpc: async () => ({ data: null, error: null }),
      channel: () => channel,
      removeChannel: () => {},
      auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
      storage: { from: () => ({ upload: vi.fn(), getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }) },
    }),
  };
});

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("a draft", () => {
  it("is kept for one chat of one account, and nobody else's", () => {
    writeDraft("me", "c1", "see you at");
    expect(readDraft("me", "c1")).toBe("see you at");
    expect(readDraft("me", "c2")).toBe("");
    expect(readDraft("someone-else", "c1")).toBe("");
  });

  it("is dropped when the box is emptied, or holds only spaces", () => {
    writeDraft("me", "c1", "hello");
    writeDraft("me", "c1", "   ");
    expect(readDraft("me", "c1")).toBe("");
    expect(localStorage.length).toBe(0);
  });

  it("keeps the spaces someone typed inside it", () => {
    writeDraft("me", "c1", "on my way ");
    expect(readDraft("me", "c1")).toBe("on my way ");
  });
});

describe("the chat box", () => {
  const box = () => host.querySelector('input[placeholder="Message…"]') as HTMLInputElement;
  async function open(conversationId: string) {
    const { RealChatView } = await import("@/components/messages/RealChatView");
    await act(async () =>
      root.render(
        createElement(RealChatView, {
          key: conversationId,
          conversationId,
          currentUserId: "me",
          other: { id: "amy", name: "Amy", username: "amy", hue: 120 },
          initialMessages: [],
        }),
      ),
    );
    // The draft is read just after the first paint.
    await act(async () => { await Promise.resolve(); });
  }
  async function type(text: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(box(), text);
      box().dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("keeps what was typed when the chat is left, and has it back on return", async () => {
    await open("drafts-1");
    await type("running late, start without");
    expect(readDraft("me", "drafts-1")).toBe("running late, start without");

    await act(async () => root.unmount());
    root = createRoot(host);
    await open("drafts-1");
    expect(box().value).toBe("running late, start without");
  });

  it("keeps each chat's draft to that chat", async () => {
    writeDraft("me", "drafts-2", "for this one");
    await open("drafts-3");
    expect(box().value).toBe("");
    // And opening an empty chat does not wipe another chat's draft.
    expect(readDraft("me", "drafts-2")).toBe("for this one");
  });

  it("does not wipe a waiting draft just by opening the chat", async () => {
    writeDraft("me", "drafts-4", "still here");
    await open("drafts-4");
    expect(readDraft("me", "drafts-4")).toBe("still here");
  });

  it("lets go of the draft when the box is cleared", async () => {
    await open("drafts-5");
    await type("never mind");
    await type("");
    expect(readDraft("me", "drafts-5")).toBe("");
  });

  it("lets go of the draft once it is sent", async () => {
    await open("drafts-6");
    await type("on my way");
    await act(async () => void box().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    await act(async () => { await Promise.resolve(); });
    expect(box().value).toBe("");
    expect(readDraft("me", "drafts-6")).toBe("");
  });
});

describe("the chat's row in Messages", () => {
  const row = (id: string, name: string): InboxRow => ({
    id, name, username: name.toLowerCase(), hue: 200, isGroup: false, memberCount: 2,
    lastBody: "see you at 6", lastKind: "text", lastAt: "2026-10-06T10:00:00Z", lastMine: false, lastSenderName: null,
    unread: false, unreadCount: 0, online: false, lastSeenAt: null, muted: false, pinned: false, isRequest: false,
  });
  async function inbox() {
    const { MessagesInbox } = await import("@/components/messages/MessagesInbox");
    await act(async () =>
      root.render(createElement(MessagesInbox, { rows: [row("c1", "Maya"), row("c2", "Aman")], currentUserId: "me" })),
    );
  }
  const lineOf = (name: string) =>
    [...host.querySelectorAll("a")].find((a) => a.textContent?.includes(name))?.querySelector("p.truncate")?.textContent;

  it("shows the draft in place of the last message, marked as one", async () => {
    writeDraft("me", "c1", "wait, which entrance");
    await inbox();
    expect(lineOf("Maya")).toBe("Draft: wait, which entrance");
    expect(host.querySelectorAll("[data-draft]")).toHaveLength(1);
    // A chat with nothing unsent still shows what was last said.
    expect(lineOf("Aman")).toBe("see you at 6");
  });

  it("goes back to the last message when the draft is sent or cleared, without a reload", async () => {
    writeDraft("me", "c1", "wait");
    await inbox();
    expect(lineOf("Maya")).toBe("Draft: wait");
    await act(async () => writeDraft("me", "c1", ""));
    expect(lineOf("Maya")).toBe("see you at 6");
  });

  it("does not show another account's draft for the same chat", async () => {
    writeDraft("someone-else", "c1", "theirs");
    await inbox();
    expect(lineOf("Maya")).toBe("see you at 6");
  });
});
