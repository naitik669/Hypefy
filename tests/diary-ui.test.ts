// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DiaryEntry } from "@/lib/diary";

/**
 * The Diary components as React runs them. The page needs a signed-in session
 * to open, so this is where the layout is checked: your card first, the
 * sketch's "Leave your Diary" when you have none, other people's after, and
 * the Messages badge counting only what you have not opened.
 */

// Nothing here should reach the network; the grid only needs a client to exist.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      }),
    }),
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const entry = (over: Partial<DiaryEntry>): DiaryEntry => ({
  userId: "u",
  text: "hello",
  audience: "mutual",
  createdAt: new Date().toISOString(),
  isSelf: false,
  name: "Aman",
  username: "aman",
  hue: 100,
  avatarUrl: null,
  track: null,
  ...over,
});

const me = { name: "Naitik", hue: 200, avatarUrl: null };

let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

async function render(el: ReturnType<typeof createElement>) {
  root = createRoot(host);
  await act(async () => root!.render(el));
}

describe("DiaryGrid", () => {
  it("offers 'Leave your Diary' first when you have not written one", async () => {
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    await render(
      createElement(DiaryGrid, {
        entries: [entry({ userId: "a", name: "Aman", text: "HDB" })],
        me,
        currentUserId: "me",
      })
    );
    const cards = [...host.querySelectorAll(".grid > *")];
    expect(cards[0].textContent).toContain("Leave your Diary");
    expect(cards[1].textContent).toContain("Aman");
    expect(cards[1].textContent).toContain("HDB");
  });

  it("shows your own Diary in your card instead", async () => {
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    await render(
      createElement(DiaryGrid, {
        entries: [entry({ userId: "me", isSelf: true, text: "mine today" })],
        me,
        currentUserId: "me",
      })
    );
    const first = host.querySelector(".grid > *")!;
    expect(first.textContent).toContain("You");
    expect(first.textContent).toContain("mine today");
    expect(host.textContent).not.toContain("Leave your Diary");
  });

  it("keeps the sketch's empty squares, with a line saying what goes there", async () => {
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    await render(createElement(DiaryGrid, { entries: [], me, currentUserId: "me" }));
    expect(host.querySelectorAll('.grid > [aria-hidden="true"]')).toHaveLength(3);
    expect(host.textContent).toContain("shows up here for 24");
  });

  it("rings what is new, then marks it seen for next time", async () => {
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    const a = entry({ userId: "a", createdAt: "2026-09-10T01:00:00Z" });
    await render(createElement(DiaryGrid, { entries: [a], me, currentUserId: "me" }));
    expect(host.querySelector('[aria-label="New"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("hypefy:diary:seen")!)).toEqual({
      a: "2026-09-10T01:00:00Z",
    });
  });
});

describe("DiaryButton", () => {
  it("counts only other people's Diaries you have not opened", async () => {
    const { DiaryButton } = await import("@/components/diary/DiaryButton");
    localStorage.setItem("hypefy:diary:seen", JSON.stringify({ a: "1" }));
    await render(
      createElement(DiaryButton, {
        diaries: [
          { userId: "a", createdAt: "1", isSelf: false }, // seen
          { userId: "b", createdAt: "1", isSelf: false }, // new
          { userId: "c", createdAt: "1", isSelf: false }, // new
          { userId: "me", createdAt: "1", isSelf: true }, // yours, never counted
        ],
      })
    );
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/messages/diary");
    expect(link.textContent).toBe("2");
    expect(link.getAttribute("aria-label")).toBe("Diary, 2 new");
  });

  it("shows no badge when there is nothing new", async () => {
    const { DiaryButton } = await import("@/components/diary/DiaryButton");
    await render(createElement(DiaryButton, { diaries: [] }));
    expect(host.querySelector("a")!.textContent).toBe("");
  });
});
