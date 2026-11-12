import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { nameStyle } from "@/lib/cosmetics";

/**
 * Names in the feed are plain.
 *
 * A name font and a glow belong where a person is the subject: their profile,
 * their card, the top of a chat with them. A feed is a list of other people's
 * posts, and six faces down one scroll reads as six different apps — the glow
 * competes with the picture under it, and Script at 14px is harder to read
 * than the name is worth.
 *
 * The cosmetics themselves are untouched; they are simply not worn here.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const FEED = ["src/components/feed/FeedCard.tsx", "src/components/feed/ShotFeedCard.tsx"];

describe("the feed draws names plainly", () => {
  it.each(FEED)("%s renders the name in a plain span", (file) => {
    const src = read(file);
    expect(src).toContain('<span className="min-w-0 truncate">{name}</span>');
  });

  it.each(FEED)("%s does not reach for the worn style at all", (file) => {
    const src = read(file);
    // The import, not the word: the comment above the span explains which
    // surfaces do wear a font and a glow, and names the component.
    expect(src).not.toContain('from "@/components/ui/DisplayName"');
    expect(src).not.toContain("<DisplayName");
    expect(src).not.toContain("nameStyle");
    expect(src).not.toContain("withGlowRoom");
  });
});

describe("and everywhere a person is the subject still wears theirs", () => {
  // Removing the effects from the feed must not quietly remove them from the
  // places they were bought for.
  it.each([
    "src/components/profile/ProfileHeader.tsx",
    "src/components/profile/ProfileCardFaces.tsx",
    "src/components/messages/MessagesInbox.tsx",
    "src/components/messages/RealChatView.tsx",
  ])("%s still uses DisplayName", (file) => {
    expect(read(file)).toContain("<DisplayName");
  });

  it("and the cosmetics themselves are unchanged", () => {
    // Still real styles for someone who has them — this change is about where
    // they are drawn, not whether they exist.
    const worn = nameStyle({ name_font: "font-script", name_glow: "glow-lime", is_premium: true });
    expect(worn?.fontFamily).toContain("--font-name-script");
    expect(worn?.textShadow).toContain("#a3e635");
  });

  it("and someone without Premium never wore them anywhere", () => {
    expect(nameStyle({ name_font: "font-script", name_glow: "glow-lime", is_premium: false })).toBeUndefined();
  });
});
