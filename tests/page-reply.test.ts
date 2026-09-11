// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * A reply to someone's page arrives in DMs as an embed of that page. The page
 * comes from the message's metadata (send_page_reply copies it there), so the
 * embed must read it defensively and still draw after the page has gone.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const meta = {
  page: {
    owner_id: "u",
    text: "exams done. finally free",
    color: "plum",
    hue: 330,
    written_at: "2026-09-11T10:00:00Z",
    track: { title: "Kho Gaye Hum Kahan", artist: "Prateek Kuhad", artwork: "cover.jpg" },
  },
};

describe("pageSnapshot", () => {
  it("reads the page a reply carries", async () => {
    const { pageSnapshot } = await import("@/components/diary/PageReplyEmbed");
    expect(pageSnapshot(meta)).toEqual({
      text: "exams done. finally free",
      color: "plum",
      hue: 330,
      writtenAt: "2026-09-11T10:00:00Z",
      track: { title: "Kho Gaye Hum Kahan", artist: "Prateek Kuhad", artwork: "cover.jpg" },
    });
  });

  it("gives nothing for a message that carries no page, or a broken one", async () => {
    const { pageSnapshot } = await import("@/components/diary/PageReplyEmbed");
    expect(pageSnapshot(null)).toBeNull();
    expect(pageSnapshot({})).toBeNull();
    expect(pageSnapshot({ page: { text: 3 } })).toBeNull();
    expect(pageSnapshot({ page: { text: "hi" } })).toEqual({ text: "hi", color: null, hue: 280, writtenAt: null, track: null });
  });
});

describe("isEmojiReply", () => {
  it("tells an emoji from words", async () => {
    const { isEmojiReply } = await import("@/components/diary/PageReplyEmbed");
    for (const e of ["❤️", "😂", "🥰", "👍", "😮", "😢", "👍🏽", "❤️❤️"]) expect(isEmojiReply(e)).toBe(true);
    for (const t of ["same, chai?", "ok ❤️", "", null, "3"]) expect(isEmojiReply(t)).toBe(false);
  });
});

describe("PageReplyEmbed", () => {
  const live = new Date("2026-09-11T12:00:00Z").getTime(); // two hours after it was written

  it("shows the page reacted to — yours, its words, its song and cover — with the emoji on its corner", async () => {
    const { PageReplyEmbed, pageSnapshot } = await import("@/components/diary/PageReplyEmbed");
    const html = renderToStaticMarkup(
      createElement(PageReplyEmbed, { page: pageSnapshot(meta)!, body: "❤️", mine: false, now: live })
    );
    expect(html).toContain("Reacted to your page");
    expect(html).toContain("Your page");
    expect(html).toContain("exams done. finally free");
    expect(html).toContain("Kho Gaye Hum Kahan");
    expect(html).toContain("cover.jpg");
    expect(html).toContain("animate-react-pop"); // the emoji, landed on the corner
    expect(html).toContain('href="/messages/spotlight"'); // still up: it opens
  });

  it("says a page has ended, and does not link to it", async () => {
    const { PageReplyEmbed, pageSnapshot } = await import("@/components/diary/PageReplyEmbed");
    const html = renderToStaticMarkup(
      createElement(PageReplyEmbed, { page: pageSnapshot(meta)!, body: "❤️", mine: false, now: live + 30 * 3_600_000 })
    );
    expect(html).toContain("Ended");
    expect(html).not.toContain('href="/messages/spotlight"');
  });

  it("hangs words off the page as a bubble, and names whose page from the sender's side", async () => {
    const { PageReplyEmbed, pageSnapshot } = await import("@/components/diary/PageReplyEmbed");
    const html = renderToStaticMarkup(
      createElement(PageReplyEmbed, {
        page: pageSnapshot(meta)!,
        body: "same, chai?",
        mine: true,
        owner: { name: "Riya Sharma", hue: 330 },
        now: live,
      })
    );
    expect(html).toContain("You replied to Riya&#x27;s page");
    expect(html).toContain("Riya Sharma");
    expect(html).toContain("same, chai?");
    expect(html).not.toContain("animate-react-pop");
  });
});
