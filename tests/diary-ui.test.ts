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
    // A few a tap away, and ⋯ for the rest.
    expect(emoji).toHaveLength(5);
    expect(top.querySelector('button[aria-label="More emoji for Aman"]')).not.toBeNull();
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

  it("reacts with any emoji from the ⋯ popup, found by search, and remembers it", async () => {
    localStorage.removeItem("hypefy.emoji.recent");
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    await click(button("More emoji for Aman"));

    const popup = () => document.querySelector('[role="dialog"][aria-label="Emoji"]');
    expect(popup()).not.toBeNull();
    await setValue(popup()!.querySelector<HTMLInputElement>('input[aria-label="Search emoji"]')!, "chai");
    await click(popup()!.querySelector('button[aria-label="☕"]'));

    expect(rpcCalls).toEqual([
      { fn: "react_to_note", args: { p_owner: "a", p_emoji: "☕" } },
      { fn: "send_page_reply", args: { p_owner: "a", p_body: "☕" } },
    ]);
    // One pick, one reaction: it closes as it sends, and ☕ is now recent.
    expect(popup()).toBeNull();
    expect(JSON.parse(localStorage.getItem("hypefy.emoji.recent")!)).toEqual(["☕"]);
  });

  it("closes the emoji popup when ⋯ is tapped again", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "a", name: "Aman" })] })));
    const popup = () => document.querySelector('[role="dialog"][aria-label="Emoji"]');
    await click(button("More emoji for Aman"));
    expect(popup()).not.toBeNull();
    await click(button("More emoji for Aman"));
    expect(popup()).toBeNull();
    expect(rpcCalls).toEqual([]);
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

  it("plays the front card's song by itself, shows every card's CD, and plays the next when it comes up", async () => {
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
    const playing = () => discs().filter((d) => d.getAttribute("aria-label")!.startsWith("Pause ")).map((d) => d.getAttribute("aria-label"));
    // Every card with a song shows its CD — Dev's, behind, too — and only the
    // one in front plays.
    expect(discs()).toHaveLength(2);
    expect(playing()).toEqual(["Pause Pasoori by X"]);
    const front = discs().find((d) => d.getAttribute("aria-label")!.startsWith("Pause "))!;
    expect(front.querySelector("img")!.getAttribute("src")).toBe("t1.jpg"); // the cover in the middle
    expect(played.at(-1)).toContain("t1.mp3");

    await swipe("ArrowRight"); // Riya: no song, so silence
    await wait(300);
    expect(playing()).toEqual([]);
    expect(paused).toBeGreaterThan(0);

    await swipe("ArrowRight"); // Dev: his song starts
    await wait(300);
    expect(playing()).toEqual(["Pause Blinding Lights by X"]);
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
    const spotlight = host.querySelector<HTMLElement>('section[aria-label="Deck"]')!;
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

  it("recolours your page from its palette, without rewriting it", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const { diaryTheme } = await import("@/components/diary/DiaryPage");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "me", isSelf: true, text: "gym then chai", color: "cobalt" })] })));
    await click(button("Page colour"));
    expect(button("Cobalt")!.getAttribute("aria-checked")).toBe("true");

    await click(button("Rose"));
    // Only the colour: not set_note, which would start the page afresh.
    expect(rpcCalls).toEqual([{ fn: "set_note_color", args: { p_color: "rose" } }]);
    expect(button("Rose")!.getAttribute("aria-checked")).toBe("true");
    const probe = document.createElement("div");
    probe.style.background = diaryTheme("rose", 100).background;
    expect(host.querySelector("article")!.style.background).toBe(probe.style.background);
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

  it("brings the next page to the front the moment the top one is thrown, not after it lands", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    const song = { id: "t2", title: "Blinding Lights", artist: "X", artwork: "", preview: "t2.mp3" };
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", track: song, createdAt: minsAgo(60) }),
        ],
      }))
    );
    await swipe("ArrowRight");
    // No waiting for the thrown card: Riya is on top, and her song is on.
    expect(topCard()!.textContent).toContain("Riya");
    expect(played.at(-1)).toContain("t2.mp3");
    expect(host.textContent).toContain("2/2");
  });

  it("puts the page to write on in the spotlight when nobody else has a page up", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home()));
    const deck = host.querySelector('section[aria-label="Deck"]')!;
    expect(deck.querySelector('textarea[aria-label="Your page"]')).not.toBeNull();
    expect(deck.querySelector('[aria-roledescription="card stack"]')).toBeNull();
    // Once, in the spotlight — not again in a list under it.
    expect(host.querySelectorAll('textarea[aria-label="Your page"]')).toHaveLength(1);
  });

  it("puts your page in the spotlight when it is the only one up", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(createElement(DiaryHome, home({ entries: [entry({ userId: "me", isSelf: true, text: "gym then chai" })] })));
    const deck = host.querySelector('section[aria-label="Deck"]')!;
    expect(deck.querySelector("article")!.textContent).toContain("gym then chai");
    expect(host.querySelectorAll("article")).toHaveLength(1);
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
    expect(host.querySelector("h1")!.textContent).toBe("Spotlight");
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

describe("timeAgo", () => {
  it("says how long ago a page went up", async () => {
    const { timeAgo } = await import("@/components/diary/DiaryPage");
    const now = Date.UTC(2026, 8, 11, 12);
    const ago = (ms: number) => new Date(now - ms).toISOString();
    expect(timeAgo(ago(20_000), now)).toBe("now");
    expect(timeAgo(ago(60_000), now)).toBe("1m ago");
    expect(timeAgo(ago(59 * 60_000), now)).toBe("59m ago");
    expect(timeAgo(ago(3_600_000), now)).toBe("1h ago");
    expect(timeAgo(ago(23.9 * 3_600_000), now)).toBe("23h ago");
  });

  it("says now, not a time in the future, when the phone's clock runs behind", async () => {
    const { timeAgo } = await import("@/components/diary/DiaryPage");
    const now = Date.UTC(2026, 8, 11, 12);
    expect(timeAgo(new Date(now + 10 * 60_000).toISOString(), now)).toBe("now");
  });
});

describe("FloatingPages", () => {
  const at = (m: number) => new Date(Date.UTC(2026, 8, 11, 12) - m * 60_000).toISOString();
  const pages = [
    entry({ userId: "a", name: "Aman", text: "HDB", createdAt: at(1) }), // newest, but seen
    entry({ userId: "b", name: "Riya", text: "free", createdAt: at(60) }), // new
    entry({ userId: "c", name: "Dev", text: "can't sleep", createdAt: at(30) }), // new, newer than Riya's
    entry({ userId: "me", name: "Naitik", text: "mine", isSelf: true, createdAt: at(5) }), // yours, never in it
  ];
  const link = () => host.querySelector("a")!;
  const wait = (ms: number) => act(async () => void (await new Promise((r) => setTimeout(r, ms))));
  const scrollTo = async (y: number) => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true });
    await act(async () => void window.dispatchEvent(new Event("scroll")));
    await wait(40); // it reads the scroll on the next frame
  };
  /** Tap the card; says whether it went through to Spotlight (not stopped). */
  const tap = async () => {
    let wentThrough = false;
    const note = (e: Event) => {
      wentThrough = !e.defaultPrevented;
      e.preventDefault(); // jsdom cannot navigate; the answer is all we need
    };
    window.addEventListener("click", note);
    await act(async () => void link().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    window.removeEventListener("click", note);
    return wentThrough;
  };
  const swipe = async (dx: number) => {
    const fire = (type: string, x: number) =>
      act(async () => void link().dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 400, button: 0 })));
    await fire("pointerdown", 200);
    await fire("pointermove", 200 + dx / 2);
    await fire("pointermove", 200 + dx);
    await fire("pointerup", 200 + dx);
    await wait(360); // the throw
  };
  afterEach(() => Object.defineProperty(window, "scrollY", { value: 0, configurable: true }));
  /** Far enough down the inbox that the card is all the way out. */
  const REVEAL_PX_ALL = 1000;

  it("shows the page you have not opened first, counts only those, and opens Spotlight on it", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    localStorage.setItem("hypefy:diary:seen", JSON.stringify({ a: at(1) }));
    await render(createElement(FloatingPages, { pages }));
    expect(link().getAttribute("href")).toBe("/messages/spotlight?page=c");
    expect(link().getAttribute("aria-label")).toBe("Dev's page: can't sleep. Open Spotlight, 2 new. Swipe for the next page");
    expect(link().textContent).toContain("can't sleep");
    expect(link().textContent).not.toContain("mine");
  });

  it("never moves on its own", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages }));
    const first = link().getAttribute("href");
    await wait(500);
    expect(link().getAttribute("href")).toBe(first);
  });

  it("comes in from the right as Messages opens, then goes back to wait at the edge", async () => {
    const { FloatingPages, PEEK_PX } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages, introHoldMs: 200 }));
    expect(link().style.transform).toBe("none");
    expect(link().style.opacity).toBe("1");
    await wait(260);
    expect(link().style.transform).toBe(`translateX(${104 - PEEK_PX}px)`);
  });

  it("stops its entrance for a scroll or a touch, and stays out", async () => {
    const { FloatingPages, REVEAL_PX } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages, introHoldMs: 200 }));
    await scrollTo(REVEAL_PX * 3);
    await wait(260);
    expect(link().style.transform).toBe("none");
    await act(async () => root!.unmount());
    root = undefined;
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    await render(createElement(FloatingPages, { pages, introHoldMs: 200 }));
    await act(async () => void link().dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 })));
    await wait(260);
    expect(link().style.transform).toBe("none");
  });

  it("peeks at the edge at the top of the inbox, and slides out as you scroll down", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages, introHoldMs: 0 }));
    await wait(20);
    const { PEEK_PX, REVEAL_PX } = await import("@/components/diary/FloatingPages");
    expect(link().style.transform).toBe(`translateX(${104 - PEEK_PX}px)`);
    await scrollTo(REVEAL_PX / 2);
    expect(link().style.transform).toBe(`translateX(${(104 - PEEK_PX) / 2}px)`);
    await scrollTo(REVEAL_PX * 3);
    expect(link().style.transform).toBe("none");
    await scrollTo(0);
    expect(link().style.transform).toBe(`translateX(${104 - PEEK_PX}px)`);
  });

  it("a tap on the sliver brings it out; the next tap opens Spotlight", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages, introHoldMs: 0 }));
    await wait(20);
    expect(await tap()).toBe(false);
    expect(link().style.transform).toBe("none");
    expect(await tap()).toBe(true);
  });

  it("swipes either way to send the top page to the back; a short drag springs back", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    localStorage.setItem("hypefy:diary:seen", JSON.stringify({ a: at(1) }));
    await render(createElement(FloatingPages, { pages }));
    await scrollTo(REVEAL_PX_ALL);
    await swipe(-90);
    expect(link().getAttribute("href")).toBe("/messages/spotlight?page=b");
    await swipe(90);
    expect(link().getAttribute("href")).toBe("/messages/spotlight?page=a");
    // A short drag springs back.
    await swipe(-15);
    expect(link().getAttribute("href")).toBe("/messages/spotlight?page=a");
  });

  it("does not swipe while it is peeking — the deck is still at the edge", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages, introHoldMs: 0 }));
    await wait(20);
    const first = link().getAttribute("href");
    await swipe(-90);
    expect(link().getAttribute("href")).toBe(first);
  });

  it("with nobody else's page up, shows yours — or a + to write one — and still opens Spotlight", async () => {
    const { FloatingPages } = await import("@/components/diary/FloatingPages");
    await render(createElement(FloatingPages, { pages: [pages[3]] }));
    expect(link().getAttribute("href")).toBe("/messages/spotlight");
    expect(link().getAttribute("aria-label")).toBe("Your page. Open Spotlight");
    await act(async () => root!.render(createElement(FloatingPages, { pages: [] })));
    expect(link().getAttribute("aria-label")).toBe("Write your page in Spotlight");
  });
});

describe("Spotlight opened on a page", () => {
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const topCard = () => host.querySelector<HTMLElement>('section[aria-roledescription="card stack"] article:not([inert])');

  it("starts the deck on the page tapped in Messages, the rest following in order", async () => {
    const { DiaryHome } = await import("@/components/diary/DiaryHome");
    await render(
      createElement(DiaryHome, home({
        entries: [
          entry({ userId: "a", name: "Aman", text: "HDB", createdAt: minsAgo(1) }),
          entry({ userId: "b", name: "Riya", text: "free", createdAt: minsAgo(60) }),
          entry({ userId: "c", name: "Dev", text: "can't sleep", createdAt: minsAgo(120) }),
        ],
        startAt: "b",
      }))
    );
    expect(topCard()!.textContent).toContain("Riya");
    expect(host.textContent).toContain("1/3");
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
