// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { freshCount } from "@/components/diary/PagesStrip";
import type { DiaryEntry } from "@/lib/diary";

/**
 * Today's pages laid out flat under the filter row, behind an arrow.
 *
 * The same rows the Spotlight deck shuffles — read through the same helpers,
 * so the two surfaces can never disagree about who is new.
 */

// The row is what these mount; the composer it can open has its own
// dependencies (a Supabase client, toasts) that say nothing about the row.
vi.mock("@/components/notes/NoteEditorSheet", () => ({ NoteEditorSheet: () => null }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) =>
    createElement("a", { href, ...rest }, children),
}));

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const src = read("src/components/diary/PagesStrip.tsx");
const inbox = read("src/components/messages/MessagesInbox.tsx");

const page = (userId: string, over: Partial<DiaryEntry> = {}): DiaryEntry => ({
  userId,
  text: `${userId} wrote something`,
  audience: "mutual",
  createdAt: "2026-10-08T10:00:00Z",
  isSelf: false,
  name: userId,
  username: userId,
  hue: 200,
  avatarUrl: null,
  track: null,
  color: null,
  imageUrl: null,
  ...over,
});

describe("how many pages are waiting", () => {
  it("counts the ones this device has not opened", () => {
    const pages = [page("a"), page("b"), page("c")];
    expect(freshCount(pages, {})).toBe(3);
    expect(freshCount(pages, { a: "2026-10-08T10:00:00Z" })).toBe(2);
  });

  it("a page they have rewritten since you read it counts again", () => {
    expect(freshCount([page("a")], { a: "2026-10-07T09:00:00Z" })).toBe(1);
  });

  it("your own never counts — you wrote it", () => {
    expect(freshCount([page("me", { isSelf: true }), page("a")], {})).toBe(1);
  });
});

describe("the strip", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    localStorage.clear();
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    document.body.innerHTML = "";
    localStorage.clear();
  });

  async function mount(pages: DiaryEntry[]) {
    const { PagesStrip } = await import("@/components/diary/PagesStrip");
    await act(async () => root.render(createElement(PagesStrip, { pages })));
  }

  const links = () => [...host.querySelectorAll("a")];

  it("yours comes first, then everyone else", async () => {
    await mount([page("me", { isSelf: true, name: "Me" }), page("a", { name: "Aman" })]);
    // Only theirs is a link; yours opens the composer.
    expect(links()).toHaveLength(1);
    expect(links()[0].getAttribute("href")).toBe("/messages/spotlight?page=a");
    expect(
      [...host.querySelectorAll("button")].some((b) => /Your UpDate/.test(b.getAttribute("aria-label") ?? "")),
    ).toBe(true);
  });

  it("someone else's face opens Spotlight on their page", async () => {
    await mount([page("a")]);
    expect(links()[0].getAttribute("href")).toBe("/messages/spotlight?page=a");
  });

  it("with none of your own the slot invites you to write one, in place", async () => {
    await mount([page("a")]);
    expect(host.textContent).toContain("add yours…");
    // A button, not a link: writing yours must not leave for Spotlight.
    expect(links().every((l) => l.getAttribute("href") !== "/messages/spotlight")).toBe(true);
    expect(
      [...host.querySelectorAll("button")].some((b) => b.getAttribute("aria-label") === "Write your UpDate"),
    ).toBe(true);
  });

  it("a page of only a photo still says something", async () => {
    await mount([page("a", { text: "" })]);
    expect(host.textContent).toContain("Photo");
  });

  it("what they wrote is read out with whose it is", async () => {
    await mount([page("a", { name: "Aman", text: "gym at 7" })]);
    expect(links()[0].getAttribute("aria-label")).toBe("Aman's UpDate: gym at 7");
  });

  it("no face wears a ring", async () => {
    await mount([page("a"), page("b")]);
    expect(host.querySelectorAll(".ring-accent")).toHaveLength(0);
    // What is new is still said, by the number on the arrow and by the
    // order — unseen pages sort to the front.
    expect(src).toContain("storyOrder(pages, fresh)");
  });

  it("with no page of your own the slot is your own face, not an empty tile", async () => {
    const { PagesStrip } = await import("@/components/diary/PagesStrip");
    await act(async () =>
      root.render(
        createElement(PagesStrip, {
          pages: [page("a")],
          me: { name: "Crazie", hue: 90, avatarUrl: null },
        }),
      ),
    );
    // The initial of your name, where the dashed square used to be. On
    // the button that opens the composer, since yours is no longer a link.
    const own = [...host.querySelectorAll("button")].find(
      (x) => x.getAttribute("aria-label") === "Write your UpDate",
    );
    expect(own?.textContent).toContain("C");
  });
});

