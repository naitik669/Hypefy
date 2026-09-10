// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DiaryEntry, DiaryReaction } from "@/lib/diary";

/**
 * The Diary components as React runs them. The page needs a signed-in session
 * to open, so this is where the layout is checked — and the promise it makes:
 * one tap from Messages, then nothing else to tap to see what is there. Your
 * Diary with who reacted, everyone else's in full with reactions and reply on
 * the card, full-screen only as an extra. And the Messages badge counting only
 * what you have not opened.
 */

// Nothing here should reach the network; the page only needs a client to exist.
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

const reaction = (over: Partial<DiaryReaction>): DiaryReaction => ({
  userId: "r",
  emoji: "❤️",
  at: new Date().toISOString(),
  name: "Riya",
  username: "riya",
  hue: 40,
  avatarUrl: null,
  ...over,
});

const me = { name: "Naitik", hue: 200, avatarUrl: null };

const home = (over: Record<string, unknown> = {}) => ({
  entries: [] as DiaryEntry[],
  me,
  currentUserId: "me",
  reactionsOnMine: [] as DiaryReaction[],
  myReactions: {} as Record<string, string>,
  archiveCount: 0,
  ...over,
});

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
  document.body.style.overflow = "";
});

async function render(el: ReturnType<typeof createElement>) {
  root = createRoot(host);
  await act(async () => root!.render(el));
}

const button = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);
const click = async (el: Element | null) => {
  expect(el).not.toBeNull();
  await act(async () => (el as HTMLElement).click());
};

describe("DiaryHome", () => {
  it("shows everyone's Diary in full, with reactions and reply on the card, before any tap", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB" }),
          entry({ userId: "b", name: "Riya", text: "exams done. finally free. don't text me about syllabus" }),
        ],
      }))
    );
    const cards = [...host.querySelectorAll("article")];
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining("HDB"),
      // The longest note there is, whole — nothing clamped behind a "more".
      expect.stringContaining("exams done. finally free. don't text me about syllabus"),
    ]);
    for (const card of cards) {
      expect(card.querySelectorAll('button[aria-label^="React "]')).toHaveLength(6);
    }
    expect(button("Reply to Aman")).not.toBeNull();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("puts the page to write on right there when you have no Diary, folded until you tap it", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", text: "HDB" })] })));

    const field = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your Diary"]')!;
    expect(field.placeholder).toBe("What's on your mind today?");
    // Above everyone else's, and small enough at rest not to push them away.
    expect(field.compareDocumentPosition(host.querySelector("article")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).not.toContain("Post to Diary");

    await act(async () => field.focus());
    expect(host.textContent).toContain("Post to Diary");
  });

  it("shows your Diary with who reacted, by name, instead of the page to write on", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [entry({ userId: "me", isSelf: true, text: "gym then chai" })],
        reactionsOnMine: [
          reaction({ userId: "r", name: "Riya", emoji: "❤️" }),
          reaction({ userId: "d", name: "Dev", emoji: "😂" }),
          reaction({ userId: "k", name: "Kabir", emoji: "❤️" }),
        ],
      }))
    );
    const mine = host.querySelector("article")!;
    expect(mine.textContent).toContain("Your Diary");
    expect(mine.textContent).toContain("gym then chai");
    expect(mine.textContent).toContain("❤️ 2");
    expect(mine.textContent).toContain("3 reactions");
    // Each line ends "<name><emoji>" (the avatar's initial comes first).
    expect([...mine.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Riya❤️$/),
      expect.stringMatching(/Dev😂$/),
      expect.stringMatching(/Kabir❤️$/),
    ]);
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("says so on your Diary when nobody has reacted yet", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "me", isSelf: true })] })));
    expect(host.textContent).toContain("No reactions yet");
  });

  it("has your reaction already picked on a Diary you reacted to", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [entry({ userId: "a", name: "Aman" })],
        myReactions: { a: "😂" },
      }))
    );
    const pressed = [...host.querySelectorAll('[aria-pressed="true"]')].map((b) => b.textContent);
    expect(pressed).toEqual(["😂"]);
  });

  it("opens the reply field inside the card, not somewhere else", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman Verma" })] })));
    expect(host.querySelector("input")).toBeNull();
    await click(button("Reply to Aman"));
    const input = host.querySelector("article input") as HTMLInputElement;
    expect(input.placeholder).toBe("Reply to Aman…");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("marks what is new, then marks it seen for next time", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const a = entry({ userId: "a", createdAt: "2026-09-10T01:00:00Z" });
    await render(createElement(DiaryHome, home({ entries: [a] })));
    expect(host.querySelector('[aria-label="New"]')).not.toBeNull();
    expect(host.textContent).toContain("1 new");
    expect(JSON.parse(localStorage.getItem("hypefy:diary:seen")!)).toEqual({
      a: "2026-09-10T01:00:00Z",
    });
  });

  it("says whose Diaries go here when there are none, and still offers your past ones", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ archiveCount: 4 })));
    expect(host.textContent).toContain("When people you follow back write a Diary");
    expect(host.textContent).toContain("Past Diaries");
    expect(host.textContent).toContain("4 kept · only you can see them");
  });

  it("goes full-screen at the Diary you opened, steps with the arrow keys, and closes", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB" }),
          entry({ userId: "b", name: "Riya", text: "can't sleep" }),
        ],
      }))
    );
    await click(button("Open Riya's Diary full-screen"));
    const dialog = () => document.querySelector('[role="dialog"]');
    expect(dialog()?.getAttribute("aria-label")).toBe("Riya's Diary");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(dialog()?.getAttribute("aria-label")).toBe("Aman's Diary");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(dialog()).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes full-screen after the last Diary rather than looping", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("Open Aman's Diary full-screen"));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
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

describe("shortLeft", () => {
  it("never counts more than a day, even when the phone's clock runs behind", async () => {
    const { shortLeft } = await import("@/components/diary/DiaryPage");
    const now = Date.UTC(2026, 8, 11, 12);
    // Written "10 hours from now" by this phone's reckoning.
    expect(shortLeft(new Date(now + 10 * 3_600_000).toISOString(), now)).toBe("24h");
    expect(shortLeft(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe("21h");
    expect(shortLeft(new Date(now - 23.5 * 3_600_000).toISOString(), now)).toBe("30m");
    expect(shortLeft(new Date(now - 25 * 3_600_000).toISOString(), now)).toBe("now");
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
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const props = home({
      entries: [
        entry({ userId: "me", isSelf: true, text: "gym then chai", createdAt: hoursAgo(5) }),
        entry({ userId: "a", text: "HDB", createdAt: hoursAgo(1) }),
        entry({ userId: "b", text: "can't sleep, talk?", audience: "close", createdAt: hoursAgo(9) }),
      ],
      reactionsOnMine: [reaction({})],
      myReactions: { a: "❤️" },
      archiveCount: 2,
    });
    host.innerHTML = renderToString(createElement(DiaryHome, props));

    const errors: unknown[] = [];
    await act(async () => {
      root = hydrateRoot(host, createElement(DiaryHome, props), {
        onRecoverableError: (e) => errors.push(e),
      }) as unknown as Root;
    });
    expect(errors).toEqual([]);
  });
});
