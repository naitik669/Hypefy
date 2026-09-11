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
  color: null,
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

// jsdom cannot play audio. Record what was asked to play and pause instead.
let played: string[] = [];
let paused = 0;
Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value(this: HTMLMediaElement) {
    played.push(this.src);
    return Promise.resolve();
  },
});
Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value() {
    paused++;
  },
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  rpcCalls.length = 0;
  played = [];
  paused = 0;
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
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  /** The card on top of the stack — the only one you can act on. */
  const topCard = () => host.querySelector<HTMLElement>('section[aria-roledescription="card stack"] article:not([inert])');
  const setValue = async (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
    act(async () => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
  const openComposer = () => click(document.querySelector(".grid button")); // the "Leave your Diary" tile

  it("stacks everyone's Diaries, the one on top whole and usable, the rest behind it", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", text: "exams done. finally free. don't text me about syllabus", createdAt: minsAgo(60) }),
          entry({ userId: "c", name: "Dev", text: "can't sleep", createdAt: minsAgo(120) }),
        ],
      }))
    );
    const cards = [...host.querySelectorAll("section[aria-roledescription='card stack'] article")];
    expect(cards).toHaveLength(3);
    // One on top; the others drawn behind it and out of reach.
    expect(cards.filter((c) => !c.hasAttribute("inert"))).toHaveLength(1);
    const top = topCard()!;
    expect(top.textContent).toContain("HDB");
    const emoji = [...top.querySelectorAll("button")].filter((b) => /^Send .+ to /.test(b.getAttribute("aria-label") ?? ""));
    expect(emoji).toHaveLength(6);
    // Reply is an arrow, not a field on the card.
    expect(top.querySelector('button[aria-label="Reply to Aman"]')).not.toBeNull();
    expect(top.querySelector("input")).toBeNull();
    // The longest note there is, whole, on the card behind — nothing clamped.
    expect(host.textContent).toContain("exams done. finally free. don't text me about syllabus");
    expect(host.textContent).toContain("1 of 3");
  });

  it("sends the top card to the back and brings the next up, and ‹ brings it back", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", text: "free", createdAt: minsAgo(60) }),
          entry({ userId: "c", name: "Dev", text: "can't sleep", createdAt: minsAgo(120) }),
        ],
      }))
    );
    await click(button("Next Diary"));
    await wait(300); // out to the side, then tucked in behind
    expect(topCard()!.textContent).toContain("Riya");
    expect(host.textContent).toContain("2 of 3");

    await click(button("Next Diary"));
    await wait(300);
    await click(button("Next Diary"));
    await wait(300);
    // Round again: Aman is back on top, having been at the back.
    expect(topCard()!.textContent).toContain("Aman");

    await click(button("Previous Diary"));
    expect(topCard()!.textContent).toContain("Dev");
  });

  it("sends an emoji to their DMs as a reply to their Diary, and keeps it on the Diary", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman Verma" })] })));
    await click(button("Send 😂 to Aman"));

    expect(rpcCalls.map((c) => c.fn)).toEqual(["react_to_note", "get_or_create_dm", "send_message"]);
    expect(rpcCalls[0].args).toEqual({ p_owner: "a", p_emoji: "😂" });
    expect(rpcCalls[2].args).toMatchObject({ p_conversation_id: "conv-1", p_body: "📔 Replied to your Diary: 😂" });
    // It went; a note says so, and nothing stays lit on the button.
    expect(host.textContent).toContain("Sent 😂 to Aman");
    expect(host.querySelector("[aria-pressed]")).toBeNull();
  });

  it("does not send the same emoji twice in a row", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("Send ❤️ to Aman"));
    await click(button("Send ❤️ to Aman"));
    expect(rpcCalls.filter((c) => c.fn === "send_message")).toHaveLength(1);
  });

  it("opens a reply popup from the arrow, sends it to their DMs, and closes", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman", text: "HDB" })] })));
    await click(button("Reply to Aman"));

    const popup = document.querySelector('[role="dialog"][aria-label="Reply to Aman\'s Diary"]')!;
    expect(popup.textContent).toContain("HDB"); // what you are replying to
    const input = popup.querySelector("input")!;
    expect(document.activeElement).toBe(input);

    await setValue(input, "same, chai?");
    await act(async () => input.form!.requestSubmit());
    expect(rpcCalls.at(-1)).toMatchObject({ fn: "send_message", args: { p_body: "📔 Replied to your Diary: same, chai?" } });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("Sent to your DMs with Aman");
  });

  it("plays the top card's song by itself, on its CD, and the next card's when it comes up", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const song = (id: string, title: string) => ({ id, title, artist: "X", artwork: `${id}.jpg`, preview: `${id}.mp3` });
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", track: song("t1", "Pasoori"), createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", createdAt: minsAgo(60) }),
          entry({ userId: "c", name: "Dev", track: song("t2", "Blinding Lights"), createdAt: minsAgo(120) }),
        ],
      }))
    );
    // Only the top card has its CD out, and it is already playing, on loop.
    const discs = () => [...document.querySelectorAll<HTMLButtonElement>("button[aria-pressed]")];
    expect(discs().map((d) => d.getAttribute("aria-label"))).toEqual(["Pause Pasoori by X"]);
    expect(discs()[0].querySelector("img")!.getAttribute("src")).toBe("t1.jpg"); // the cover in the middle
    expect(played.at(-1)).toContain("t1.mp3");

    await click(button("Next Diary")); // Riya: no song, so silence
    await wait(300);
    expect(discs()).toEqual([]);
    expect(paused).toBeGreaterThan(0);

    await click(button("Next Diary")); // Dev: his song starts
    await wait(300);
    expect(discs().map((d) => d.getAttribute("aria-label"))).toEqual(["Pause Blinding Lights by X"]);
    expect(played.at(-1)).toContain("t2.mp3");
  });

  it("draws each Diary in the colour its writer picked", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const { diaryTheme } = await import("@/components/diary/DiaryPage");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman", color: "plum" })] })));
    const top = topCard()!;
    // Compared through a probe: jsdom normalises the colours it is given.
    const probe = document.createElement("div");
    probe.style.background = diaryTheme("plum", 100).background;
    expect(top.style.background).toBe(probe.style.background);
  });

  it("lays every Diary out in a grid under the spotlight, yours first", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", text: "free", createdAt: minsAgo(60) }),
        ],
      }))
    );
    const grid = host.querySelector(".grid")!;
    expect(grid.compareDocumentPosition(topCard()!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect([...grid.children].map((t) => t.getAttribute("aria-label") ?? t.textContent)).toEqual([
      expect.stringContaining("Leave your Diary"),
      "Aman's Diary",
      "Riya's Diary",
    ]);
  });

  it("opens a Diary from the grid full-screen, at that Diary", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", createdAt: minsAgo(60) }),
        ],
      }))
    );
    await click(host.querySelector('.grid [aria-label="Riya\'s Diary"]'));
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Riya's Diary");
  });

  it("opens the page to write on from the blank tile in the grid", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", text: "HDB" })] })));
    expect(document.querySelector("textarea")).toBeNull();

    await openComposer();
    const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your Diary"]')!;
    expect(field.placeholder).toBe("What's on your mind today?");
    expect(document.body.textContent).toContain("Post to Diary");
    // A blank CD behind the page is how a song gets added.
    expect(button("Add a song")).not.toBeNull();
  });

  it("posts your Diary in the colour you pick", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home()));
    await openComposer();
    const field = document.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(button("Ink")!.getAttribute("aria-checked")).toBe("true");

    await click(button("Plum"));
    expect(button("Plum")!.getAttribute("aria-checked")).toBe("true");
    await setValue(field, "new playlist dropping");
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Post to Diary")!);
    expect(rpcCalls.find((c) => c.fn === "set_note")?.args).toMatchObject({
      p_text: "new playlist dropping",
      p_audience: "mutual",
      p_color: "plum",
    });
  });

  it("picks who can see it from a dropdown beside Post", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home()));
    await openComposer();

    const picker = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(picker.textContent).toBe("Mutuals");
    expect(document.querySelector('[role="menu"]')).toBeNull();

    await click(picker);
    const options = [...document.querySelectorAll('[role="menuitemradio"]')];
    expect(options.map((o) => [o.querySelector(".font-semibold")!.textContent, o.getAttribute("aria-checked")])).toEqual([
      ["Mutuals", "true"],
      ["Close friends", "false"],
    ]);
    await click(options[1]);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(picker.textContent).toBe("Close friends");
  });

  it("shows a tally of reactions on your tile, and who sent them when you open it", async () => {
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
    const tile = button("Your Diary")!;
    expect(tile.textContent).toContain("gym then chai");
    expect(tile.textContent).toContain("❤️2 😂1");

    await click(tile);
    const mine = document.querySelector("article")!;
    expect(mine.textContent).toContain("Your Diary");
    expect(mine.textContent).toContain("3 reactions");
    // Each line ends "<name><emoji>" (the avatar's initial comes first).
    expect([...mine.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      expect.stringMatching(/Riya❤️$/),
      expect.stringMatching(/Dev😂$/),
      expect.stringMatching(/Kabir❤️$/),
    ]);
  });

  it("says so on your Diary when nobody has reacted yet", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "me", isSelf: true })] })));
    await click(button("Your Diary"));
    expect(document.body.textContent).toContain("No reactions yet");
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
    await click(topCard()!.querySelector(`button[aria-label="Open Aman's Diary full-screen"]`));
    const dialog = () => document.querySelector('[role="dialog"]');
    expect(dialog()?.getAttribute("aria-label")).toBe("Aman's Diary");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(dialog()?.getAttribute("aria-label")).toBe("Riya's Diary");
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
