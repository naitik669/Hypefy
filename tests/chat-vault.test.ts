// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  LOCKED_ROW_LINGER_MS,
  NO_VAULT,
  VAULT_HOLD_MS,
  clearVaultOpen,
  inMessages,
  levelOf,
  looksLikePin,
  markVaultOpen,
  toVaultOverview,
  vaultMarkedOpen,
} from "@/lib/chat-vault";

/**
 * Chat lock and the Vault.
 *
 * Locked chats sit behind a row at the top of Messages that does not stay;
 * hidden ones sit in a Vault with no button, reached by pulling Messages down
 * and holding, or by typing the PIN into search. One PIN, checked by the
 * server, which also decides what a page is sent.
 */

const nav = vi.hoisted(() => ({ path: "/messages", pushed: [] as string[], refreshed: 0 }));
const rpc = vi.hoisted(() => ({
  calls: [] as { fn: string; args?: Record<string, unknown> }[],
  answer: (fn: string, args?: Record<string, unknown>) => ({ data: null as unknown, error: null as unknown }),
}));
const stepUp = vi.hoisted(() => ({ ok: true, asked: 0 }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (to: string) => nav.pushed.push(to), refresh: () => { nav.refreshed += 1; }, back() {} }),
  usePathname: () => nav.path,
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
}));
vi.mock("@/lib/app-version", () => ({ reloadIfNewBuild: async () => {} }));
vi.mock("@/lib/safe-back", () => ({ safeBack: () => {} }));
const buzz = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/haptics", () => ({
  haptics: { tap() {}, select() {}, success: () => { buzz.push("success"); }, error: () => { buzz.push("error"); } },
}));
vi.mock("@/lib/overlay-shield", () => ({ shieldProps: {}, useOverlayShield: () => {}, useFrozenPage: () => {} }));
vi.mock("@/components/auth/StepUpDialog", () => ({
  useStepUp: () => ({
    requireStepUp: async () => { stepUp.asked += 1; return stepUp.ok; },
    stepUpDialog: null,
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpc.calls.push({ fn, args });
      return rpc.answer(fn, args);
    },
  }),
}));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  nav.path = "/messages";
  nav.pushed.length = 0;
  nav.refreshed = 0;
  rpc.calls.length = 0;
  rpc.answer = () => ({ data: null, error: null });
  stepUp.ok = true;
  stepUp.asked = 0;
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const called = (fn: string) => rpc.calls.filter((c) => c.fn === fn);
const tap = (label: string) =>
  act(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.trim() === label || x.getAttribute("aria-label") === label);
    if (!b) throw new Error(`no button "${label}"`);
    (b as HTMLButtonElement).click();
  });
/** The fourth digit sends the PIN; there is no Enter key. */
async function enter(digits: string) {
  for (const d of digits) await tap(d);
}

describe("the rules", () => {
  it("knows a chat's level from its two marks", () => {
    expect(levelOf({})).toBe("normal");
    expect(levelOf({ locked_at: "2026-10-06" })).toBe("locked");
    expect(levelOf({ locked_at: "2026-10-06", hidden_at: "2026-10-06" })).toBe("hidden");
    // Hidden is a kind of locked: without the lock it is nothing.
    expect(levelOf({ hidden_at: "2026-10-06" })).toBe("normal");
  });

  it("takes exactly four digits for a PIN", () => {
    for (const yes of ["1234", "0000", " 4821 "]) expect(looksLikePin(yes), yes).toBe(true);
    for (const no of ["123", "12345", "123456", "12a4", "", "12 34", "maya"]) expect(looksLikePin(no), no).toBe(false);
  });

  it("reads the overview the server sends, and nothing from a failed call", () => {
    expect(toVaultOverview([{ locked: 2, hidden: 1, unread: true, has_pin: true }])).toEqual({ locked: 2, hidden: 1, unread: true, hasPin: true });
    expect(toVaultOverview(null)).toEqual(NO_VAULT);
    expect(toVaultOverview([])).toEqual(NO_VAULT);
  });

  it("counts every Messages page as Messages, and nothing else", () => {
    for (const yes of ["/messages", "/messages/locked", "/messages/vault", "/messages/abc"]) expect(inMessages(yes), yes).toBe(true);
    for (const no of ["/home", "/messagesx", "/", null, undefined]) expect(inMessages(no), String(no)).toBe(false);
  });

  it("remembers, for this tab, that something is unlocked", () => {
    expect(vaultMarkedOpen()).toBe(false);
    markVaultOpen();
    expect(vaultMarkedOpen()).toBe(true);
    clearVaultOpen();
    expect(vaultMarkedOpen()).toBe(false);
  });
});

