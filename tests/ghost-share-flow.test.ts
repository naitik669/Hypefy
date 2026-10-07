// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GhostStatus } from "@/lib/ghost-share";

/**
 * Ghost Share, sending: choose one person, read what will happen, place it.
 * The sender is told it was placed, and is never shown anything after that.
 */

const rpc = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const native = vi.hoisted(() => ({ on: false }));

vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => toast }));
vi.mock("@/lib/overlay-shield", () => ({ useOverlayShield: () => {}, shieldProps: {} }));
vi.mock("@/lib/native", () => ({ isNative: () => native.on }));
vi.mock("@/lib/haptics", () => ({ haptics: { success: () => {}, select: () => {} } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const TARGETS = [
  { id: "u2", name: "Maya", username: "maya", avatar_hue: 100, avatar_url: null, already_this_week: false },
  { id: "u3", name: "Leo", username: "leo", avatar_hue: 120, avatar_url: null, already_this_week: true },
  { id: "u4", name: "Ada", username: "ada", avatar_hue: 140, avatar_url: null, already_this_week: false },
];
// Everything my_ghost_shares returns, and it is all it returns: no state.
const SENT = [
  {
    id: "g1",
    kind: "shot",
    content_id: "s1",
    created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    recipient_name: "Maya",
    recipient_username: "maya",
    recipient_hue: 100,
    recipient_avatar: null,
  },
];

let root: Root;
let host: HTMLDivElement;
let sendError: { message: string } | null;
const onClose = vi.fn();
const onPlaced = vi.fn();

const FREE: GhostStatus = { can: true, used: 0, allowed: 2, resetsAt: "2026-10-12T12:00:00Z" };

async function open(status: GhostStatus = FREE) {
  const { GhostShareFlow } = await import("@/components/ghost/GhostShareFlow");
  await act(async () =>
    root.render(createElement(GhostShareFlow, { kind: "shot", contentId: "s9", status, onClose, onPlaced })),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  native.on = false;
  sendError = null;
  for (const m of [rpc, toast, onClose, onPlaced]) m.mockReset();
  rpc.mockImplementation(async (fn: string) => {
    if (fn === "ghost_share_targets") return { data: TARGETS, error: null };
    if (fn === "my_ghost_shares") return { data: SENT, error: null };
    if (fn === "send_ghost_share") return { data: null, error: sendError };
    return { data: null, error: null };
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const flow = () => document.querySelector('[aria-label="Ghost Share"]') as HTMLElement;
const step = () => flow().getAttribute("data-ghost-step");
const text = () => flow().textContent ?? "";
const person = (name: string) =>
  [...flow().querySelectorAll('[role="radio"]')].find((b) => b.textContent?.includes(name)) as HTMLButtonElement;
const button = (label: string) =>
  [...flow().querySelectorAll("button, a")].find((b) => b.textContent?.trim().startsWith(label)) as HTMLElement;
const tap = (el: HTMLElement) =>
  act(async () => {
    el.click();
    await new Promise((r) => setTimeout(r, 10));
  });
const sends = () => rpc.mock.calls.filter(([fn]) => fn === "send_ghost_share");

describe("Ghost Share: choosing", () => {
  it("lists the people it can be placed for, and how many are left", async () => {
    await open();
    expect(step()).toBe("pick");
    expect(rpc).toHaveBeenCalledWith("ghost_share_targets", { p_kind: "shot", p_content_id: "s9" });
    expect(person("Maya")).toBeTruthy();
    expect(flow().querySelector("[data-ghost-left]")!.textContent).toBe("2 left this week");
  });

  it("will not go on until one person is chosen, and holds only one", async () => {
    await open();
    expect((button("Choose one person") as HTMLButtonElement).disabled).toBe(true);
    await tap(person("Maya"));
    await tap(person("Ada"));
    expect(person("Maya").getAttribute("aria-checked")).toBe("false");
    expect(person("Ada").getAttribute("aria-checked")).toBe("true");
    expect(button("Place in Ada's feed")).toBeTruthy();
  });

  it("shows someone already sent to this week, and does not let them be chosen", async () => {
    await open();
    expect(person("Leo").textContent).toContain("Already this week");
    expect(person("Leo").disabled).toBe(true);
  });

  it("says so when there is nobody it can be placed for", async () => {
    rpc.mockImplementation(async () => ({ data: [], error: null }));
    await open();
    expect(text()).toContain("people you follow who follow you back");
  });
});

describe("Ghost Share: confirming and placing", () => {
  async function toConfirm() {
    await open();
    await tap(person("Maya"));
    await tap(button("Place in Maya's feed"));
  }

  it("spends nothing until it is confirmed, and says what will happen first", async () => {
    await toConfirm();
    expect(step()).toBe("confirm");
    expect(sends()).toHaveLength(0);
    expect(text()).toContain("They won’t be told it was you");
    expect(text()).toContain("the next time they open Shots");
    expect(text()).toContain("Uses 1 of your 2 this week");
    // Whoever it is: no guessing at he or she.
    expect(text()).not.toMatch(/\b(she|he|her|his|him)\b/i);
  });

  it("gets out of the way once it has been explained three times", async () => {
    localStorage.setItem("hypefy_ghost_explained", "3");
    await toConfirm();
    expect(text()).toContain("They won’t be told. Uses 1 of your 2.");
    expect(text()).not.toContain("the next time they open");
  });

  it("goes back to choosing on Cancel, with nothing spent", async () => {
    await toConfirm();
    await tap(button("Cancel"));
    expect(step()).toBe("pick");
    expect(sends()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("places it for that one person, says Placed, and closes", async () => {
    await toConfirm();
    await tap(button("Place it"));
    expect(sends()).toEqual([["send_ghost_share", { p_kind: "shot", p_content_id: "s9", p_recipient: "u2" }]]);
    expect(toast).toHaveBeenCalledWith("Placed in Maya's feed", "success");
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("hypefy_ghost_explained")).toBe("1");
  });

  it("counts nothing as placed when the database refuses, and says why", async () => {
    sendError = { message: "Already this week" };
    await toConfirm();
    await tap(button("Place it"));
    expect(toast).toHaveBeenCalledWith("Already this week", "error");
    expect(onPlaced).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(step()).toBe("confirm");
    expect(localStorage.getItem("hypefy_ghost_explained")).toBeNull();
  });
});

describe("Ghost Share: what was sent", () => {
  it("says Placed, and nothing about what happened next", async () => {
    await open();
    await tap(button("Sent"));
    expect(step()).toBe("sent");
    const list = flow().querySelector(".overflow-y-auto")!.textContent ?? "";
    expect(list).toContain("To Maya");
    expect(list).toContain("Placed · 3h ago");
    expect(list).not.toMatch(/seen|watched|expired|opened|delivered|hyped|waiting/i);
  });
});

describe("Ghost Share: none left", () => {
  const SPENT: GhostStatus = { ...FREE, used: 2 };

  it("says when they come back instead of listing anyone", async () => {
    await open(SPENT);
    expect(step()).toBe("limit");
    expect(text()).toContain("That's both for this week");
    expect(text()).toMatch(/They come back on \w+day\./);
    expect(rpc.mock.calls.some(([fn]) => fn === "ghost_share_targets")).toBe(false);
  });

  it("mentions Premium on the web", async () => {
    await open(SPENT);
    expect(text()).toContain("Premium members get 5.");
    expect(button("See Premium").getAttribute("href")).toBe("/premium");
  });

  it("does not mention Premium in the app, where it cannot be bought", async () => {
    native.on = true;
    await open(SPENT);
    expect(text()).not.toContain("Premium");
  });

  it("does not offer Premium to someone who already has it", async () => {
    await open({ ...FREE, used: 5, allowed: 5 });
    expect(text()).toContain("That's all 5 for this week");
    expect(text()).not.toContain("Premium");
  });
});
