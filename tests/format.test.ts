import { describe, it, expect } from "vitest";
import { formatCount } from "@/lib/format";

describe("formatCount", () => {
  it("leaves sub-1000 as-is", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
  });
  it("compacts thousands with one decimal, trimming .0", () => {
    expect(formatCount(1000)).toBe("1k");
    expect(formatCount(1200)).toBe("1.2k");
  });
  it("rounds to whole k at >=10k", () => {
    expect(formatCount(12000)).toBe("12k");
    expect(formatCount(12900)).toBe("13k");
  });
});
