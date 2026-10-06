// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { extensionFor, fetchPhoto, fitText, isHandheld, savePageImage, wrapText } from "@/lib/page-image";

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

  /** A phone unless told otherwise: the share sheet is a phone's way of saving. */
  function stubNavigator(over: Record<string, unknown>) {
    vi.stubGlobal("navigator", { ...navigator, userAgentData: { mobile: true }, ...over });
  }

  it("downloads on a computer even when the browser says it can share files", async () => {
    // Windows offers a share dialog that cannot take a picture from the
    // browser: it opens a panel saying so, and nothing is saved.
    const share = vi.fn(async () => {});
    stubNavigator({ userAgentData: { mobile: false }, canShare: () => true, share });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    expect(await savePageImage(blob, "page.png")).toBe("downloaded");
    expect(share).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it("shares a photo as the JPEG it is, not relabelled as a PNG", async () => {
    const share = vi.fn<(d: { files: File[] }) => Promise<void>>(async () => {});
    stubNavigator({ canShare: () => true, share });
    await savePageImage(new Blob(["x"], { type: "image/jpeg" }), "photo.jpg");
    expect(share.mock.calls[0][0].files[0].type).toBe("image/jpeg");
  });

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

describe("phone or computer", () => {
  it("takes the browser's own answer when it gives one", () => {
    expect(isHandheld({ uaMobile: true, coarsePointer: false })).toBe(true);
    // A touchscreen laptop is still a computer.
    expect(isHandheld({ uaMobile: false, coarsePointer: true })).toBe(false);
  });
  it("goes by a touch-first pointer where the browser does not say", () => {
    expect(isHandheld({ coarsePointer: true })).toBe(true);
    expect(isHandheld({ coarsePointer: false })).toBe(false);
    expect(isHandheld({})).toBe(false);
  });
});

describe("a photo page's photo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is fetched as the file it is", async () => {
    const jpeg = new Blob(["x"], { type: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => jpeg })));
    expect(await fetchPhoto("https://x/p.jpg")).toBe(jpeg);
  });

  it("is nothing when it cannot be fetched, or is not a picture, so the page is drawn instead", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, blob: async () => new Blob() })));
    expect(await fetchPhoto("https://x/p.jpg")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, blob: async () => new Blob(["<html>"], { type: "text/html" }) })));
    expect(await fetchPhoto("https://x/p.jpg")).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await fetchPhoto("https://x/p.jpg")).toBeNull();
  });

  it("is named for its type", () => {
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/webp")).toBe("webp");
    expect(extensionFor("")).toBe("jpg");
  });
});
