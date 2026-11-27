import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PIN_BANNER_MS,
  PIN_BANNER_SETTLE_MS,
  bannerLine,
  bannerThumb,
  bannerTitle,
  foldsOnScroll,
  loadBannerPins,
  pinBannerMode,
  type Pin,
  type PinCard,
} from "../src/lib/chat-pins";

/**
 * The pin banner (Naitik, 27 Nov 2026: design B with A's strip). A chat
 * with pins opens with the newest one as a strip under the header; it folds
 * into a tab on the right edge after three seconds or the first scroll.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const pin = (card: PinCard, over: Partial<Pin> = {}): Pin => ({
  id: "m1",
  senderId: "them",
  mine: false,
  at: "2026-11-27T00:00:00Z",
  pinnedAt: "2026-11-27T00:00:00Z",
  pinnedBy: "them",
  label: "PHOTO",
  side: "left",
  tilt: 0,
  card,
  ...over,
});

describe("what the strip says", () => {
  it("a photo is an Attachment, as in the reference", () => {
    expect(bannerTitle(pin({ shape: "photo", url: "u", motion: false, more: 0 }))).toBe("Attachment");
  });
  it("a video, a GIF and an album say what they are", () => {
    expect(bannerTitle(pin({ shape: "photo", url: "u", motion: true, more: 0 }))).toBe("Video");
    expect(bannerTitle(pin({ shape: "photo", url: "u", motion: false, more: 0 }, { label: "GIF" }))).toBe("GIF");
    expect(bannerTitle(pin({ shape: "photo", url: "u", motion: false, more: 2 }))).toBe("3 photos");
  });
  it("a Shot, a post, a voice note, music, a file and words", () => {
    const share = (of: "post" | "shot") =>
      ({ shape: "share", of, targetId: "t", thumb: null, video: null, username: "a" }) as const;
    expect(bannerTitle(pin(share("shot")))).toBe("Shot");
    expect(bannerTitle(pin(share("post")))).toBe("Post");
    expect(bannerTitle(pin({ shape: "voice", url: "u", duration: 42, peaks: null }))).toBe("Voice note");
    expect(bannerTitle(pin({ shape: "file", url: "u", name: "deck.pdf", size: 1 }))).toBe("deck.pdf");
    expect(bannerTitle(pin({ shape: "note", text: "kabki hai ye?" }))).toBe("kabki hai ye?");
  });

  it("the thumbnail is the picture itself, and nothing for a poster-less video", () => {
    expect(bannerThumb(pin({ shape: "photo", url: "pic", motion: false, more: 0 }))).toBe("pic");
    expect(bannerThumb(pin({ shape: "photo", url: "vid", motion: true, more: 0 }))).toBe(null);
    expect(
      bannerThumb(pin({ shape: "share", of: "shot", targetId: "t", thumb: "poster", video: null, username: null })),
    ).toBe("poster");
    expect(bannerThumb(pin({ shape: "voice", url: "u", duration: 1, peaks: null }))).toBe(null);
  });

  it("who pinned it, 'you' for the reader, and the count only when there is more than one", () => {
    const names = (id: string) => (id === "them" ? "Aman" : null);
    const card: PinCard = { shape: "note", text: "x" };
    expect(bannerLine(pin(card), "me", names, 3)).toBe("Pinned by Aman · 1 of 3");
    expect(bannerLine(pin(card, { pinnedBy: "me" }), "me", names, 1)).toBe("Pinned by you");
    expect(bannerLine(pin(card, { pinnedBy: null }), "me", names, 2)).toBe("Pinned · 1 of 2");
    // Somebody no longer in the group: no name, no "by".
    expect(bannerLine(pin(card, { pinnedBy: "gone" }), "me", names, 1)).toBe("Pinned");
  });
});

describe("when it shows, and when it folds", () => {
  it("nothing at all in a chat with no pins", () => {
    expect(pinBannerMode(0, false)).toBe("none");
    expect(pinBannerMode(0, true)).toBe("none");
  });
  it("the strip first, then the tab", () => {
    expect(pinBannerMode(1, false)).toBe("banner");
    expect(pinBannerMode(3, true)).toBe("tab");
  });
  it("folds after three seconds", () => {
    expect(PIN_BANNER_MS).toBe(3000);
  });
  it("a scroll while the thread is still settling does not fold it", () => {
    expect(foldsOnScroll(0)).toBe(false);
    expect(foldsOnScroll(PIN_BANNER_SETTLE_MS - 1)).toBe(false);
    expect(foldsOnScroll(PIN_BANNER_SETTLE_MS)).toBe(true);
    expect(PIN_BANNER_SETTLE_MS).toBeLessThan(PIN_BANNER_MS);
  });
});

describe("the read", () => {
  function fake(result: { data: unknown[] | null; error: unknown }) {
    const calls: [string, ...unknown[]][] = [];
    const q = {
      select: (c: string) => (calls.push(["select", c]), q),
      eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), q),
      not: (c: string, o: string, v: unknown) => (calls.push(["not", c, o, v]), q),
      is: (c: string, v: unknown) => (calls.push(["is", c, v]), q),
      order: (c: string, o: { ascending: boolean }) => (calls.push(["order", c, o.ascending]), q),
      limit: (n: number) => (calls.push(["limit", n]), Promise.resolve(result)),
    };
    return { client: { from: (t: string) => (calls.push(["from", t]), q) }, calls };
  }

  const row = (id: string, pinned_at: string, over: Record<string, unknown> = {}) => ({
    id, kind: "text", body: "hi " + id, sender_id: "them", created_at: pinned_at, pinned_at, pinned_by: "them", ...over,
  });

  it("asks for the same rows the board shows", async () => {
    const { client, calls } = fake({ data: [], error: null });
    await loadBannerPins(client, "c1", "me");
    expect(calls).toContainEqual(["from", "messages"]);
    expect(calls).toContainEqual(["eq", "conversation_id", "c1"]);
    expect(calls).toContainEqual(["not", "pinned_at", "is", null]);
    expect(calls).toContainEqual(["eq", "is_unsent", false]);
    expect(calls).toContainEqual(["is", "removed_at", null]);
    expect(calls).toContainEqual(["order", "pinned_at", false]);
  });

  it("newest pin first, which is the one the strip shows", async () => {
    const { client } = fake({ data: [row("old", "2026-11-01T00:00:00Z"), row("new", "2026-11-27T00:00:00Z")], error: null });
    const pins = await loadBannerPins(client, "c1", "me");
    expect(pins.map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("a failed read is no banner, not a crash", async () => {
    const { client } = fake({ data: [row("a", "2026-11-27T00:00:00Z")], error: { message: "401" } });
    expect(await loadBannerPins(client, "c1", "me")).toEqual([]);
  });
});

describe("the wiring", () => {
  const chat = strip(read("src/components/messages/RealChatView.tsx"));
  const banner = strip(read("src/components/messages/PinBanner.tsx"));

  it("the chat folds it on a timer, per chat", () => {
    expect(chat).toContain("const t = setTimeout(() => setPinFoldedIn(conversationId), PIN_BANNER_MS);");
    expect(chat).toContain("const pinFolded = pinFoldedIn === conversationId;");
  });

  it("and on the first real scroll", () => {
    const fn = chat.slice(chat.indexOf("function onMessagesScroll("));
    const body = fn.slice(0, fn.indexOf("\n  }\n"));
    expect(body).toContain("if (!pinFolded && foldsOnScroll(e.timeStamp - pinOpenedAt.current)) setPinFoldedIn(conversationId);");
  });

  it("is drawn with that state, and tapping it opens the board", () => {
    const at = chat.indexOf("<PinBanner");
    const tag = chat.slice(at, chat.indexOf("/>", at));
    expect(tag).toContain("folded={pinFolded}");
    expect(tag).toContain("onOpen={() => { setPinFoldedIn(conversationId); pinPane.open(); }}");
    expect(tag).toContain("refreshKey={pinKey}");
  });

  it("the banner draws what the mode says: the strip, or the edge tab", () => {
    expect(banner).toContain("const mode = pinBannerMode(pins.length, folded);");
    expect(banner).toContain('if (mode === "none") return null;');
    const tab = banner.slice(banner.indexOf('if (mode === "tab")'), banner.indexOf("const thumb = bannerThumb(top);"));
    // On the right edge, square on that side, with the count.
    expect(tab).toContain("absolute right-0");
    expect(tab).toContain("rounded-l-[14px]");
    expect(tab).toContain("{pins.length}");
    expect(tab).toContain("onClick={onOpen}");
  });

  it("and the strip lies over the thread, so folding never moves a message", () => {
    expect(chat).toContain('<div className="relative z-20 h-0">');
    const strip_ = banner.slice(banner.indexOf("const thumb = bannerThumb(top);"));
    expect(strip_).toContain("absolute inset-x-0 top-0");
    expect(strip_).toContain("{bannerTitle(top)}");
    expect(strip_).toContain("{bannerLine(top, me, nameOf, pins.length)}");
  });
});
