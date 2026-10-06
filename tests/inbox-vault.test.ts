// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { InboxRow } from "@/components/messages/MessagesInbox";

/**
 * Messages, with chats that can be locked and hidden: what the hold menu
 * offers in each list, the PIN chosen on first use, the Locked chats row,
 * and the Vault PIN typed into search.
 */

const nav = vi.hoisted(() => ({ pushed: [] as string[], refreshed: 0 }));
const toasts = vi.hoisted(() => [] as string[]);
const rpc = vi.hoisted(() => ({
  calls: [] as { fn: string; args?: Record<string, unknown> }[],
  answer: (fn: string, args?: Record<string, unknown>) => ({ data: null as unknown, error: null as { message: string } | null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (to: string) => nav.pushed.push(to), refresh: () => { nav.refreshed += 1; }, back() {} }),
  usePathname: () => "/messages",
}));
vi.mock("next/link", () => ({
  default: ({ children, href, transitionTypes: _t, ...rest }: Record<string, unknown>) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => (m: string) => { toasts.push(m); } }));
vi.mock("@/lib/haptics", () => ({ haptics: { tap() {}, select() {}, success() {} } }));
vi.mock("@/lib/overlay-shield", () => ({ shieldProps: {}, useOverlayShield: () => {}, useFrozenPage: () => {} }));
vi.mock("@/lib/e2ee/chat", () => ({
  isEncrypted: () => false,
  openEnvelope: () => ({ state: "plain" }),
  useEnvelopeReader: () => ({ loading: false }),
}));
vi.mock("@/components/diary/FloatingPages", () => ({ FloatingPages: () => null }));
vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? createElement("div", { "data-sheet": true }, children) : null,
}));
vi.mock("@/lib/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "ilike", "order", "limit", "update"]) q[m] = () => q;
  q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return {
    createClient: () => ({
      from: () => q,
      channel: () => channel,
      removeChannel: () => {},
      rpc: async (fn: string, args?: Record<string, unknown>) => {
        rpc.calls.push({ fn, args });
        return rpc.answer(fn, args);
      },
    }),
  };
});

const row = (id: string, name: string, over: Partial<InboxRow> = {}): InboxRow => ({
  id, name, username: name.toLowerCase(), hue: 200, isGroup: false, memberCount: 2,
  lastBody: "hello", lastKind: "text", lastAt: "2026-10-06T10:00:00Z", lastMine: false, lastSenderName: null,
  unread: false, unreadCount: 0, online: false, lastSeenAt: null, muted: false, pinned: false, isRequest: false,
  ...over,
});
const VAULT = { locked: 2, hidden: 1, unread: true, hasPin: true };

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  nav.pushed.length = 0;
  nav.refreshed = 0;
  toasts.length = 0;
  rpc.calls.length = 0;
  rpc.answer = () => ({ data: null, error: null });
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

async function open(props: Record<string, unknown> = {}) {
  const { MessagesInbox } = await import("@/components/messages/MessagesInbox");
  await act(async () =>
    root.render(createElement(MessagesInbox, { rows: [row("c1", "Maya")], currentUserId: "me", ...props } as never)),
  );
}
/** The hold menu, opened the way a right-click does on a laptop. */
async function menu(name = "Maya") {
  const link = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes(name))!;
  await act(async () => void link.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
}
const items = () => [...document.querySelectorAll("[data-sheet] button")].map((b) => b.textContent?.trim());
const tap = (label: string) =>
  act(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === label);
    if (!b) throw new Error(`no button "${label}"`);
    (b as HTMLButtonElement).click();
  });
