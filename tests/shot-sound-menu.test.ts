// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";

/**
 * The card the Shot's disc opens.
 *
 * The rail used to carry a three-dots button with the sound's disc directly
 * under it. They are one button now, and this is what it opens: the sound,
 * and the actions that need no confirming. The rest — block, and everything
 * an owner can do to their own Shot — stays in the sheets the card's ⋯ hands
 * over to, with their full names and their confirmations.
 *
 * Driven rather than read: every dependency arrives as a prop, so a test can
 * press the buttons and see what was called.
 */

vi.mock("@/lib/music", () => ({ useIsPlaying: () => false }));

const TRACK = {
  id: "t1",
  title: "Nightcrawler",
  artist: "Moth Club",
  artwork: "https://example.test/a.jpg",
  preview: "https://example.test/a.mp3",
};

const spies = () => ({
  onClose: vi.fn(),
  onCopyLink: vi.fn(),
  onNotInterested: vi.fn(),
  onMute: vi.fn(),
  onReport: vi.fn(),
  onMore: vi.fn(),
});

let root: Root;
let host: HTMLDivElement;

async function mount(props: Record<string, unknown>) {
  const { ShotSoundMenu } = await import("@/components/shots/ShotSoundMenu");
  await act(async () =>
    root.render(
      createElement(ShotSoundMenu, {
        track: TRACK,
        open: true,
        isOwner: false,
        who: "@maya",
        ...spies(),
        ...props,
      } as never),
    ),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const item = (name: string) => host.querySelector<HTMLElement>(`[aria-label="${name}"]`);
const card = () => host.querySelector<HTMLElement>("[data-shot-sound-menu]");

describe("the card the disc opens", () => {
  it("is not there at all until the disc is pressed", async () => {
    await mount({ open: false });
    expect(card()).toBeNull();
    // Not merely hidden: a menu left in the tree keeps taking taps meant for
    // the video under it, which is the bug the old caption block had.
    expect(host.textContent).toBe("");
  });

  it("names the sound, and carries it on to its own page", async () => {
    await mount({});
    expect(card()!.textContent).toContain("Nightcrawler");
    expect(card()!.textContent).toContain("Moth Club");
    const open = [...host.querySelectorAll("a")].find((a) => a.textContent === "Open sound");
    expect(open?.getAttribute("href")).toBe("/sound/t1");
  });

  it("gives every action a name a screen reader can say", async () => {
    await mount({});
    for (const name of ["Copy link", "Not interested", "Mute @maya", "Report Shot", "More options"])
      expect(item(name), name).toBeTruthy();
  });

  it("and writes the two that get confused on the glass itself", async () => {
    await mount({});
    // Mute and Report sit next to each other and are both one-shot decisions.
    // Told apart by an unlabelled glyph they are a coin flip.
    expect(item("Mute @maya")!.textContent).toContain("Mute");
    expect(item("Report Shot")!.textContent).toContain("Report");
  });

  it("runs the action it was asked for, and nothing else", async () => {
    const s = spies();
    await mount(s);
    await act(async () => item("Not interested")!.click());
    expect(s.onNotInterested).toHaveBeenCalledTimes(1);
    for (const [name, fn] of Object.entries(s))
      if (name !== "onNotInterested" && name !== "onClose")
        expect(fn, name).not.toHaveBeenCalled();
  });

  it("and takes itself away first, so the Shot is not left behind a card", async () => {
    const s = spies();
    await mount(s);
    for (const name of ["Copy link", "Mute @maya", "Report Shot", "More options"]) {
      s.onClose.mockClear();
      await act(async () => item(name)!.click());
      expect(s.onClose, name).toHaveBeenCalled();
    }
  });

  it("closes on a tap beside it", async () => {
    const s = spies();
    await mount(s);
    const scrim = [...host.querySelectorAll<HTMLElement>('[aria-label="Close"]')][0];
    await act(async () => scrim.click());
    expect(s.onClose).toHaveBeenCalled();
  });

  it("offers an owner nothing to do about themselves, but keeps their menu", async () => {
    await mount({ isOwner: true });
    for (const name of ["Not interested", "Mute @maya", "Report Shot"])
      expect(item(name), name).toBeNull();
    expect(item("Copy link")).toBeTruthy();
    expect(item("More options")).toBeTruthy();
  });

  it("holds nothing that cannot be taken back", async () => {
    // Blocking, deleting, archiving: all behind ⋯, where they keep their
    // full names and their confirm step. An icon with no word on it is how
    // you delete your own Shot by accident.
    await mount({ isOwner: true });
    const owner = card()!.textContent ?? "";
    await mount({ isOwner: false });
    const viewer = card()!.textContent ?? "";
    for (const word of ["Block", "Delete", "Archive"]) {
      expect(owner, word).not.toContain(word);
      expect(viewer, word).not.toContain(word);
    }
  });
});

describe("where the reel wires it up", () => {
  const src = readFileSync("src/components/shots/ReelsFeed.tsx", "utf8").replace(/\r\n/g, "\n");
  /** Comments and imports strip first: both name the things asserted below. */
  const code = src.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, "").replace(/^import .*$/gm, "");

  it("the rail has no three-dots button of its own any more", () => {
    const rail = code.slice(
      code.indexOf('className="absolute bottom-6 right-3 z-30'),
      code.indexOf("{/* Author and caption"),
    );
    expect(rail.length).toBeGreaterThan(200);
    expect(rail).not.toContain("MoreHorizontal");
    expect(rail).toContain("<ShotSound");
  });

  it("the disc opens the card, and the card's ⋯ opens the sheet that was there before", () => {
    expect(code).toContain("onActivate={() => setSoundMenuOpen(true)}");
    expect(code).toContain(
      "onMore={() => (isOwner ? setOwnerMenuOpen(true) : setViewerMenuOpen(true))}",
    );
  });

  it("and the sheets themselves are untouched: a viewer can still block, an owner can still delete", () => {
    expect(code).toContain("setConfirmBlock(true)");
    expect(code).toContain("void archiveShot()");
  });
});

describe("a button in the rail", () => {
  /** Driven: it takes everything it needs as props. */
  async function rail(props: Record<string, unknown>) {
    const { RailButton } = await import("@/components/shots/ReelsFeed");
    await act(async () =>
      root.render(
        createElement(RailButton, {
          label: "Hype",
          onClick: () => {},
          children: createElement("svg"),
          ...props,
        } as never),
      ),
    );
    return host.querySelector("button")!;
  }

  it("writes the number and not the word", async () => {
    // The word used to sit under every icon — Hype, Comment, Share, Rehype,
    // Save, More — and six icon-and-word pairs were most of the right-hand
    // side of the video.
    const b = await rail({ count: "24.8K" });
    expect(b.textContent).toBe("24.8K");
    expect(b.textContent).not.toContain("Hype");
  });

  it("and writes nothing at all when there is no number", async () => {
    // A Shot nobody has hyped shows a star, not a zero and not the word.
    const b = await rail({});
    expect(b.textContent).toBe("");
  });

  it("but still says what it is, since there is no longer a word to read", async () => {
    expect((await rail({})).getAttribute("aria-label")).toBe("Hype");
    expect((await rail({ count: "3" })).getAttribute("aria-label")).toBe("Hype, 3");
  });

  it("and stays big enough to hit without one", async () => {
    // The word was padding as much as it was a label: losing it shrank the
    // button below the 44px a thumb needs.
    expect((await rail({})).className).toContain("min-h-11");
  });
});
