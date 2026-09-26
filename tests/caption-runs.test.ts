import { describe, it, expect } from "vitest";
import { captionRuns } from "@/lib/caption-runs";

/**
 * Splitting a caption so the shadow can go on the words and not the emoji.
 *
 * The thing that actually breaks here is a multi-code-point emoji getting cut
 * in half — half of it styled as an emoji and half as a letter — so most of
 * these are the awkward ones rather than the plain one.
 */
describe("captionRuns", () => {
  it("leaves a caption with no emoji as a single run", () => {
    expect(captionRuns("going with it")).toEqual([{ text: "going with it", emoji: false }]);
  });

  it("separates a leading emoji from the words", () => {
    expect(captionRuns("🌊 going with it")).toEqual([
      { text: "🌊", emoji: true },
      { text: " going with it", emoji: false },
    ]);
  });

  it("keeps consecutive emoji in one run rather than one run each", () => {
    expect(captionRuns("🌊🌊🌊")).toEqual([{ text: "🌊🌊🌊", emoji: true }]);
  });

  it("keeps a zero-width-joined emoji whole", () => {
    // A family is several code points joined; split, half would lose the shadow.
    expect(captionRuns("👨‍👩‍👧")).toEqual([{ text: "👨‍👩‍👧", emoji: true }]);
  });

  it("keeps a skin-tone modifier with the hand it modifies", () => {
    expect(captionRuns("🫶🏽")).toEqual([{ text: "🫶🏽", emoji: true }]);
  });

  it("handles emoji in the middle and at the end", () => {
    expect(captionRuns("miss 🌊 this")).toEqual([
      { text: "miss ", emoji: false },
      { text: "🌊", emoji: true },
      { text: " this", emoji: false },
    ]);
    expect(captionRuns("done 💀")).toEqual([
      { text: "done ", emoji: false },
      { text: "💀", emoji: true },
    ]);
  });

  it("returns nothing for an empty caption", () => {
    expect(captionRuns("")).toEqual([]);
  });

  it("puts every character somewhere, in order", () => {
    const text = "🌊 going 👨‍👩‍👧 with 🫶🏽 it 💀";
    expect(captionRuns(text).map((r) => r.text).join("")).toBe(text);
  });
});
