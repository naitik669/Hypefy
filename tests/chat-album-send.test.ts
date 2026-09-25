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
  // jsdom can't decode photos; the upload then sends the file as picked.
  vi.stubGlobal("Image", undefined);
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

    // The paperclip opens the picker; the Gallery tile adds two, already picked.
    await act(async () => {
      (host.querySelector('[aria-label="Attach"]') as HTMLButtonElement).click();
    });
    expect(document.querySelector("[data-camera-tile]")).toBeTruthy();
    const input = document.querySelector("[data-gallery-input]") as HTMLInputElement;
    const files = [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })];
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(document.querySelectorAll('[data-picker-grid] [aria-pressed="true"]')).toHaveLength(2);
    // Picking swaps the tabs for a caption and a send button.
    expect(document.querySelector("[data-picker-tabs]")).toBeNull();

    await act(async () => (document.querySelector('[aria-label="Send 2"]') as HTMLButtonElement).click());
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });

    // In the thread already, drawn from the device, still sending.
    const folder = host.querySelector("[data-media-folder]")!;
    expect(folder).toBeTruthy();
    expect(folder.querySelector("img")!.getAttribute("src")).toMatch(/^blob:/);
    expect(host.querySelector('[aria-label="Sending"]')).toBeTruthy();
    // The composer is not the one waiting.
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

    // Hold it: Edit caption puts the caption in the composer, with a caret
    // on the folder, and Send becomes a tick that saves.
    await act(async () => {
      host.querySelector("[data-media-folder]")!.parentElement!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    const edit = [...document.querySelectorAll("button")].find((b) => b.textContent === "Edit caption")!;
    expect(edit).toBeTruthy();
    await act(async () => edit.click());

    const composer = host.querySelector('input[placeholder="Add a caption…"]') as HTMLInputElement;
    expect(composer).toBeTruthy();
    expect(host.querySelector("[data-folder-caption] .animate-caret")).toBeTruthy();
    const save = host.querySelector('[aria-label="Save changes"]') as HTMLButtonElement;
    expect(save).toBeTruthy();
    expect(host.querySelector('[aria-label="Record voice note"]')).toBeNull();

    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(composer, "Golden hour");
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector("[data-folder-caption]")!.textContent).toBe("Golden hour");

    rpc.mockImplementation(async (fn: string, args: { p_caption: string }) =>
      fn === "edit_album_caption"
        ? { data: JSON.stringify({ caption: args.p_caption, items: [{ url: "https://cdn/x", type: "image" }] }), error: null }
        : { data: null, error: null },
    );
    await act(async () => (host.querySelector('[aria-label="Save changes"]') as HTMLButtonElement).click());
    const edited = rpc.mock.calls.find(([fn]) => fn === "edit_album_caption")!;
    expect(edited[1]).toMatchObject({ p_message_id: "m1", p_caption: "Golden hour" });
    expect(host.querySelector("[data-folder-caption]")!.textContent).toBe("Golden hour");
    expect(host.querySelector(".animate-caret")).toBeNull();
    // Photos still from the device after the edit.
    expect(host.querySelector("[data-media-folder] img")!.getAttribute("src")).toMatch(/^blob:/);
  });
});

describe("the paperclip", () => {
  async function renderChat() {
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
    return host.querySelector('[aria-label="Attach"]') as HTMLButtonElement;
  }
  const press = (el: Element, type: string) =>
    el.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true }), { pointerId: 1 }));

  it("opens the picker on a tap", async () => {
    const clip = await renderChat();
    await act(async () => { press(clip, "pointerdown"); press(clip, "pointerup"); clip.click(); });
    expect(document.querySelector("[data-picker-grid]")).toBeTruthy();
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
  });

  it("opens the quick menu when held, and the release doesn't open the picker too", async () => {
    const clip = await renderChat();
    await act(async () => { press(clip, "pointerdown"); await new Promise((r) => setTimeout(r, 450)); });
    await act(async () => { press(clip, "pointerup"); clip.click(); });
    const items = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.lastElementChild?.textContent);
    expect(items).toEqual(["Camera", "Photo or video", "View once", "Document", "GIF", "Music"]);
    expect(document.querySelector("[data-picker-grid]")).toBeNull();
  });

  it("Photo or video from the menu lands in the picker, already picked", async () => {
    const clip = await renderChat();
    await act(async () => { clip.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })); });
    const input = host.querySelector("[data-attach-media-input]") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    await act(async () => ([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.lastElementChild?.textContent === "Photo or video") as HTMLElement).click());
    expect(click).toHaveBeenCalled();
    Object.defineProperty(input, "files", { value: [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(document.querySelectorAll('[data-picker-grid] [aria-pressed="true"]')).toHaveLength(2);
    expect(document.querySelector('[aria-label="Send 2"]')).toBeTruthy();
  });
});
