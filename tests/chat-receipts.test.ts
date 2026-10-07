// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { FACES_SHOWN, lastMine, readMarkers, receiptFor, seenLabel } from "@/lib/chat-receipts";

/**
 * How far a message has got, shown under it: words under your newest message
 * in a one-to-one chat, each member's face under the last message they have
 * read in a group. Not a tick in every bubble.
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

const T0 = Date.parse("2026-10-07T10:00:00.000Z");
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();
const msg = (id: string, sender: string, min: number, extra: Record<string, unknown> = {}) => ({
  id, body: id, sender_id: sender, kind: "text", post_id: null, reply_to_id: null, is_unsent: false,
  created_at: at(min), ...extra,
});
const reader = (userId: string, min: number | null, hide = false) => ({ userId, lastReadAt: min === null ? null : at(min), hideReadReceipts: hide });

describe("when it was seen", () => {
  it("in words a person would use", () => {
    expect(seenLabel(at(0), T0 + 20_000)).toBe("Seen now");
    expect(seenLabel(at(0), T0 + 4 * 60_000)).toBe("Seen 4m ago");
    expect(seenLabel(at(0), T0 + 3 * 3600_000)).toBe("Seen 3h ago");
    expect(seenLabel(at(0), T0 + 2 * 86400_000)).toBe("Seen 7 Oct");
  });
  it("never in the future, and never a broken date", () => {
    expect(seenLabel(at(5), T0)).toBe("Seen now");
    expect(seenLabel("nonsense", T0)).toBe("Seen");
  });
});

describe("where each member has read to", () => {
  const thread = [msg("a", "amy", 1), msg("b", "me", 2), msg("c", "bo", 3), msg("d", "me", 4)];

  it("is the last message at or before the time they read", () => {
    const m = readMarkers(thread, [reader("amy", 4), reader("bo", 3), reader("cy", 1)]);
    expect(Object.fromEntries(m)).toEqual({ d: ["amy"], c: ["bo"], a: ["cy"] });
  });

  it("people at the same place share it", () => {
    expect(readMarkers(thread, [reader("amy", 9), reader("bo", 9)]).get("d")).toEqual(["amy", "bo"]);
  });

  it("someone hiding their receipts, or who has read nothing, is nowhere", () => {
    expect(readMarkers(thread, [reader("amy", 4, true), reader("bo", null), reader("cy", 0)]).size).toBe(0);
  });

  it("a message still on its way, or a notice from the thread, is not somewhere to have read to", () => {
    const t = [msg("a", "me", 1), msg("s", "amy", 2, { kind: "system" }), msg("p", "me", 3, { _status: "pending" })];
    expect([...readMarkers(t, [reader("amy", 9)]).keys()]).toEqual(["a"]);
  });
});

describe("the words under my newest message", () => {
  const mine = msg("d", "me", 4);
  const opts = { isGroup: false, faces: false, now: T0 + 6 * 60_000 };

  it("which message that is", () => {
    expect(lastMine([msg("a", "me", 1), msg("b", "amy", 2)], "me")!.id).toBe("a");
    expect(lastMine([msg("b", "amy", 2)], "me")).toBeNull();
  });

  it("sending, then sent, then when it was seen", () => {
    expect(receiptFor({ ...mine, _status: "pending" }, [reader("amy", 9)], opts)).toEqual({ kind: "sending" });
    expect(receiptFor(mine, [reader("amy", 3)], opts)).toEqual({ kind: "sent" });
    expect(receiptFor(mine, [reader("amy", 5)], opts)).toEqual({ kind: "seen", label: "Seen 1m ago" });
  });

  it("someone hiding their receipts never reads as having seen it", () => {
    expect(receiptFor(mine, [reader("amy", 5, true)], opts)).toEqual({ kind: "sent" });
  });

  it("a failed message has its own line, so nothing here", () => {
    expect(receiptFor({ ...mine, _status: "failed" }, [reader("amy", 5)], opts)).toBeNull();
    expect(receiptFor(null, [], opts)).toBeNull();
  });

  it("in a group, faces say seen; without any, it says sent", () => {
    expect(receiptFor(mine, [reader("amy", 5)], { ...opts, isGroup: true, faces: true })).toBeNull();
    expect(receiptFor(mine, [reader("amy", 1)], { ...opts, isGroup: true, faces: false })).toEqual({ kind: "sent" });
  });
});

describe("in the thread", () => {
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

  async function open(props: Record<string, unknown>) {
    const { RealChatView } = await import("@/components/messages/RealChatView");
    await act(async () =>
      root.render(
        createElement(RealChatView, {
          conversationId: `rc-${Math.random()}`,
          currentUserId: "me",
          other: { id: "amy", name: "Amy", username: "amy", hue: 120 },
          ...props,
        } as never),
      ),
    );
  }
  const receipt = () => host.querySelector("[data-receipt]");

  it("one-to-one: one line, under the newest of mine only, saying it was seen", async () => {
    await open({
      initialMessages: [msg("m1", "me", -30), msg("m2", "me", -20)],
      initialReaders: [{ userId: "amy", lastReadAt: new Date().toISOString(), hideReadReceipts: false }],
    });
    expect(host.querySelectorAll("[data-receipt]")).toHaveLength(1);
    expect(receipt()!.getAttribute("data-receipt")).toBe("seen");
    expect(receipt()!.textContent).toBe("Seen now");
    // No ticks in the bubbles.
    expect(host.querySelector('[aria-label="Seen"]')).toBeNull();
    expect(host.querySelector('[aria-label="Sent"]')).toBeNull();
  });

  it("one-to-one: sent, when they have not read that far", async () => {
    await open({
      initialMessages: [msg("m1", "me", -30)],
      initialReaders: [{ userId: "amy", lastReadAt: at(-600), hideReadReceipts: false }],
    });
    expect(receipt()!.textContent).toBe("Sent");
  });

  it("on its way says so; failed says how to send it again", async () => {
    await open({ initialMessages: [msg("m1", "me", -30, { _status: "pending" })] });
    expect(receipt()!.textContent).toBe("Sending…");
    await act(async () => root.unmount());
    root = createRoot(host);
    await open({ initialMessages: [msg("m1", "me", -30, { _status: "failed" })] });
    expect(receipt()).toBeNull();
    expect(host.textContent).toContain("Not sent · Tap to retry");
  });

  it("group: each member's face under the last message they read, and no words where a face is", async () => {
    await open({
      group: { title: "Roof crew", memberCount: 3 },
      members: {
        amy: { name: "Amy", hue: 120, avatarUrl: "https://x.test/amy.jpg" },
        bo: { name: "Bo", hue: 30, avatarUrl: "https://x.test/bo.jpg" },
      },
      initialMessages: [msg("m1", "me", -30), msg("m2", "me", -20)],
      initialReaders: [
        { userId: "amy", lastReadAt: at(-25), hideReadReceipts: false },
        { userId: "bo", lastReadAt: at(-10), hideReadReceipts: false },
      ],
    });
    const rows = [...host.querySelectorAll("[data-read-faces]")];
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Seen by Amy", "Seen by Bo"]);
    expect(rows.map((r) => r.querySelector("img")!.getAttribute("src"))).toEqual(["https://x.test/amy.jpg", "https://x.test/bo.jpg"]);
    expect(receipt()).toBeNull();
  });

  it("group: nobody has read it yet, so it says sent", async () => {
    await open({
      group: { title: "Roof crew", memberCount: 2 },
      members: { amy: { name: "Amy", hue: 120, avatarUrl: null } },
      initialMessages: [msg("m1", "me", -30)],
      initialReaders: [{ userId: "amy", lastReadAt: null, hideReadReceipts: false }],
    });
    expect(host.querySelector("[data-read-faces]")).toBeNull();
    expect(receipt()!.textContent).toBe("Sent");
  });
});

describe("typing and recording", () => {
  const chat = readFileSync("src/components/messages/RealChatView.tsx", "utf8").replace(/\r\n/g, "\n");
  const block = chat.slice(chat.indexOf("{/* Someone is recording or typing"), chat.indexOf("<div ref={endRef} />"));

  it("one bubble where the message will land, beside the person's face", () => {
    expect(block).toContain('data-activity={recording ? "recording" : "typing"}');
    expect(block).toContain("<Avatar name={first.name} hue={first.hue} size={28} src={first.avatarUrl ?? undefined} />");
    expect(block).toContain("animate-dot-bounce");
    expect(block).toContain("animate-mic-wave");
  });

  it("recording wins over typing, and both are said to a screen reader", () => {
    expect(block).toContain("const recording = recordingIds.length > 0;");
    expect(block).toContain('role="status"');
    expect(block).toContain('<span className="sr-only">{recording ? recordingLabel(ids) : typingLabel(ids)}</span>');
  });

  it("only so many faces fit under one message", () => {
    expect(FACES_SHOWN).toBe(4);
    expect(chat).toContain("+{markers.get(m.id)!.length - FACES_SHOWN}");
  });
});
