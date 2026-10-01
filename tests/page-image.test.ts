// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { fitText, savePageImage, wrapText } from "@/lib/page-image";

/**
 * Saving a page as a picture. The drawing itself needs a canvas, so what is
 * tested here is the part that decides what the picture says: where the words
 * break, how big they are, and that a page that was not saved never says it
 * was.
 */

/** A stand-in for a font: every character the same width. */
const measure = (w: number) => (s: string) => s.length * w;

describe("wrapText", () => {
  it("fills each line as far as it goes", () => {
    expect(wrapText("one two three four", 100, measure(10))).toEqual(["one two", "three four"]);
  });

  it("gives a word too long for the line a line of its own rather than cutting it", () => {
    expect(wrapText("a supercalifragilistic b", 60, measure(10))).toEqual(["a", "supercalifragilistic", "b"]);
  });

  it("keeps the lines the writer put in", () => {
    expect(wrapText("one\ntwo", 200, measure(10))).toEqual(["one", "two"]);
  });

  it("has nothing to say about an empty page", () => {
    expect(wrapText("", 200, measure(10))).toEqual([""]);
  });
});

describe("fitText", () => {
  // Half the size per character, about what a bold face runs to.
  const measureAt = (size: number, s: string) => s.length * size * 0.5;

  it("keeps a short page large", () => {
    const { size, lines } = fitText("hi", 1000, 6, measureAt);
    expect(size).toBe(128);
    expect(lines).toEqual(["hi"]);
  });

  it("comes down until a long page fits the lines it is allowed", () => {
    const text = "late night drive with the windows down and nowhere to be at all";
    const { size, lines } = fitText(text, 900, 3, measureAt);
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(Math.max(...lines.map((l) => measureAt(size, l)))).toBeLessThanOrEqual(900);
    // And it did not go smaller than it had to.
    // And it did not go smaller than it had to: a step up no longer fits.
    const bigger = fitText(text, 900, 3, measureAt, [size + 12]);
    expect(bigger.lines.length).toBeGreaterThan(3);
  });

  it("gives up at the smallest size rather than cutting a word that cannot fit", () => {
    const { size, lines } = fitText("wall".repeat(200), 100, 1, measureAt, [40, 30]);
    expect(size).toBe(30);
    // One unbroken word: it stays whole and runs over, which is better than
    // a page that says "wallwallwa".
    expect(lines).toHaveLength(1);
  });
});

describe("savePageImage", () => {
  const blob = new Blob(["x"], { type: "image/png" });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubNavigator(over: Record<string, unknown>) {
    vi.stubGlobal("navigator", { ...navigator, ...over });
  }

  it("offers the share sheet where there is one — that is how a picture reaches a camera roll", async () => {
    const share = vi.fn(async () => {});
    stubNavigator({ canShare: () => true, share });
    expect(await savePageImage(blob, "page.png")).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("downloads when the phone cannot share files", async () => {
    stubNavigator({ canShare: () => false });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    expect(await savePageImage(blob, "page.png")).toBe("downloaded");
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it("treats closing the share sheet as done, not as a failure", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    stubNavigator({ canShare: () => true, share: vi.fn(async () => { throw abort; }) });
    expect(await savePageImage(blob, "page.png")).toBe("shared");
  });

  it("falls back to a download when sharing fails for a real reason", async () => {
    stubNavigator({ canShare: () => true, share: vi.fn(async () => { throw new Error("no"); }) });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    expect(await savePageImage(blob, "page.png")).toBe("downloaded");
    click.mockRestore();
  });

  it("says so when it could not be saved at all", async () => {
    stubNavigator({ canShare: () => false });
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => {
        throw new Error("no object urls here");
      },
    });
    expect(await savePageImage(blob, "page.png")).toBe("failed");
  });
});
