// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The three dots on Locked chats and on the Vault: moving several chats at
 * once, and bringing in chats that are not in the list yet.
 */

const nav = vi.hoisted(() => ({ refreshed: 0 }));
const toasts = vi.hoisted(() => [] as string[]);
const rpc = vi.hoisted(() => ({
  calls: [] as { fn: string; args?: Record<string, unknown> }[],
  answer: (): { data: unknown; error: { message: string } | null } => ({ data: null, error: null }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => { nav.refreshed += 1; }, push() {}, back() {} }) }));
vi.mock("@/lib/safe-back", () => ({ safeBack: () => {} }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => (m: string) => { toasts.push(m); } }));
vi.mock("@/components/ui/BottomSheet", () => ({
  BottomSheet: ({ children, open, title }: { children: React.ReactNode; open: boolean; title?: string }) =>
    open ? createElement("div", { "data-sheet": title }, children) : null,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      rpc.calls.push({ fn, args });
      return rpc.answer();
    },
  }),
}));

const chat = (id: string, name: string, isGroup = false) => ({ id, name, hue: 200, avatarUrl: null, isGroup });
const HERE = [chat("l1", "Maya"), chat("l2", "Ira")];
const OUTSIDE = [chat("n1", "Aman"), chat("n2", "Roof crew", true)];

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  nav.refreshed = 0;
  toasts.length = 0;
  rpc.calls.length = 0;
  rpc.answer = () => ({ data: null, error: null });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

async function open(level: "locked" | "hidden", here = HERE, outside = OUTSIDE) {
  const { VaultHeader } = await import("@/components/vault/VaultHeader");
  await act(async () => root.render(createElement(VaultHeader, { level, here, outside })));
}
const click = (el: Element | null | undefined) => act(async () => (el as HTMLButtonElement).click());
const button = (label: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
const dots = () => document.querySelector('[aria-label="More options"]');
const menu = () => [...document.querySelectorAll("[data-sheet] button")].map((b) => b.textContent?.trim());
// The name, not the initial the avatar draws beside it.
const choices = () => [...document.querySelectorAll('[role="checkbox"]')].map((b) => b.querySelector(".truncate")?.textContent);
const pick = (name: string) => click([...document.querySelectorAll('[role="checkbox"]')].find((b) => b.textContent?.includes(name)));
const moves = () => rpc.calls.filter((c) => c.fn === "set_chat_level").map((c) => `${c.args?.p_conversation_id}→${c.args?.p_level}`);

describe("the three dots", () => {
  it("on Locked chats: add, hide, unlock", async () => {
    await open("locked");
    await click(dots());
    expect(menu()).toEqual(["Add chats", "Hide chats", "Unlock chats"]);
  });

  it("on the Vault: add, unhide, unlock", async () => {
    await open("hidden");
    await click(dots());
    expect(menu()).toEqual(["Add chats to Vault", "Unhide chats", "Unlock chats"]);
  });

  it("does not offer a job there is nothing to do it to", async () => {
    await open("locked", [], []);
    await click(dots());
    for (const label of ["Add chats", "Hide chats", "Unlock chats"]) {
      expect((button(label) as HTMLButtonElement).disabled, label).toBe(true);
    }
  });
});

describe("adding more chats", () => {
  it("offers the chats that are not in the list yet, and locks the ones chosen", async () => {
    await open("locked");
    await click(dots());
    await click(button("Add chats"));
    expect(choices()).toEqual(["Aman", "Roof crew"]);
    // Nothing chosen: nothing to do.
    expect((button("Choose chats") as HTMLButtonElement).disabled).toBe(true);
    await pick("Aman");
    await pick("Roof crew");
    await click(button("Lock 2 chats"));
    expect(moves()).toEqual(["n1→locked", "n2→locked"]);
    expect(toasts).toEqual(["2 chats locked"]);
    expect(nav.refreshed).toBe(1);
  });

  it("puts them straight into the Vault when that is where you are", async () => {
    await open("hidden");
    await click(dots());
    await click(button("Add chats to Vault"));
    await pick("Aman");
    await click(button("Hide 1 chat"));
    expect(moves()).toEqual(["n1→hidden"]);
    expect(toasts).toEqual(["1 chat hidden in your Vault"]);
  });

  it("lets a choice be taken back before it is made", async () => {
    await open("locked");
    await click(dots());
    await click(button("Add chats"));
    await pick("Aman");
    await pick("Aman");
    expect(button("Choose chats")).toBeDefined();
    expect(moves()).toEqual([]);
  });
});

describe("moving chats already here", () => {
  it("hides the chosen locked chats in the Vault", async () => {
    await open("locked");
    await click(dots());
    await click(button("Hide chats"));
    expect(choices()).toEqual(["Maya", "Ira"]);
    await pick("Ira");
    await click(button("Hide 1 chat"));
    expect(moves()).toEqual(["l2→hidden"]);
  });

  it("unlocks the chosen chats back into Messages", async () => {
    await open("locked");
    await click(dots());
    await click(button("Unlock chats"));
    await pick("Maya");
    await pick("Ira");
    await click(button("Unlock 2 chats"));
    expect(moves()).toEqual(["l1→normal", "l2→normal"]);
    expect(toasts).toEqual(["2 chats unlocked"]);
  });

  it("brings chats out of the Vault into Locked chats", async () => {
    await open("hidden");
    await click(dots());
    await click(button("Unhide chats"));
    await pick("Maya");
    await click(button("Unhide 1 chat"));
    expect(moves()).toEqual(["l1→locked"]);
    expect(toasts).toEqual(["1 chat back in Locked chats"]);
  });

  it("stops at a refusal, says why, and reports what did move", async () => {
    let n = 0;
    rpc.answer = () => (++n === 2 ? { data: null, error: { message: "Unlock your chats first" } } : { data: null, error: null });
    await open("locked", [chat("l1", "Maya"), chat("l2", "Ira"), chat("l3", "Zoe")]);
    await click(dots());
    await click(button("Unlock chats"));
    await pick("Maya");
    await pick("Ira");
    await pick("Zoe");
    await click(button("Unlock 3 chats"));
    // The third is not attempted after the second is refused.
    expect(moves()).toEqual(["l1→normal", "l2→normal"]);
    expect(toasts).toEqual(["1 chat unlocked", "Unlock your chats first"]);
    expect(nav.refreshed).toBe(1);
  });
});
