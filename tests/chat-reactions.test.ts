import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { frameIdOf, frameReaction, reactionLabel } from "@/lib/chat-reactions";

/**
 * Reacting with something you own.
 *
 * message_reactions.emoji is free text, so this needed no migration — it
 * needed a shape the column can hold. Free text is also why nothing here
 * trusts what comes back out of it.
 */

describe("the shape of a frame reaction", () => {
  it("goes out and comes back the same", () => {
    expect(frameIdOf(frameReaction("aurora"))).toBe("aurora");
    expect(frameIdOf(frameReaction("gold_ring-2"))).toBe("gold_ring-2");
  });

  it("an emoji is not a frame", () => {
    for (const e of ["❤️", "🥰", "😂", "👍", "frame", "framed"]) {
      expect(frameIdOf(e), e).toBeNull();
    }
  });

  it("and nor is any other word, however it happens to be spelled", () => {
    // Without the prefix check, "absolutely" is sliced to "utely" and
    // that looks exactly like an id. Short words hide this; long ones
    // do not.
    for (const word of ["absolutely", "whatever", "frameworks", "reaction"]) {
      expect(frameIdOf(word), word).toBeNull();
    }
  });

  it("and neither is a token that only starts like one", () => {
    // The column takes anything a client cares to write. A prefix is not
    // a promise, so the id still has to look like an id.
    for (const bad of [
      "frame:",
      "frame: ",
      "frame:../../etc",
      "frame:<img src=x>",
      "frame:a b",
      `frame:${"x".repeat(49)}`,
    ]) {
      expect(frameIdOf(bad), bad).toBeNull();
    }
  });

  it("but a long-enough real id still works", () => {
    expect(frameIdOf(`frame:${"x".repeat(48)}`)).toBe("x".repeat(48));
  });
});

describe("what it is called out loud", () => {
  it("an emoji reads as itself", () => {
    expect(reactionLabel("❤️")).toBe("❤️");
  });

  it("a frame reads as its name, not as its token", () => {
    // "frame: aurora" is a token. Nobody said that.
    expect(reactionLabel("frame:aurora", "Aurora")).toBe("Aurora");
  });

  it("and falls back to the id rather than to nothing", () => {
    // A frame the catalogue has dropped still has to be announced as
    // something.
    expect(reactionLabel("frame:aurora")).toBe("aurora");
    expect(reactionLabel("frame:aurora", "   ")).toBe("aurora");
  });
});

describe("where it is used", () => {
  const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const chat = read("src/components/messages/RealChatView.tsx");

  it("the picker offers the frames you can actually wear", () => {
    // Tier-gated, like everywhere else frames are shown. Offering one
    // somebody cannot wear is offering them a thing to be refused.
    expect(chat).toContain("wearableReactionFrames");
    expect(chat).toContain("canShow(f.tier, !!self?.isPremium)");
  });

  it("and the thread is told which tier the reader is", () => {
    // The filter is only as good as what it is filtering on. Without
    // this the gate silently reads undefined and nothing premium shows.
    const page = read("src/app/(app)/messages/[threadId]/page.tsx");
    expect(page).toContain("isPremium: !!mineProfile?.is_premium,");
  });

  it("a frame reaction draws the frame, an emoji draws the emoji", () => {
    // The chip draws through the glyph. Asserting frameIdOf appears is
    // not enough — the label alone uses it, so the chip could go back to
    // printing the raw token and this would still pass.
    expect(chat).toContain("<ReactionGlyph reaction={r.emoji} />");
    expect(chat).toContain("frameIdOf(r.emoji)");
  });

  it("and an unknown token falls back to text rather than to a hole", () => {
    // Free text column: a client can write anything into it, and what
    // the column held before any of this was text.
    expect(chat).toContain("ReactionGlyph");
    const glyph = chat.slice(chat.indexOf("function ReactionGlyph"));
    expect(glyph.slice(0, 700)).toContain("if (!id) return <>{reaction}</>;");
  });
});
