// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Who is talking, beside what they said. In a group especially, a name over
 * the first bubble was the only way to tell people apart. Each person's face
 * now sits at the foot of every run of their messages.
 */

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

const at = (min: number, day = "2026-10-01") => `${day}T10:${String(min).padStart(2, "0")}:00.000Z`;
const msg = (id: string, sender: string, min: number, extra: Record<string, unknown> = {}) => ({
  id, body: id, sender_id: sender, kind: "text", post_id: null, reply_to_id: null, is_unsent: false,
  created_at: at(min), ...extra,
});

describe("which message carries the face", () => {
  it("is the last of a run, not every bubble", async () => {
    const { showsFace } = await import("@/components/messages/RealChatView");
    const a1 = msg("a1", "amy", 1), a2 = msg("a2", "amy", 2), b1 = msg("b1", "bo", 3);
    expect(showsFace(a1, a2, "me")).toBe(false);
    expect(showsFace(a2, b1, "me")).toBe(true);
    expect(showsFace(b1, undefined, "me")).toBe(true);
  });

  it("is never your own", async () => {
    const { showsFace } = await import("@/components/messages/RealChatView");
    expect(showsFace(msg("m", "me", 1), undefined, "me")).toBe(false);
  });

  it("ends a run at a notice from the thread, and at midnight", async () => {
    const { showsFace } = await import("@/components/messages/RealChatView");
    const a1 = msg("a1", "amy", 1);
    expect(showsFace(a1, msg("s", "amy", 2, { kind: "system" }), "me")).toBe(true);
    expect(showsFace(a1, { ...msg("a2", "amy", 2), created_at: at(2, "2026-10-02") }, "me")).toBe(true);
    // A notice itself is not anyone speaking.
    expect(showsFace(msg("s", "amy", 2, { kind: "system" }), undefined, "me")).toBe(false);
  });
});

describe("faces in a group chat", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = vi.fn();
    window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
  });

  it("puts each person's own photo at the foot of their run, and none beside yours", async () => {
    const { RealChatView } = await import("@/components/messages/RealChatView");
    await act(async () =>
      root.render(
        createElement(RealChatView, {
          conversationId: "faces-1",
          currentUserId: "me",
          other: { id: "amy", name: "Amy", username: "amy", hue: 120 },
          group: { title: "Roof crew", memberCount: 3 },
          members: {
            amy: { name: "Amy", hue: 120, avatarUrl: "https://x.test/amy.jpg" },
            bo: { name: "Bo", hue: 30, avatarUrl: "https://x.test/bo.jpg" },
          },
          initialMessages: [msg("a1", "amy", 1), msg("a2", "amy", 2), msg("b1", "bo", 3), msg("m1", "me", 4)],
        }),
      ),
    );
    const faces = [...host.querySelectorAll("[data-msg-face] img")].map((i) => i.getAttribute("src"));
    expect(faces).toEqual(["https://x.test/amy.jpg", "https://x.test/bo.jpg"]);
    // Three messages from others leave room for a face; yours leaves none.
    expect(host.querySelectorAll("span.w-7.shrink-0")).toHaveLength(3);
  });
});

describe("where the face sits", () => {
  it("is level with a plain bubble", async () => {
    const { faceLift } = await import("@/components/messages/RealChatView");
    expect(faceLift({ kind: "text" }, false, true)).toBe(0);
  });

  it("rises past a reaction, so it is beside the words and not the reaction", async () => {
    const { faceLift } = await import("@/components/messages/RealChatView");
    expect(faceLift({ kind: "text" }, true, true)).toBe(11);
  });

  it("rises past the time line under a card, and past both together", async () => {
    const { faceLift } = await import("@/components/messages/RealChatView");
    expect(faceLift({ kind: "post" }, false, true)).toBe(17);
    expect(faceLift({ kind: "voice" }, true, true)).toBe(28);
    // No time line drawn, nothing to rise past.
    expect(faceLift({ kind: "post" }, false, false)).toBe(0);
    // A text bubble keeps its time inside itself.
    expect(faceLift({ kind: "text" }, false, true)).toBe(0);
  });
});