describe("the PIN pad", () => {
  async function pad(onSubmit: (pin: string) => Promise<boolean> | boolean) {
    const { PinPad } = await import("@/components/vault/PinPad");
    await act(async () => root.render(createElement(PinPad, { onSubmit })));
  }
  const entered = () => host.querySelectorAll("[data-pin-pad] .bg-accent").length;

  it("sends the PIN on the fourth digit, and not before", async () => {
    const got: string[] = [];
    await pad((p) => { got.push(p); return true; });
    await enter("123");
    expect(got).toEqual([]);
    await tap("4");
    expect(got).toEqual(["1234"]);
  });

  it("has four places and no Enter key", async () => {
    await pad(() => true);
    expect(host.querySelectorAll("[data-pin-pad] [aria-label$='digits entered'] span")).toHaveLength(4);
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Enter");
  });

  it("takes no fifth digit", async () => {
    const got: string[] = [];
    await pad((p) => { got.push(p); return false; });
    // A refusal clears the pad, so the fifth press starts a new PIN.
    await enter("12345");
    expect(got).toEqual(["1234"]);
    expect(entered()).toBe(1);
  });

  it("clears itself after a refusal, so the next try starts clean", async () => {
    await pad(() => false);
    await enter("1234");
    expect(entered()).toBe(0);
  });

  it("can be typed on a keyboard", async () => {
    const got: string[] = [];
    await pad((p) => { got.push(p); return true; });
    for (const key of ["4", "8", "x", "9", "Backspace", "2", "1"]) {
      await act(async () => void window.dispatchEvent(new KeyboardEvent("keydown", { key })));
    }
    expect(got).toEqual(["4821"]);
  });
});

describe("choosing a PIN", () => {
  async function setup(reason: "first" | "change" | "reset" = "first") {
    const { ChatPinSetup } = await import("@/components/vault/ChatPinSetup");
    const done: string[] = [];
    await act(async () => root.render(createElement(ChatPinSetup, { reason, onDone: (p: string) => done.push(p), onClose() {} })));
    return done;
  }

  it("asks twice, and sets it only when both agree", async () => {
    const done = await setup();
    await enter("4821");
    expect(document.body.textContent).toContain("Enter it again");
    expect(called("set_lock_pin")).toHaveLength(0);
    await enter("4821");
    expect(called("set_lock_pin")[0].args).toEqual({ p_scope: "chat", p_pin: "4821" });
    expect(done).toEqual(["4821"]);
  });

  it("starts over when the two do not match", async () => {
    const done = await setup();
    await enter("4821");
    await enter("4822");
    expect(called("set_lock_pin")).toHaveLength(0);
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/didn't match/);
    expect(done).toEqual([]);
  });

  it("says why when the database refuses", async () => {
    rpc.answer = () => ({ data: null, error: { message: "Unlock your chats, or confirm your password, to change this PIN" } });
    const done = await setup("change");
    await enter("4821");
    await enter("4821");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("confirm your password");
    expect(done).toEqual([]);
  });
});

