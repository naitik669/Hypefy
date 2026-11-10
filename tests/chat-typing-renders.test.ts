// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * Typing a message does not re-render the message list.
 *
 * What you were typing used to be state in RealChatView, and that component
 * renders every message in the conversation — so every keystroke re-rendered
 * the whole thread. On a long thread that is what made a chat stop responding
 * while you typed. The other person's typing had the identical problem and
 * was moved out first (lib/chat-activity); this is the same fix for your own.
 *
 * SwipeRow wraps exactly one message each, so counting how often it renders
 * counts how much of the thread React re-did.
 */

let rowRenders = 0;

vi.mock("@/components/messages/SwipeRow", () => ({
  SwipeRow: ({ children }: { children: ReactNode }) => {
    rowRenders++;
    return children;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, refresh: () => {} }),
}));
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
      storage: {
        from: () => ({ upload: vi.fn(), getPublicUrl: (p: string) => ({ data: { publicUrl: p } }) }),
      },
    }),
  };
});

const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const msg = (id: string, sender: string, min: number) => ({
  id,
  body: `message ${id}`,
  sender_id: sender,
  kind: "text",
  post_id: null,
  reply_to_id: null,
  is_unsent: false,
  created_at: new Date(T0 + min * 60_000).toISOString(),
});

const THREAD = Array.from({ length: 24 }, (_, i) => msg(`m${i}`, i % 2 ? "me" : "amy", i));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rowRenders = 0;
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();
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
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const box = () => host.querySelector('input[placeholder="Message…"]') as HTMLInputElement;

async function open() {
  const { RealChatView } = await import("@/components/messages/RealChatView");
  await act(async () =>
    root.render(
      createElement(RealChatView, {
        conversationId: `typing-${Math.random()}`,
        currentUserId: "me",
        other: { id: "amy", name: "Amy", username: "amy", hue: 120 },
        initialMessages: THREAD,
      } as never),
    ),
  );
  await act(async () => {
    await Promise.resolve();
  });
}

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
async function type(next: string) {
  await act(async () => {
    setValue.call(box(), next);
    box().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("typing in a long thread", () => {
  it("draws every message once to begin with", async () => {
    await open();
    expect(rowRenders).toBeGreaterThanOrEqual(THREAD.length);
  });

  it("and then re-renders none of them per keystroke", async () => {
    await open();

    // The first character flips the bar from a microphone to a send button,
    // which is a real change and does re-render the thread once. Everything
    // after it must not.
    await type("h");
    rowRenders = 0;

    await type("he");
    await type("hel");
    await type("hell");
    await type("hello");

    expect(rowRenders).toBe(0);
    expect(box().value).toBe("hello");
  });

  it("the first character is the only one that costs the thread anything", async () => {
    await open();
    rowRenders = 0;
    await type("h");
    const onTransition = rowRenders;
    rowRenders = 0;
    await type("hi");
    expect(onTransition).toBeGreaterThan(0);
    expect(rowRenders).toBe(0);
  });

  it("emptying the box costs one more, and nothing after", async () => {
    await open();
    await type("hi");
    rowRenders = 0;
    // Back to empty: the send button becomes a microphone again.
    await type("");
    expect(rowRenders).toBeGreaterThan(0);
    rowRenders = 0;
    await type("");
    expect(rowRenders).toBe(0);
  });
});

describe("what the thread kept", () => {
  const view = readFileSync("src/components/messages/RealChatView.tsx", "utf8").replace(/\r\n/g, "\n");
  const input = readFileSync("src/components/messages/MessageInput.tsx", "utf8").replace(/\r\n/g, "\n");

  it("holds no copy of what is being typed", () => {
    expect(view).not.toContain("const [text, setText] = useState");
    expect(view).not.toContain("setText(");
    // Where the caret is, and the suggestions from it, went with the value.
    expect(view).not.toContain("dmCursor");
    expect(view).not.toContain("useMentionHashtag");
  });

  it("reads the box at the moment of a tap instead", () => {
    expect(view).toContain("const draft = () => inputRef.current?.getValue() ?? \"\";");
    expect(view).toContain("const body = draft().trim();");
  });

  it("and knows only whether it is empty", () => {
    expect(view).toContain("const [hasText, setHasText] = useState(false);");
    expect(view).toContain("onHasTextChange={setHasText}");
  });

  it("the box writes its own draft, beside the value it is about", () => {
    expect(input).toContain("writeDraft(currentUserId, conversationId, text)");
    expect(view).not.toContain("writeDraft");
  });

  it("a folder's caption is the one live reader, and says so", () => {
    // It draws the caption on the message as you type it, which a boolean
    // cannot do — so that mode alone still reports every keystroke.
    expect(view).toContain('onValueChange={editing?.kind === "album" ? setCaptionPreview : undefined}');
    expect(view).toContain("caption: captionPreview }");
    expect(input).toContain("onValueChange?.(text)");
  });
});