const called = (fn: string) => rpc.calls.filter((c) => c.fn === fn);
async function search(text: string, pressEnter = true) {
  const input = host.querySelector('input[placeholder="Search messages"]') as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    set.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  if (pressEnter) await act(async () => void input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}

describe("what holding a chat offers", () => {
  it("in Messages: Lock chat", async () => {
    await open();
    await menu();
    expect(items()).toContain("Lock chat");
    expect(items()).not.toContain("Hide in Vault");
    expect(items()).not.toContain("Unlock chat");
  });

  it("in Locked chats: Hide in Vault, or Unlock", async () => {
    await open({ level: "locked" });
    await menu();
    expect(items()).toEqual(expect.arrayContaining(["Hide in Vault", "Unlock chat"]));
    expect(items()).not.toContain("Lock chat");
  });

  it("in the Vault: Unhide, or Unlock", async () => {
    await open({ level: "hidden" });
    await menu();
    expect(items()).toEqual(expect.arrayContaining(["Unhide", "Unlock chat"]));
    expect(items()).not.toContain("Hide in Vault");
  });

  it("does not offer to lock a request you have not accepted", async () => {
    await open({ rows: [row("c1", "Maya", { isRequest: true })] });
    // Requests sit on their own tab.
    await act(async () =>
      ([...host.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Requests")) as HTMLButtonElement).click(),
    );
    expect(host.textContent).toContain("Maya");
    await menu();
    // A request has its own actions and no hold menu at all.
    expect(items()).toEqual([]);
  });
});

describe("locking a chat", () => {
  it("asks the database, and has the list drawn again without it", async () => {
    await open();
    await menu();
    await tap("Lock chat");
    expect(called("set_chat_level")[0].args).toEqual({ p_conversation_id: "c1", p_level: "locked" });
    expect(toasts).toContain("Chat locked");
    expect(nav.refreshed).toBe(1);
  });

  it("has a PIN chosen first when there is none, then locks", async () => {
    let hasPin = false;
    rpc.answer = (fn) => {
      if (fn === "set_chat_level" && !hasPin) return { data: null, error: { message: "Set a PIN first" } };
      if (fn === "set_lock_pin") hasPin = true;
      return { data: null, error: null };
    };
    await open();
    await menu();
    await tap("Lock chat");
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Choose a PIN for locked chats");
    for (const round of [0, 1]) {
      void round;
      for (const d of "4821") await tap(d);
      await tap("Enter");
    }
    expect(called("set_lock_pin")[0].args).toEqual({ p_scope: "chat", p_pin: "4821" });
    // The same request again, now that there is a PIN.
    expect(called("set_chat_level")).toHaveLength(2);
    expect(toasts).toContain("Chat locked");
  });

  it("says what the database said when it refuses", async () => {
    rpc.answer = () => ({ data: null, error: { message: "Unlock your chats first" } });
    await open({ level: "locked" });
    await menu();
    await tap("Unlock chat");
    expect(toasts).toContain("Unlock your chats first");
    expect(nav.refreshed).toBe(0);
  });

  it("names each move for what it did", async () => {
    await open({ level: "locked" });
    await menu();
    await tap("Hide in Vault");
    expect(called("set_chat_level")[0].args).toEqual({ p_conversation_id: "c1", p_level: "hidden" });
    expect(toasts.at(-1)).toBe("Hidden in your Vault");
  });
});

describe("the Locked chats row in Messages", () => {
  const shown = () => host.querySelector("[data-locked-row]");

  it("is there when something is locked, with the count and the dot", async () => {
    await open({ vault: VAULT });
    expect(shown()?.textContent).toContain("2 chats");
    expect(shown()?.querySelector('[aria-label="Unread messages"]')).not.toBeNull();
  });

  it("is not there when nothing is locked", async () => {
    await open({ vault: { ...VAULT, locked: 0 } });
    expect(shown()).toBeNull();
  });

  it("stands aside while you are searching, and is never inside the locked list itself", async () => {
    await open({ vault: VAULT });
    await search("may", false);
    expect(shown()).toBeNull();
    await act(async () => root.unmount());
    root = createRoot(host);
    await open({ vault: VAULT, level: "locked" });
    expect(shown()).toBeNull();
  });

  it("shows a locked chat's last message to no list, unlocked or not", async () => {
    await open({ level: "locked", rows: [row("c1", "Maya", { lastKind: "locked", lastBody: null })] });
    expect(host.textContent).toContain("Open to read");
  });
});

describe("the Vault PIN, typed into search", () => {
  it("opens the Vault on Enter, and leaves no digits in the box", async () => {
    rpc.answer = (fn) => ({ data: fn === "unlock_vault" ? true : null, error: null });
    await open({ vault: VAULT });
    await search("4821");
    expect(called("unlock_vault")[0].args).toEqual({ p_pin: "4821" });
    expect(nav.pushed).toEqual(["/messages/vault"]);
    expect((host.querySelector('input[placeholder="Search messages"]') as HTMLInputElement).value).toBe("");
  });

  it("is only a search when the PIN is wrong: nothing says a door was tried", async () => {
    rpc.answer = () => ({ data: false, error: null });
    await open({ vault: VAULT });
    const before = host.querySelectorAll("button").length;
    await search("0000");
    expect(nav.pushed).toEqual([]);
    expect(toasts).toEqual([]);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelectorAll("button").length).toBe(before);
  });

  it("is not tried while typing, only on Enter", async () => {
    await open({ vault: VAULT });
    await search("4821", false);
    expect(called("unlock_vault")).toEqual([]);
  });

  it("is never tried for an ordinary search, or by someone with nothing hidden", async () => {
    await open({ vault: VAULT });
    await search("maya");
    await search("12");
    expect(called("unlock_vault")).toEqual([]);

    await act(async () => root.unmount());
    root = createRoot(host);
    await open({ vault: { ...VAULT, hidden: 0 } });
    await search("4821");
    expect(called("unlock_vault")).toEqual([]);
  });
});
