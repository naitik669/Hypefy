// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Sending a folder: it shows in the thread at once with the sending dots, the
 * composer is free straight away, and only once the upload and the send are
 * done does it turn into a sent tick.
 */

const upload = vi.hoisted(() => vi.fn());
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
    storage: {
      from: () => ({ upload, getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }) }),
    },
  };
  return { createClient: () => client };
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`);
  URL.revokeObjectURL = vi.fn();
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
  upload.mockReset();
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

describe("sending a folder", () => {
  it("lands in the thread at once, leaves the composer free, and ticks once it is sent", async () => {
    const { RealChatView } = await import("@/components/messages/RealChatView");
    await act(async () =>
      root.render(
        createElement(RealChatView, {
          conversationId: "c1",
          currentUserId: "me",
          other: { id: "u2", name: "Maya", username: "maya", hue: 120 },
          initialMessages: [],
        }),
      ),
    );

    // Hold every upload until the test lets it go.
    let finish!: () => void;
    const held = new Promise<void>((r) => (finish = r));
    upload.mockImplementation(async () => {
      await held;
      return { error: null };
    });

    // Photo or video → pick two.
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    const files = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })];
    await act(async () => {
      (host.querySelector('[aria-label="Attach"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      [...document.querySelectorAll('[role="menuitem"]')]
        .find((b) => b.textContent?.includes("Photo or video"))!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(host.querySelector("[data-album-draft]")).toBeTruthy();

    await act(async () => (host.querySelector('[aria-label="Send"]') as HTMLButtonElement).click());

    // In the thread already, drawn from the device, still sending.
    const folder = host.querySelector("[data-media-folder]")!;
    expect(folder).toBeTruthy();
    expect(folder.querySelector("img")!.getAttribute("src")).toMatch(/^blob:/);
    expect(host.querySelector('[aria-label="Sending"]')).toBeTruthy();
    // The composer is not the one waiting.
    expect(host.querySelector("[data-album-draft]")).toBeNull();
    expect(host.querySelector('[aria-label="Record voice note"]')).toBeTruthy();
    expect(rpc.mock.calls.some(([fn]) => fn === "send_message")).toBe(false);

    rpc.mockImplementation(async (fn: string, args: { p_body: string }) =>
      fn === "send_message"
        ? {
            data: {
              id: "m1", body: args.p_body, sender_id: "me", kind: "album", post_id: null,
              reply_to_id: null, is_unsent: false, created_at: new Date().toISOString(),
            },
            error: null,
          }
        : { data: null, error: null },
    );
    await act(async () => {
      finish();
      await new Promise((r) => setTimeout(r, 10));
    });

    const sent = rpc.mock.calls.find(([fn]) => fn === "send_message")!;
    expect(sent[1].p_kind).toBe("album");
    expect(sent[1].p_body).toContain("https://cdn/");
    expect(sent[1].p_body).not.toContain("blob:");
    expect(host.querySelector('[aria-label="Sending"]')).toBeNull();
    // Still drawn from the device, so nothing reloads.
    expect(host.querySelector("[data-media-folder] img")!.getAttribute("src")).toMatch(/^blob:/);
  });
});