describe("the door", () => {
  async function gate() {
    const { VaultGate } = await import("@/components/vault/VaultGate");
    await act(async () => root.render(createElement(VaultGate, { title: "Locked chats" })));
  }

  it("opens on the right PIN: the server is told, and the page is drawn again", async () => {
    rpc.answer = (fn) => ({ data: fn === "unlock_vault" ? true : null, error: null });
    await gate();
    await enter("4821");
    expect(called("unlock_vault")[0].args).toEqual({ p_pin: "4821" });
    expect(nav.refreshed).toBe(1);
    expect(vaultMarkedOpen()).toBe(true);
  });

  it("stays shut on a wrong one, and says so", async () => {
    rpc.answer = () => ({ data: false, error: null });
    await gate();
    await enter("0000");
    expect(document.querySelector('[role="alert"]')?.textContent).toBe("Wrong PIN");
    expect(nav.refreshed).toBe(0);
    expect(vaultMarkedOpen()).toBe(false);
  });

  it("passes on the server's own words when there have been too many tries", async () => {
    rpc.answer = () => ({ data: null, error: { message: "Too many attempts. Try again in a few minutes." } });
    await gate();
    await enter("0000");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Too many attempts");
  });

  it("resets a forgotten PIN only after proof of who you are", async () => {
    stepUp.ok = false;
    await gate();
    await tap("Forgot PIN?");
    expect(stepUp.asked).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    stepUp.ok = true;
    rpc.answer = (fn) => ({ data: fn === "unlock_vault" ? true : null, error: null });
    await tap("Forgot PIN?");
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Choose a new PIN");
    // Two pads are on screen now; the new PIN goes into the one in front.
    const front = () => document.querySelector('[role="dialog"]')!;
    const press = (label: string) =>
      act(async () => ([...front().querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement).click());
    for (const round of [0, 1]) {
      void round;
      for (const d of "9173") await press(d);
    }
    expect(called("set_lock_pin")[0].args).toEqual({ p_scope: "chat", p_pin: "9173" });
    // And straight in with it.
    expect(called("unlock_vault").at(-1)?.args).toEqual({ p_pin: "9173" });
  });
});

describe("the Locked chats row", () => {
  async function row(props: { count: number; unread: boolean } = { count: 2, unread: false }) {
    vi.useFakeTimers();
    const { LockedChatsRow } = await import("@/components/vault/LockedChatsRow");
    await act(async () =>
      root.render(createElement("div", null, createElement(LockedChatsRow, props), createElement("p", { id: "list" }, "chats"))),
    );
  }
  const state = () => host.querySelector("[data-locked-row]")?.getAttribute("data-locked-row");

  it("is there when Messages opens, saying how many and never who", async () => {
    await row({ count: 2, unread: true });
    expect(state()).toBe("shown");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/messages/locked");
    expect(host.textContent).toContain("2 chats");
    expect(host.querySelector('[aria-label="Unread messages"]')).not.toBeNull();
  });

  it("goes away by itself after a few seconds of nothing", async () => {
    await row();
    await act(async () => { vi.advanceTimersByTime(LOCKED_ROW_LINGER_MS - 100); });
    expect(state()).toBe("shown");
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(state()).toBe("hidden");
  });

  it("goes away when the list is touched, but not when the row itself is", async () => {
    await row();
    await act(async () => void host.querySelector("a")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(state()).toBe("shown");
    await act(async () => void document.getElementById("list")!.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(state()).toBe("hidden");
  });

  it("goes away when the list is scrolled", async () => {
    await row();
    Object.defineProperty(window, "scrollY", { value: 40, configurable: true });
    await act(async () => void window.dispatchEvent(new Event("scroll")));
    expect(state()).toBe("hidden");
  });

  it("comes back on a pull, and lingers again", async () => {
    const { PULL_EVENT } = await import("@/components/ui/PullToRefresh");
    await row();
    await act(async () => { vi.advanceTimersByTime(LOCKED_ROW_LINGER_MS + 100); });
    expect(state()).toBe("hidden");
    await act(async () => void window.dispatchEvent(new Event(PULL_EVENT)));
    expect(state()).toBe("shown");
    await act(async () => { vi.advanceTimersByTime(LOCKED_ROW_LINGER_MS + 100); });
    expect(state()).toBe("hidden");
  });
});

describe("pull, and keep holding", () => {
  async function mount(holdTo?: string) {
    vi.useFakeTimers();
    const { PullToRefresh } = await import("@/components/ui/PullToRefresh");
    await act(async () => root.render(createElement(PullToRefresh, { holdTo } as never, createElement("p", { id: "inbox" }, "inbox"))));
  }
  async function touch(type: string, x: number, y: number) {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "touches", { value: type === "touchend" ? [] : [{ clientX: x, clientY: y }] });
    await act(async () => void document.getElementById("inbox")!.dispatchEvent(e));
  }
  /** A pull to full stretch. */
  async function pullAllTheWay() {
    await touch("touchstart", 200, 100);
    await touch("touchmove", 201, 130);
    await touch("touchmove", 202, 400);
  }

  it("opens the Vault when held at full stretch, and does not also refresh", async () => {
    await mount("/messages/vault");
    await pullAllTheWay();
    expect(host.querySelector("[data-pull-hold]")).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS + 20); });
    expect(nav.pushed).toEqual(["/messages/vault"]);
    await touch("touchend", 202, 400);
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(nav.refreshed).toBe(0);
    expect(nav.pushed).toHaveLength(1);
  });

  it("is an ordinary refresh when let go before the hold is up", async () => {
    await mount("/messages/vault");
    await pullAllTheWay();
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS - 200); });
    await touch("touchend", 202, 400);
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS); });
    expect(nav.pushed).toEqual([]);
    expect(nav.refreshed).toBe(1);
  });

  it("starts counting again if the pull eases off and comes back", async () => {
    await mount("/messages/vault");
    await pullAllTheWay();
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS - 100); });
    await touch("touchmove", 202, 200);
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS); });
    expect(nav.pushed).toEqual([]);
    await touch("touchmove", 202, 400);
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS + 20); });
    expect(nav.pushed).toEqual(["/messages/vault"]);
  });

  it("is only ever a refresh for someone with nothing hidden", async () => {
    await mount(undefined);
    await pullAllTheWay();
    expect(host.querySelector("[data-pull-hold]")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS * 3); });
    expect(nav.pushed).toEqual([]);
  });

  it("never fires on a sideways swipe between tabs", async () => {
    await mount("/messages/vault");
    await touch("touchstart", 300, 100);
    await touch("touchmove", 270, 104);
    await touch("touchmove", 60, 400);
    await act(async () => { vi.advanceTimersByTime(VAULT_HOLD_MS * 3); });
    expect(nav.pushed).toEqual([]);
  });
});

