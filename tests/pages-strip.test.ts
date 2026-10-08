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
    expect(links()[0].getAttribute("href")).toBe("/messages/spotlight?page=me");
    expect(links()).toHaveLength(2);
  });

  it("each face opens Spotlight on that page, not on the screen in general", async () => {
    // [0] is your own slot, which is always first.
    await mount([page("a")]);
    expect(links()[1].getAttribute("href")).toBe("/messages/spotlight?page=a");
  });

  it("with no page of your own the slot invites you to write one", async () => {
    await mount([page("a")]);
    expect(host.textContent).toContain("add a page…");
    expect(links()[0].getAttribute("href")).toBe("/messages/spotlight");
  });

  it("a page of only a photo still says something", async () => {
    await mount([page("a", { text: "" })]);
    expect(host.textContent).toContain("Photo");
  });

  it("what they wrote is read out with whose it is", async () => {
    await mount([page("a", { name: "Aman", text: "gym at 7" })]);
    expect(links()[1].getAttribute("aria-label")).toBe("Aman's page: gym at 7");
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
    // The initial of your name, where the dashed square used to be.
    expect(links()[0].textContent).toContain("C");
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
    const big = src.indexOf("h-[8px] w-[8px]");
    const small = src.indexOf("h-[5px] w-[5px]");
    expect(big).toBeGreaterThan(-1);
    expect(small).toBeGreaterThan(big);
  });

  it("they are a chain out of the face, not two dots in the air", () => {
    // The large one tucks under the bubble's bottom corner (which sits
    // OVERLAP = 9 below the top of the picture) and the small one overlaps
    // it and rests on the picture's rim. Spaced apart, they stop reading as
    // a thought coming out of anyone.
    expect(src).toContain('top-[7px] h-[8px] w-[8px]');
    expect(src).toContain('top-[14px] h-[5px] w-[5px]');
  });

  it("they are the bubble's own colour, so the three read as one thing", () => {
    expect(src).toContain('const fill = faint ? "bg-surface" : "bg-elevated";');
  });

  it("sits over the picture, with its words kept out of that band", () => {
    expect(src).toContain("const OVERLAP = 9;");
    expect(src).toContain("marginBottom: -OVERLAP, paddingBottom: OVERLAP + 3");
  });

  it("the dots get a margin of their own to fall down", () => {
    // At the cell's full width they were squeezed between the bubble and
    // the face and came out as two specks.
    expect(src).toContain("const CELL = 74;");
    expect(src).toContain("const BUBBLE = 64;");
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
    expect(src).toContain('track ? "pr-3.5" : "pr-1.5"');
    expect(src).toContain('className="absolute right-1 top-1.5 text-accent"');
  });

  it("the bubble is wider than the face it sits on", () => {
    expect(src).toContain("const FACE = 52;");
    expect(src).toContain("const BUBBLE = 64;");
  });
});

describe("the arrow on the filter row", () => {
  it("says how many are waiting, and which way it points", () => {
    expect(src).toContain("aria-expanded={open}");
    expect(src).toContain('open ? "rotate-180 text-accent" : ""');
    expect(src).toContain("count === 1 ? \"page\" : \"pages\"");
  });

  it("is offered even on a day when nobody has written anything", () => {
    // Hidden until there was something to read, the one person who could
    // start the day's first page never saw it.
    expect(inbox).toContain("<PagesTrigger");
    expect(inbox).not.toContain("{pages.length > 0 && (");
  });

  it("the strip opens under the row, and starts closed", () => {
    expect(inbox).toContain("const [pagesOpen, setPagesOpen] = useState(false);");
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
