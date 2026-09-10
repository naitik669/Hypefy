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

// Nothing here reaches the network: RPCs are recorded, and a DM conversation
// always exists, so what a tap sends can be read back.
const rpcCalls = vi.hoisted(() => [] as { fn: string; args: Record<string, unknown> }[]);
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: fn === "get_or_create_dm" ? "conv-1" : null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back() {}, push() {}, replace() {} }),
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
  rpcCalls.length = 0;
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
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: new Date(Date.now() - 60_000).toISOString() }),
          entry({
            userId: "b",
            name: "Riya",
            text: "exams done. finally free. don't text me about syllabus",
            createdAt: new Date(Date.now() - 3_600_000).toISOString(),
          }),
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
      const emoji = [...card.querySelectorAll("button")].filter((b) => /^Send .+ to /.test(b.getAttribute("aria-label") ?? ""));
      expect(emoji).toHaveLength(6);
    }
    // The reply field is there at rest — no button to open it first.
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Reply to Aman"]')?.placeholder).toBe("Reply to Aman…");
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it("sends an emoji to their DMs as a reply to their Diary, and keeps it on the Diary", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman Verma" })] })));
    await click(button("Send 😂 to Aman"));

    expect(rpcCalls.map((c) => c.fn)).toEqual(["react_to_note", "get_or_create_dm", "send_message"]);
    expect(rpcCalls[0].args).toEqual({ p_owner: "a", p_emoji: "😂" });
    expect(rpcCalls[2].args).toMatchObject({ p_conversation_id: "conv-1", p_body: "📔 Replied to your Diary: 😂" });
    // It went; nothing stays lit on the button.
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Reply to Aman"]')!.placeholder).toBe(
      "Sent 😂 to Aman · in your DMs"
    );
    expect(host.querySelector("[aria-pressed]")).toBeNull();
  });

  it("does not send the same emoji twice in a row", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("Send ❤️ to Aman"));
    await click(button("Send ❤️ to Aman"));
    expect(rpcCalls.filter((c) => c.fn === "send_message")).toHaveLength(1);
  });

  it("sends a typed reply to their DMs with the same prefix", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Reply to Aman"]')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "same, chai?");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.form!.requestSubmit());
    expect(rpcCalls.at(-1)).toMatchObject({ fn: "send_message", args: { p_body: "📔 Replied to your Diary: same, chai?" } });
    expect(input.value).toBe("");
  });

  it("tucks a CD behind a Diary with a song, and none behind one without", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const track = { id: "t1", title: "Pasoori", artist: "Ali Sethi", artwork: "", preview: "x.mp3" };
    await render(
      createElement(DiaryHome, home({
        entries: [entry({ userId: "me", isSelf: true }), entry({ userId: "a", name: "Aman", track }), entry({ userId: "b", name: "Riya" })],
      }))
    );
    expect(document.querySelectorAll('button[aria-label="Play Pasoori by Ali Sethi"]')).toHaveLength(1);
    expect(host.textContent).toContain("Pasoori · Ali Sethi");
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
    // A blank CD behind the page is how a song gets added.
    expect(button("Add a song")).not.toBeNull();
  });

  it("picks who can see it from a dropdown beside Post", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home()));
    await act(async () => host.querySelector("textarea")!.focus());

    const picker = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(picker.textContent).toBe("Mutuals");
    expect(host.querySelector('[role="menu"]')).toBeNull();

    await click(picker);
    const options = [...host.querySelectorAll('[role="menuitemradio"]')];
    expect(options.map((o) => [o.querySelector(".font-semibold")!.textContent, o.getAttribute("aria-checked")])).toEqual([
      ["Mutuals", "true"],
      ["Close friends", "false"],
    ]);
    await click(options[1]);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(picker.textContent).toBe("Close friends");
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

  it("does not resend the emoji you already sent to that Diary on an earlier visit", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [entry({ userId: "a", name: "Aman" })],
        myReactions: { a: "😂" },
      }))
    );
    await click(button("Send 😂 to Aman"));
    expect(rpcCalls).toEqual([]);
    await click(button("Send 🥰 to Aman"));
    expect(rpcCalls.filter((c) => c.fn === "send_message")).toHaveLength(1);
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

  it("says whose Diaries go here when there are none, and keeps your past ones in the top-right box", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ archiveCount: 4 })));
    expect(host.textContent).toContain("When people you follow back write a Diary");
    const past = button("Past Diaries, 4 kept")!;
    expect(past.closest("header")).not.toBeNull();
    expect(past.textContent).toBe("Past4");
  });

  it("goes full-screen at the Diary you opened, steps with the arrow keys, and closes", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: new Date(Date.now() - 60_000).toISOString() }),
          entry({ userId: "b", name: "Riya", text: "can't sleep", createdAt: new Date(Date.now() - 3_600_000).toISOString() }),
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
