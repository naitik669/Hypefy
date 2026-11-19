import { describe, it, expect } from "vitest";
import { followLabel } from "@/lib/follow";
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

describe("a raised chip, not a slab", () => {
  it("Follow is the app's raised surface, lifted by a hairline", () => {
    expect(button).toContain('"border border-white/[0.14] bg-elevated text-foreground hover:bg-border"');
  });

  it("neither the lime nor the white slab is left", () => {
    // Lime is already carrying the hype star, the slider's average and the
    // rehype mark, so a Follow button in it read as another of those; the
    // white that replaced it was the brightest thing on the card.
    expect(button).not.toContain("bg-accent");
    expect(button).not.toContain("text-accent-ink");
    expect(button).not.toContain("bg-foreground text-background");
  });

  it("and Following is quieter than Follow, not louder", () => {
    // Follow is a thing to do; Following is a state you are already in. So
    // the one that still wants pressing is the one with a fill, and the
    // settled one goes hollow and grey.
    expect(button).toContain('"border border-border bg-transparent text-muted hover:text-foreground"');
  });

  it("built from tokens, not from hexes picked off a mockup", () => {
    // elevated, border, muted and foreground are all in globals.css. A raw
    // #262626 here would be a colour nothing else in the app could match.
    expect(button).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe("the three words are unchanged", () => {
  /*
   * Asserted by CALLING the thing that chooses them, not by reading the
   * ternary that used to be in this file.
   *
   * The words moved to @hypefy/core/follow when the Expo client needed
   * them, and the old assertions were on the spelling — `'? "Following"'`
   * — so they failed on a move that changed no behaviour. Checking the
   * behaviour instead means this test now covers BOTH clients' words
   * rather than one file's source, which is the thing it was named for.
   */
  it("Follow, Requested, Following", () => {
    expect(followLabel("none")).toBe("Follow");
    expect(followLabel("following")).toBe("Following");
    expect(followLabel("requested")).toBe("Requested");
  });

  it("and a surface may ask for its own word in place of Follow, only there", () => {
    // The feed card passes one; "Following" and "Requested" are states and
    // are never a caller's to rename.
    expect(followLabel("none", "Follow back")).toBe("Follow back");
    expect(followLabel("following", "Follow back")).toBe("Following");
    expect(followLabel("requested", "Follow back")).toBe("Requested");
  });

  it("and the button still takes them from there", () => {
    expect(button).toContain('from "@/lib/follow"');
    expect(button).toContain("labelFor(state, followLabel)");
  });
});
