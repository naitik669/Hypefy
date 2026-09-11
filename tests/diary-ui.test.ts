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
  /** Move the deck on, the way a keyboard does it — there are no buttons for it. */
  const swipe = (key: "ArrowRight" | "ArrowLeft") =>
    act(async () => {
      host
        .querySelector('[aria-keyshortcuts="ArrowLeft ArrowRight"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  const openComposer = () => act(async () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your page"]')!.focus());

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
    expect(host.textContent).toContain("1/3");
  });

  it("sends the top card to the back and brings the next up, and back again the other way", async () => {
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
    await swipe("ArrowRight");
    await wait(300); // out to the side, then tucked in behind
    expect(topCard()!.textContent).toContain("Riya");
    expect(host.textContent).toContain("2/3");

    await swipe("ArrowRight");
    await wait(300);
    await swipe("ArrowRight");
    await wait(300);
    // Round again: Aman is back on top, having been at the back.
    expect(topCard()!.textContent).toContain("Aman");

    await swipe("ArrowLeft");
    expect(topCard()!.textContent).toContain("Dev");
  });

  it("sends an emoji to their DMs as a reply to their page, and keeps it on the page", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman Verma" })] })));
    await click(button("Send 😂 to Aman"));

    expect(rpcCalls).toEqual([
      { fn: "react_to_note", args: { p_owner: "a", p_emoji: "😂" } },
      // The server copies the page into the message; the client sends only this.
      { fn: "send_page_reply", args: { p_owner: "a", p_body: "😂" } },
    ]);
    // It went; a note says so, and nothing stays lit on the button.
    expect(host.textContent).toContain("Sent");
    expect(host.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it("hypes a page with the star, silently, and takes it back with a second tap", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("Hype Aman's page"));
    expect(rpcCalls).toEqual([{ fn: "toggle_note_hype", args: { p_owner: "a" } }]);
    const star = button("Hyped Aman's page")!;
    expect(star.getAttribute("aria-pressed")).toBe("true");

    await click(star);
    expect(button("Hype Aman's page")!.getAttribute("aria-pressed")).toBe("false");
    // No DM, no reaction: a hype is only a star.
    expect(rpcCalls.map((c) => c.fn)).toEqual(["toggle_note_hype", "toggle_note_hype"]);
  });

  it("shows your hype already on a page you hyped before", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })], myHypes: ["a"] })));
    expect(button("Hyped Aman's page")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not send the same emoji twice in a row", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("Send ❤️ to Aman"));
    await click(button("Send ❤️ to Aman"));
    expect(rpcCalls.filter((c) => c.fn === "send_page_reply")).toHaveLength(1);
  });

  it("opens a reply popup from the arrow, sends it to their DMs, and closes", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman", text: "HDB" })] })));
    await click(button("Reply to Aman"));

    const popup = document.querySelector('[role="dialog"][aria-label="Reply to Aman\'s page"]')!;
    expect(popup.textContent).toContain("HDB"); // what you are replying to
    const input = popup.querySelector("input")!;
    expect(document.activeElement).toBe(input);

    await setValue(input, "same, chai?");
    await act(async () => input.form!.requestSubmit());
    expect(rpcCalls.at(-1)).toEqual({ fn: "send_page_reply", args: { p_owner: "a", p_body: "same, chai?" } });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain("Sent");
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
    // The deck's CD — the list's cards have their own, which wait to be tapped.
    const discs = () => [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[aria-roledescription="card stack"] button[aria-label^="Pause "], [aria-roledescription="card stack"] button[aria-label^="Play "]'
      ),
    ];
    expect(discs().map((d) => d.getAttribute("aria-label"))).toEqual(["Pause Pasoori by X"]);
    expect(discs()[0].querySelector("img")!.getAttribute("src")).toBe("t1.jpg"); // the cover in the middle
    expect(played.at(-1)).toContain("t1.mp3");

    await swipe("ArrowRight"); // Riya: no song, so silence
    await wait(300);
    expect(discs()).toEqual([]);
    expect(paused).toBeGreaterThan(0);

    await swipe("ArrowRight"); // Dev: his song starts
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

  /** The cards in the list under the spotlight, in order. */
  const listCards = () =>
    [...host.querySelectorAll<HTMLElement>("article")].filter((a) => !a.closest('[aria-roledescription="card stack"]'));

  it("gives the spotlight the whole first screen, and lists every page one to a row under it", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "me", isSelf: true, text: "gym then chai" }),
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", text: "free", createdAt: minsAgo(60) }),
        ],
      }))
    );
    const spotlight = host.querySelector<HTMLElement>('section[aria-label="Spotlight"]')!;
    expect(spotlight.style.minHeight).toContain("100dvh");
    expect(spotlight.querySelector('[aria-roledescription="card stack"]')).not.toBeNull();

    // Yours first, then everyone's — whole cards, each usable where it lies.
    const cards = listCards();
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining("gym then chai"),
      expect.stringContaining("HDB"),
      expect.stringContaining("free"),
    ]);
    expect(cards[0].compareDocumentPosition(spotlight) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(cards[1].querySelector('button[aria-label="Hype Aman\'s page"]')).not.toBeNull();
    expect(cards[1].querySelector('button[aria-label="Reply to Aman"]')).not.toBeNull();
  });

  it("opens a page from the list full-screen, at that page", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", createdAt: minsAgo(60) }),
        ],
      }))
    );
    await click(listCards()[1].querySelector(`button[aria-label="Open Riya's page full-screen"]`));
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Riya's page");
  });

  it("puts the page to write on in the list when you have none, folded until you tap it", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", text: "HDB" })] })));
    const field = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Your page"]')!;
    expect(field.placeholder).toBe("What's on your mind today?");
    expect([...document.querySelectorAll("button")].some((b) => b.textContent === "Post")).toBe(false);

    await openComposer();
    expect([...document.querySelectorAll("button")].some((b) => b.textContent === "Post")).toBe(true);
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
    await click([...document.querySelectorAll("button")].find((b) => b.textContent === "Post")!);
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

  it("floats new reactions up over your page once, and lists who sent what from its tab", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const props = home({
      entries: [entry({ userId: "me", isSelf: true, text: "gym then chai" })],
      reactionsOnMine: [
        reaction({ userId: "r", name: "Riya", emoji: "❤️", at: minsAgo(3) }),
        reaction({ userId: "d", name: "Dev", emoji: "😂", at: minsAgo(2) }),
      ],
      hypesOnMine: [reaction({ userId: "r", name: "Riya", emoji: "⭐", at: minsAgo(1) })],
    });
    await render(createElement(DiaryHome, props));
    const floating = () => [...host.querySelectorAll(".page-float")].map((f) => f.textContent);
    expect(new Set(floating())).toEqual(new Set(["❤️", "😂", "⭐"]));

    // The tab: faces and emoji, no words; it opens who sent what.
    const tab = button("Reactions from 2 people")!;
    expect(tab.textContent).toContain("2");
    await click(tab);
    const rows = [...document.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toEqual([expect.stringMatching(/Riya⭐ ❤️$/), expect.stringMatching(/Dev😂$/)]);

    // Seen: the next visit, nothing floats.
    await act(async () => root!.unmount());
    host.innerHTML = "";
    await render(createElement(DiaryHome, props));
    expect(floating()).toEqual([]);
  });

  it("shows your page with an edit button, and says nothing when nobody has reacted", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "me", isSelf: true, text: "gym then chai" })] })));
    expect(host.querySelector('[aria-label^="Reactions from"]')).toBeNull();
    const mine = document.querySelector("article")!;
    expect(mine.textContent).toContain("gym then chai");
    expect(mine.textContent).not.toMatch(/reaction/i);
    expect(button("Edit your page")).not.toBeNull();
  });

  it("does not resend the emoji you already sent to that page on an earlier visit", async () => {
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
    expect(rpcCalls.filter((c) => c.fn === "send_page_reply")).toHaveLength(1);
  });

  it("marks what is new, then marks it seen for next time", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const a = entry({ userId: "a", createdAt: "2026-09-10T01:00:00Z" });
    await render(createElement(DiaryHome, home({ entries: [a] })));
    expect(host.querySelector('[aria-label="New"]')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem("hypefy:diary:seen")!)).toEqual({
      a: "2026-09-10T01:00:00Z",
    });
  });

  it("moves the deck by swiping alone — no arrow buttons", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [entry({ userId: "a", name: "Aman", createdAt: minsAgo(1) }), entry({ userId: "b", name: "Riya", createdAt: minsAgo(60) })],
      }))
    );
    expect(button("Next page")).toBeNull();
    expect(button("Previous page")).toBeNull();
    expect(button("All pages")).toBeNull();
    expect(host.textContent).toContain("1/2");
  });

  it("keeps words off the page: a titled header, an icon for past pages, no status lines", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home()));
    expect(host.querySelector("h1")!.textContent).toBe("Pages");
    const past = button("Past pages")!;
    expect(past.closest("header")).not.toBeNull();
    expect(past.textContent).toBe("");
    expect(host.textContent).not.toMatch(/lasts a day|from your circle|no reactions/i);
  });

  it("goes full-screen at the page you opened, steps with the arrow keys, and closes", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: new Date(Date.now() - 60_000).toISOString() }),
          entry({ userId: "b", name: "Riya", text: "can't sleep", createdAt: new Date(Date.now() - 3_600_000).toISOString() }),
        ],
      }))
    );
    await click(topCard()!.querySelector(`button[aria-label="Open Aman's page full-screen"]`));
    const dialog = () => document.querySelector('[role="dialog"]');
    expect(dialog()?.getAttribute("aria-label")).toBe("Aman's page");
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(dialog()?.getAttribute("aria-label")).toBe("Riya's page");
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(dialog()?.getAttribute("aria-label")).toBe("Aman's page");

    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(dialog()).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes full-screen after the last page rather than looping", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("Open Aman's page full-screen"));
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
  it("counts only other people's pages you have not opened", async () => {
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
    expect(link.getAttribute("href")).toBe("/messages/pages");
    expect(link.textContent).toBe("2");
    expect(link.getAttribute("aria-label")).toBe("Pages, 2 new");
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