describe("locking up behind you", () => {
  async function mount(path: string) {
    nav.path = path;
    window.history.replaceState(null, "", path);
    const { VaultAutoLock } = await import("@/components/vault/VaultAutoLock");
    await act(async () => root.render(createElement(VaultAutoLock, { key: path })));
  }
  async function go(path: string) {
    nav.path = path;
    window.history.replaceState(null, "", path);
    const { VaultAutoLock } = await import("@/components/vault/VaultAutoLock");
    await act(async () => root.render(createElement(VaultAutoLock)));
  }

  it("does nothing at all when nothing was unlocked", async () => {
    await mount("/home");
    expect(rpc.calls).toEqual([]);
  });

  it("stays unlocked while you move about inside Messages", async () => {
    markVaultOpen();
    await mount("/messages/locked");
    await go("/messages/some-chat");
    await go("/messages");
    expect(called("lock_vault")).toHaveLength(0);
    expect(vaultMarkedOpen()).toBe(true);
  });

  it("locks when you leave Messages", async () => {
    markVaultOpen();
    await mount("/messages/locked");
    await go("/home");
    expect(called("lock_vault")).toHaveLength(1);
    expect(vaultMarkedOpen()).toBe(false);
  });

  it("locks when you step out of the Vault to the inbox, and has the inbox drawn again", async () => {
    markVaultOpen();
    await mount("/messages/vault");
    await go("/messages/a-hidden-chat");
    expect(called("lock_vault")).toHaveLength(0);
    await go("/messages/vault");
    await go("/messages");
    expect(called("lock_vault")).toHaveLength(1);
    expect(nav.refreshed).toBe(1);
  });

  it("locks when you come back after the app has been out of sight a while, not for a moment", async () => {
    const { AWAY_MS } = await import("@/components/vault/VaultAutoLock");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T10:00:00Z"));
    markVaultOpen();
    await mount("/messages/a-locked-chat");
    const visibility = async (state: string) => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
      await act(async () => void document.dispatchEvent(new Event("visibilitychange")));
    };
    // The photo picker: hidden for a few seconds, and still open on return.
    await visibility("hidden");
    vi.setSystemTime(Date.now() + 5000);
    await visibility("visible");
    expect(called("lock_vault")).toHaveLength(0);
    // Put down and picked up later.
    await visibility("hidden");
    vi.setSystemTime(Date.now() + AWAY_MS + 1000);
    await visibility("visible");
    expect(called("lock_vault")).toHaveLength(1);
  });
});

describe("what the server sends while locked", () => {
  it("draws the door for a locked chat, and puts nothing of the chat in the page", async () => {
    const asked: string[] = [];
    // Everything a chat needs comes back from the database, as it would.
    const rows = (data: unknown) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "in", "neq"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data }).then(ok);
      return q;
    };
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        rpc: async (fn: string) => {
          asked.push(`rpc:${fn}`);
          if (fn === "my_chat_levels") return { data: [{ conversation_id: "c1", level: "locked" }] };
          if (fn === "vault_unlocked") return { data: false };
          return { data: null };
        },
        from: (table: string) => {
          asked.push(`from:${table}`);
          if (table === "messages") return rows([{ id: "m1", body: "the secret plan", sender_id: "maya" }]);
          if (table === "conversation_members") return rows([{ user_id: "me" }, { user_id: "maya", profiles: { display_name: "Maya" } }]);
          return rows({ type: "direct", title: null });
        },
        auth: { getUser: async () => { asked.push("user"); return { data: { user: { id: "me" } } }; } },
      }),
    }));
    const { default: ThreadPage } = await import("@/app/(app)/messages/[threadId]/page");
    const { VaultGate } = await import("@/components/vault/VaultGate");
    const out = (await ThreadPage({ params: Promise.resolve({ threadId: "c1" }) })) as { type: unknown; props: unknown };
    expect(out.type).toBe(VaultGate);
    // The door carries a title and nothing else: no name, no message.
    expect(JSON.stringify(out.props)).toBe('{"title":"This chat is locked"}');
    expect(asked).toContain("rpc:vault_unlocked");
    vi.doUnmock("@/lib/supabase/server");
  });

  it("draws the door for the locked list and for the Vault, with no rows behind it", async () => {
    vi.resetModules();
    const asked: string[] = [];
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        rpc: async (fn: string) => { asked.push(fn); return { data: fn === "vault_unlocked" ? false : null }; },
        from: () => { throw new Error("asked for a table while locked"); },
        auth: { getUser: async () => ({ data: { user: { id: "me" } } }) },
      }),
    }));
    const { VaultGate } = await import("@/components/vault/VaultGate");
    for (const path of ["@/app/(app)/messages/locked/page", "@/app/(app)/messages/vault/page"]) {
      const { default: Page } = (await import(path)) as { default: () => Promise<{ type: unknown }> };
      expect((await Page()).type, path).toBe(VaultGate);
    }
    // Not even the count of what is behind it.
    expect(asked).not.toContain("vault_overview");
    expect(asked).not.toContain("my_chat_levels");
    vi.doUnmock("@/lib/supabase/server");
  });
});

