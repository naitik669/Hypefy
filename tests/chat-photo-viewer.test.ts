// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * A photo sent in a chat opens full-screen when tapped — a single photo had
 * no tap at all — and the viewer is not flat black: the photo is its own
 * ground, rounded, with Spotlight's reply bar and react button under it.
 */

const rpc = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, back: () => {}, refresh: () => {} }) }));
vi.mock("@/components/calls/CallProvider", () => ({ useCallControls: () => ({ startCall: () => {} }) }));
vi.mock("@/components/calls/GroupCallProvider", () => ({ useGroupCall: () => ({ startGroupCall: () => {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/components/native/CaptureGuard", () => ({ CaptureGuard: () => null }));
vi.mock("@/lib/supabase/client", () => {
  const chain: unknown = new Proxy(() => {}, {
    get: (_t, key) =>
      key === "then" ? (res: (v: unknown) => void) => res({ data: [], error: null, count: 0 }) : chain,
    apply: () => chain,
  });
  const channel = { on: () => channel, subscribe: () => channel, send: () => {}, track: () => {} };
  const client = {
    from: () => chain,
    rpc,
    channel: () => channel,
    removeChannel: () => {},
    auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }) },
  };
  return { createClient: () => client };
});

const PHOTO = "https://cdn.example/roof.jpg";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

/** The chat keeps each thread's messages between mounts, so each test gets its own thread. */
let thread = 0;

async function openChatWithPhoto() {
  const { RealChatView } = await import("@/components/messages/RealChatView");
  await act(async () =>
    root.render(
      createElement(RealChatView, {
        conversationId: `c${++thread}`,
        currentUserId: "me",
        other: { id: "u2", name: "Maya Rao", username: "maya", hue: 120 },
        initialMessages: [
          {
            id: "img1", body: PHOTO, sender_id: "u2", kind: "image", post_id: null,
            reply_to_id: null, is_unsent: false, created_at: new Date().toISOString(),
          },
        ],
      }),
    ),
  );
  // Let the signed media URL settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host.querySelector('[aria-label="Open photo"]') as HTMLElement;
}

const viewer = () => document.querySelector('[role="dialog"][aria-label="Photos"]') as HTMLElement | null;

describe("a single photo in a chat", () => {
  it("opens full-screen when tapped", async () => {
    const bubble = await openChatWithPhoto();
    expect(bubble).toBeTruthy();
    expect(viewer()).toBeNull();
    await act(async () => bubble.click());
    expect(viewer()).toBeTruthy();
  });

  it("sits on its own blurred photo, not on black, and is drawn with rounded corners", async () => {
    const bubble = await openChatWithPhoto();
    await act(async () => bubble.click());
    const v = viewer()!;
    expect(v.style.background).toBe("");
    const imgs = [...v.querySelectorAll("img")];
    expect(imgs.some((i) => i.className.includes("blur-["))).toBe(true);
    expect(imgs.some((i) => i.className.includes("rounded-[22px]"))).toBe(true);
  });

  it("has the reply bar and the react button at the bottom", async () => {
    const bubble = await openChatWithPhoto();
    await act(async () => bubble.click());
    const v = viewer()!;
    expect(v.querySelector('input[placeholder="Reply to Maya…"]')).toBeTruthy();
    expect(v.querySelector('[aria-label^="React with"]')).toBeTruthy();
  });

  it("sends a reply as an answer to that photo, and leaves the chat's own composer alone", async () => {
    rpc.mockImplementation(async (fn: string, args: { p_body: string; p_reply_to_id?: string }) =>
      fn === "send_message"
        ? {
            data: {
              id: "m2", body: args.p_body, sender_id: "me", kind: "text", post_id: null,
              reply_to_id: args.p_reply_to_id ?? null, is_unsent: false, created_at: new Date().toISOString(),
            },
            error: null,
          }
        : { data: null, error: null },
    );
    const bubble = await openChatWithPhoto();
    await act(async () => bubble.click());
    const input = viewer()!.querySelector('input[placeholder="Reply to Maya…"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "where is this");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (viewer()!.querySelector('[aria-label="Send reply"]') as HTMLButtonElement).click());

    const sent = rpc.mock.calls.find(([fn]) => fn === "send_message")!;
    expect(sent[1]).toMatchObject({ p_body: "where is this", p_kind: "text", p_reply_to_id: "img1" });
    // Cleared after it went.
    expect(input.value).toBe("");
  });
});
