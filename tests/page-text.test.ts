import { describe, expect, it } from "vitest";
import { pageText } from "@/lib/diary";

describe("pageText", () => {
  it("keeps a page's words as they are", () => {
    expect(pageText("sunset run")).toBe("sunset run");
  });

  it("names a page that is only a photo", () => {
    expect(pageText("")).toBe("📷 Photo");
    expect(pageText("   ")).toBe("📷 Photo");
    expect(pageText(null)).toBe("📷 Photo");
  });
});