describe("the Vault's own door", () => {
  async function box() {
    const { VaultGate } = await import("@/components/vault/VaultGate");
    await act(async () => root.render(createElement(VaultGate, { title: "Vault", look: "case" })));
  }
  const state = () => host.querySelector("[data-vault-case]")?.getAttribute("data-vault-case");

  it("is a strongbox with the PIN entered on its front", async () => {
    await box();
    expect(host.querySelector("[data-vault-case] h1")?.textContent).toBe("VAULT");
    // The pad is inside the box, wearing its steel, with the prompt on it.
    expect(host.querySelector('[data-vault-case] [data-pin-pad="case"]')).not.toBeNull();
    expect(host.querySelector("[data-vault-case]")?.textContent).toContain("Enter your PIN");
  });

  it("answers the right PIN with a buzz and a green lamp, then the list", async () => {
    const { CASE_OPEN_MS } = await import("@/components/vault/VaultGate");
    vi.useFakeTimers();
    buzz.length = 0;
    rpc.answer = (fn) => ({ data: fn === "unlock_vault" ? true : null, error: null });
    await box();
    expect(state()).toBe("off");
    await enter("4821");
    expect(state()).toBe("green");
    expect(buzz).toEqual(["success"]);
    expect(vaultMarkedOpen()).toBe(true);
    // The lamp is seen before the box is replaced.
    expect(nav.refreshed).toBe(0);
    await act(async () => { vi.advanceTimersByTime(CASE_OPEN_MS + 10); });
    expect(nav.refreshed).toBe(1);
  });

  it("answers a wrong PIN with a buzz and a red lamp that goes out, and stays shut", async () => {
    const { CASE_REFUSE_MS } = await import("@/components/vault/VaultGate");
    vi.useFakeTimers();
    buzz.length = 0;
    rpc.answer = () => ({ data: false, error: null });
    await box();
    await enter("0000");
    expect(state()).toBe("red");
    expect(buzz).toEqual(["error"]);
    expect(host.querySelector('[data-vault-case] [role="alert"]')?.textContent).toBe("Wrong PIN");
    await act(async () => { vi.advanceTimersByTime(CASE_REFUSE_MS + 10); });
    expect(state()).toBe("off");
    expect(nav.refreshed).toBe(0);
  });

  it("does not move: no entrance, no shake, no falling away", async () => {
    const css = (await import("node:fs")).readFileSync("src/components/vault/vault.module.css", "utf8");
    expect(css).not.toMatch(/@keyframes|animation\s*:|transform\s*:/);
  });

  it("is the Vault's alone: locked chats keep the plain pad", async () => {
    const { VaultGate } = await import("@/components/vault/VaultGate");
    await act(async () => root.render(createElement(VaultGate, { title: "Locked chats" })));
    expect(host.querySelector("[data-vault-case]")).toBeNull();
    expect(host.querySelector('[data-pin-pad="plain"]')).not.toBeNull();
    const src = (await import("node:fs")).readFileSync("src/app/(app)/messages/vault/page.tsx", "utf8");
    expect(src).toContain('<VaultGate title="Vault" look="case" />');
    expect((await import("node:fs")).readFileSync("src/app/(app)/messages/locked/page.tsx", "utf8")).not.toContain('look="case"');
  });
});
