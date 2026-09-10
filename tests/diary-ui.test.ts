// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DiaryEntry } from "@/lib/diary";

/**
 * The Diary components as React runs them. The page needs a signed-in session
 * to open, so this is where the layout is checked: your page first — a blank
 * one to write on when you have none — other people's after, each page sized
 * and burning down by its own content and clock, and the Messages badge
 * counting only what you have not opened.
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
  it("offers a blank page to write on first, when you have not written one", async () => {
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    await render(
      createElement(DiaryGrid, {
        entries: [entry({ userId: "a", name: "Aman", text: "HDB" })],
        me,
        currentUserId: "me",
      })
    );
    const cards = [...host.querySelectorAll(".grid > *")];
    expect(cards[0].textContent).toContain("What's on your mind today?");
    expect(cards[0].textContent).toContain("Write");
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
    expect(host.textContent).not.toContain("What's on your mind today?");
  });

  it("keeps the sketch's empty pages, with a line saying whose go there", async () => {
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    await render(createElement(DiaryGrid, { entries: [], me, currentUserId: "me" }));
    expect(host.querySelectorAll('.grid > [aria-hidden="true"]')).toHaveLength(3);
    expect(host.textContent).toContain("their pages appear here");
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

describe("DiaryPage", () => {
  it("sets a short note large and a long one small, so each fills its page", async () => {
    const { DiaryPage } = await import("@/components/diary/DiaryPage");
    root = createRoot(host);
    await act(async () =>
      root!.render(
        createElement("div", null,
          createElement(DiaryPage, { entry: entry({ userId: "s", text: "HDB" }), label: "A" }),
          createElement(DiaryPage, {
            entry: entry({ userId: "l", text: "exams done. finally free. don't text me about syllabus ever again" }),
            label: "B",
          })
        )
      )
    );
    const [short, long] = [...host.querySelectorAll("p")].map((p) => parseFloat(p.style.fontSize));
    expect(short).toBeGreaterThan(long * 2);
  });

  it("burns down its bottom line as the day runs out", async () => {
    const { DiaryPage } = await import("@/components/diary/DiaryPage");
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    root = createRoot(host);
    await act(async () =>
      root!.render(
        createElement("div", null,
          createElement(DiaryPage, { entry: entry({ userId: "f", createdAt: hoursAgo(1) }), label: "Fresh" }),
          createElement(DiaryPage, { entry: entry({ userId: "o", createdAt: hoursAgo(20) }), label: "Old" })
        )
      )
    );
    const widths = [...host.querySelectorAll("span[aria-hidden]")]
      .map((s) => parseFloat((s as HTMLElement).style.width))
      .filter((w) => !Number.isNaN(w));
    expect(widths[0]).toBeGreaterThan(90);
    expect(widths[1]).toBeLessThan(20);
  });

  it("marks only what is new in lime, not every page", async () => {
    const { DiaryPage } = await import("@/components/diary/DiaryPage");
    root = createRoot(host);
    await act(async () =>
      root!.render(
        createElement("div", null,
          createElement(DiaryPage, { entry: entry({ userId: "n" }), label: "New", fresh: true }),
          createElement(DiaryPage, { entry: entry({ userId: "s" }), label: "Seen" })
        )
      )
    );
    expect(host.querySelectorAll('[aria-label="New"]')).toHaveLength(1);
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

describe("hydration", () => {
  it("renders the same on the server and in the browser", async () => {
    // Time-dependent text (hours left, the burn line) and browser-only state
    // (what you have already seen) are the usual ways a page like this ends
    // up drawn twice. Both are handled; this keeps them handled.
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const { DiaryGrid } = await import("@/components/diary/DiaryGrid");
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const props = {
      entries: [
        entry({ userId: "me", isSelf: true, text: "gym then chai", createdAt: hoursAgo(5) }),
        entry({ userId: "a", text: "HDB", createdAt: hoursAgo(1) }),
        entry({ userId: "b", text: "can't sleep, talk?", audience: "close", createdAt: hoursAgo(9) }),
      ],
      me,
      currentUserId: "me",
    };
    host.innerHTML = renderToString(createElement(DiaryGrid, props));

    const errors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(host, createElement(DiaryGrid, props), {
        onRecoverableError: (e) => errors.push(e),
      }) as unknown as Root;
    });
    expect(errors).toEqual([]);
  });
});
