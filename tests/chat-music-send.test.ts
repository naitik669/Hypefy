// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { packTrack } from "@/lib/music-message";
import type { Track } from "@/lib/music";

/**
 * Sending a song in a chat: Music is one of the paperclip's options, picking
 * a track sends it straight away, and it draws in the thread as something you
 * can play rather than a line of JSON.
 */

const rpc = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, back: () => {}, refresh: () => {} }) }));
vi.mock("@/components/calls/CallProvider", () => ({ useCallControls: () => ({ startCall: () => {} }) }));
vi.mock("@/components/calls/GroupCallProvider", () => ({ useGroupCall: () => ({ startGroupCall: () => {} }) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => () => {} }));
vi.mock("@/components/native/CaptureGuard", () => ({ CaptureGuard: () => null }));

// The real picker searches the network; this one is a button that returns a track.
vi.mock("@/components/music/TrackPicker", () => ({
  TrackPicker: ({ open, onSelect }: { open: boolean; onSelect: (t: Track) => void }) =>
    open
      ? createElement(
          "button",
          { "aria-label": "Pick Agora Hills", onClick: () => onSelect(TRACK) },
          "Agora Hills",
        )
      : null,
}));

const TRACK: Track = {
  id: "t1",
  title: "Agora Hills",
  artist: "Doja Cat",
  artwork: "https://cdn/art.jpg",
  preview: "https://cdn/p.mp3",
};

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
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
  };
  return { createClient: () => client };
});

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn(() => "blob:x");
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

/** The paperclip: a tap opens the media picker, a hold opens the quick menu. */
async function holdAttach() {
  const clip = host.querySelector('[aria-label="Attach"]') as HTMLButtonElement;
  // jsdom has no PointerEvent; the component only reads pointerId.
  const press = (type: string) =>
    clip.dispatchEvent(Object.assign(new MouseEvent(type, { bubbles: true }), { pointerId: 1 }));
  await act(async () => {
    press("pointerdown");
    await new Promise((r) => setTimeout(r, 450));
  });
  await act(async () => press("pointerup"));
}

async function mount(initialMessages: unknown[] = []) {
  const { RealChatView } = await import("@/components/messages/RealChatView");
  await act(async () =>
    root.render(
      createElement(RealChatView, {
        conversationId: "c1",
        currentUserId: "me",
        other: { id: "u2", name: "Maya", username: "maya", hue: 120 },
        initialMessages,
      } as never),
    ),
  );
}

describe("sending a song", () => {
  it("is one of the paperclip's options, beside GIF", async () => {
    await mount();
    await holdAttach();
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent ?? "");
    expect(labels).toContain("Music");
    // GIF draws its own label as the icon too, so its text reads twice.
    expect(labels.some((l) => l.includes("GIF"))).toBe(true);
    expect(labels.indexOf("Music")).toBe(labels.length - 1);
  });

  it("sends the track as the message body, with no upload and no migration", async () => {
    await mount();
    rpc.mockImplementation(async (fn: string, args: { p_body: string; p_kind: string }) =>
      fn === "send_message"
        ? {
            data: {
              id: "m1", body: args.p_body, sender_id: "me", kind: args.p_kind, post_id: null,
              reply_to_id: null, is_unsent: false, created_at: new Date().toISOString(),
            },
            error: null,
          }
        : { data: null, error: null },
    );

    await holdAttach();
    await act(async () =>
      ([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.trim() === "Music") as HTMLButtonElement).click(),
    );
    await act(async () => (document.querySelector('[aria-label="Pick Agora Hills"]') as HTMLButtonElement).click());
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

    const sent = rpc.mock.calls.find(([fn]) => fn === "send_message")!;
    expect(sent[1].p_kind).toBe("music");
    expect(JSON.parse(sent[1].p_body)).toMatchObject({ id: "t1", title: "Agora Hills", artist: "Doja Cat" });
  });

  it("draws a received song as something playable, not as text", async () => {
    await mount([
      {
        id: "m9", body: packTrack(TRACK), sender_id: "u2", kind: "music", post_id: null,
        reply_to_id: null, is_unsent: false, created_at: new Date().toISOString(),
      },
    ]);
    expect(host.textContent).toContain("Agora Hills");
    expect(host.textContent).not.toContain("preview");
    expect(host.querySelector('[aria-label*="Agora Hills"], audio, button')).toBeTruthy();
  });
});
