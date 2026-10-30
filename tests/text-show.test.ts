import { describe, it, expect } from "vitest";
import { TEXT_SHOW_BACKGROUNDS, familyFor, fitText, wrapLines } from "@/lib/text-show";

// A font where every character is 10 wide.
const measure = (s: string) => s.length * 10;

describe("wrapping a text Show", () => {
  it("breaks on spaces to fit the width", () => {
    expect(wrapLines("who is up for chai at six", measure, 100)).toEqual(["who is up", "for chai", "at six"]);
  });

  it("keeps the writer's own line breaks", () => {
    expect(wrapLines("one\n\ntwo", measure, 100)).toEqual(["one", "", "two"]);
  });

  it("cuts a word too wide for any line instead of running off the edge", () => {
    expect(wrapLines("aaaaaaaaaaaaaa", measure, 50)).toEqual(["aaaaa", "aaaaa", "aaaa"]);
  });
});

describe("sizing a text Show", () => {
  const at = (s: string, size: number) => (s.length * size) / 2;

  it("short words get the biggest size", () => {
    expect(fitText("hi", at, { width: 860, height: 1150 }).size).toBe(132);
  });

  it("a long thought shrinks until it fits the box", () => {
    const long = "this is a much longer thought that goes on and on for quite a while ".repeat(3);
    const { size, lines } = fitText(long, at, { width: 860, height: 1150 });
    expect(size).toBeLessThan(132);
    expect(lines.length * size * 1.15).toBeLessThanOrEqual(1150);
  });
});

describe("text Show styles and colours", () => {
  it("uses the font the screen showed, read from the page's variable", () => {
    const vars: Record<string, string> = { "--font-jakarta": " '__Jakarta_abc', sans-serif" };
    expect(familyFor("bold", (n) => vars[n] ?? "")).toBe("'__Jakarta_abc', sans-serif");
    expect(familyFor("mono", () => "")).toContain("monospace");
    expect(familyFor("marker", () => "")).toBe("system-ui, sans-serif");
  });

  it("every background's ink reads on it (WCAG 4.5:1)", () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    for (const b of TEXT_SHOW_BACKGROUNDS) {
      const [hi, lo] = [lum(b.bg), lum(b.ink)].sort((x, y) => y - x);
      expect((hi + 0.05) / (lo + 0.05), b.id).toBeGreaterThanOrEqual(4.5);
    }
  });
});