describe("writing your own", () => {
  it("opens a popup here rather than sending you to Spotlight", () => {
    // Leaving for another screen to write one is what made UpDates and
    // Spotlight pages feel like the same feature.
    expect(src).toContain("<NoteEditorSheet");
    expect(src).toContain("const [composing, setComposing] = useState(false);");
    expect(src).toContain("onClick={() => setComposing(true)}");
  });

  it("is the bubble and the face themselves, with words, emoji and a song", () => {
    const editor = read("src/components/notes/NoteEditorSheet.tsx");
    expect(editor).toContain("Pick emoji");
    expect(editor).toContain("TrackPicker");
    expect(editor).toContain('supabase.rpc("set_note"');
  });

  it("says UpDate on its buttons, not note", () => {
    expect(src).toContain('noun="UpDate"');
    const editor = read("src/components/notes/NoteEditorSheet.tsx");
    expect(editor).toContain("`Share ${noun}`");
    expect(editor).not.toContain('"Share note"');
  });

  it("the row shows the save before the server has caught up", () => {
    // null is a real value — a cleared UpDate — so it cannot double as
    // "nothing written this session".
    expect(src).toContain("const [justSaved, setJustSaved] = useState<MyNote | undefined>(undefined);");
    expect(src).toContain("justSaved !== undefined");
  });
});

describe("the thought over the face", () => {
  it("is a thought, not speech: dots rather than a point", () => {
    expect(src).toContain("function Dots(");
    expect(src).toContain("rounded-full");
    // No tail of any kind left over from the speech-bubble version.
    expect(src).not.toContain("rotate-45");
  });

  it("the dots shrink as they near the face", () => {
    const big = src.indexOf("h-[10px] w-[10px]");
    const small = src.indexOf("h-[6px] w-[6px]");
    expect(big).toBeGreaterThan(-1);
    expect(small).toBeGreaterThan(big);
  });

  it("they are a chain out of the face, not two dots in the air", () => {
    // The large one tucks under the bubble's bottom corner (which sits
    // OVERLAP = 9 below the top of the picture) and the small one overlaps
    // it and rests on the picture's rim. Spaced apart, they stop reading as
    // a thought coming out of anyone.
    expect(src).toContain('top-[8px] h-[10px] w-[10px]');
    expect(src).toContain('top-[17px] h-[6px] w-[6px]');
  });

  it("they are the bubble's own colour, so the three read as one thing", () => {
    expect(src).toContain('const fill = faint ? "bg-surface" : "bg-elevated";');
  });

  it("sits over the picture, with its words kept out of that band", () => {
    expect(src).toContain("const OVERLAP = 11;");
    expect(src).toContain("marginBottom: -OVERLAP, paddingBottom: OVERLAP + 3");
  });

  it("the dots get a margin of their own to fall down", () => {
    // At the cell's full width they were squeezed between the bubble and
    // the face and came out as two specks.
    expect(src).toContain("const CELL = 90;");
    expect(src).toContain("const BUBBLE = 78;");
    expect(src).toContain("ml-auto");
  });

  it("no face wears a ring, so none needs room kept for one", () => {
    expect(src).not.toContain("ring-accent");
    expect(src).not.toContain("p-[2px] ring-[1.5px]");
  });

  it("is always two lines tall, so every name in the row sits level", () => {
    expect(src).toContain('style={{ minHeight: "2.5em" }}');
    expect(src).toContain("line-clamp-2");
  });

  it("a song is marked without costing a line or landing on a word", () => {
    expect(src).toContain('track ? "pr-4" : "pr-2"');
    expect(src).toContain('className="absolute right-1.5 top-2 text-accent"');
  });

  it("the bubble is wider than the face it sits on", () => {
    expect(src).toContain("const FACE = 64;");
    expect(src).toContain("const BUBBLE = 78;");
  });
});

describe("what they are called here", () => {
  it("UpDates in Messages, though Spotlight still calls them pages", () => {
    // Same rows, same 24 hours. Spotlight is somewhere you go to read; this
    // is a line across the top of your chats, and is named for that.
    expect(src).toContain("UpDates");
    expect(src).toContain('aria-label="Write your UpDate"');
    expect(read("src/components/diary/FloatingPages.tsx")).not.toContain("UpDate");
  });
});

describe("the arrow on the filter row", () => {
  it("says how many are waiting, and which way it points", () => {
    expect(src).toContain("aria-expanded={open}");
    expect(src).toContain('open ? "rotate-180 text-accent" : ""');
    expect(src).toContain("count === 1 ? \"UpDate\" : \"UpDates\"");
  });

  it("is offered even on a day when nobody has written anything", () => {
    // Hidden until there was something to read, the one person who could
    // start the day's first page never saw it.
    expect(inbox).toContain("<PagesTrigger");
    expect(inbox).not.toContain("{pages.length > 0 && (");
  });

  it("the row is open to begin with, and the arrow folds it away", () => {
    // Behind an arrow it was a feature you had to already know about.
    expect(inbox).toContain("const [pagesOpen, setPagesOpen] = useState(true);");
    expect(inbox).toContain("{pagesOpen && <PagesStrip pages={pages} me={me} />}");
  });

  it("reads what you have opened the same way the deck does", () => {
    // Both go through loadSeen + unseen, so neither can call someone new
    // while the other calls them read.
    expect(src).toContain("unseen(pages, loadSeen())");
    expect(inbox).toContain("freshCount(pages, loadSeen())");
    expect(read("src/components/diary/FloatingPages.tsx")).toContain("unseen(pages, loadSeen())");
  });
});
