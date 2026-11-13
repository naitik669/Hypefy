import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * One width in every state, and not in the brand's lime.
 *
 * "Follow" is six characters and "Following" is nine, so a button sized to
 * its own text changed width under the thumb that pressed it. On a feed card
 * the ⋯ sits beside it, so it moved that too.
 *
 * The fix reserves the widest word rather than setting a min-width in
 * pixels: a measured guess is only correct for the font it was measured in,
 * and stacking the words in one grid cell is correct by construction.
 */

const button = readFileSync("src/components/profile/FollowButton.tsx", "utf8").replace(/\r\n/g, "\n");

describe("one size in every state", () => {
  it("reserves every word the button can say", () => {
    expect(button).toContain('const widths = [...new Set([followLabel, "Following", "Requested"])];');
  });

  it("stacked in one cell, so the widest sets the width", () => {
    expect(button).toContain('<span className="grid">');
    expect(button).toContain("col-start-1 row-start-1");
  });

  it("by construction, not by a measured guess", () => {
    // A min-width in pixels is right only for the font it was measured in.
    expect(button).not.toMatch(/min-w-\[\d+px\]/);
  });

  it("and the ones not being shown are hidden from a reader too", () => {
    // Otherwise the button announces "Follow Following Requested".
    expect(button).toContain("aria-hidden={w !== label}");
    expect(button).toContain('${w === label ? "" : "invisible"}');
  });

  it("deduplicated, so a custom label that is already one of them is fine", () => {
    // followLabel can be "Following" on some surface; two children with the
    // same key is a React warning and a wasted cell.
    expect(button).toContain("new Set([followLabel");
  });
});

describe("not lime", () => {
  it("the unpressed state is the app's white fill", () => {
    // The same pair the style editor's tabs and the call controls use.
    expect(button).toContain('"bg-foreground text-background hover:bg-foreground/90"');
  });

  it("the accent is gone from it entirely", () => {
    // Lime is already carrying the hype star, the slider's average and the
    // rehype mark. A Follow button in it reads as another of those.
    expect(button).not.toContain("bg-accent");
    expect(button).not.toContain("text-accent-ink");
  });

  it("and Following still reads as the quieter of the two", () => {
    expect(button).toContain('"border border-border bg-surface text-foreground hover:bg-elevated"');
  });
});

describe("the three words are unchanged", () => {
  it("Follow, Requested, Following", () => {
    expect(button).toContain('? "Following"');
    expect(button).toContain('? "Requested"');
    expect(button).toContain(": followLabel;");
  });
});
