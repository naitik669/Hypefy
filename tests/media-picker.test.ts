// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PickEntry } from "@/components/messages/MediaPicker";

/**
 * The paperclip's sheet: a camera tile, a Gallery tile, this chat's photos,
 * tabs for the rest, and a caption with Send once anything is picked.
 */

vi.mock("@/lib/useFocusTrap", () => ({ useFocusTrap: () => ({ current: null }) }));

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`);
  URL.revokeObjectURL = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

const recents = [
  { url: "https://cdn/a.jpg", type: "image" as const },
  { url: "https://cdn/b.mp4", type: "video" as const },
  { url: "https://cdn/c.jpg", type: "image" as const },
];

async function open(props: Partial<Record<string, unknown>> = {}) {
  const { MediaPicker } = await import("@/components/messages/MediaPicker");
  const handlers = {
    onClose: vi.fn(),
    onSend: vi.fn<(e: PickEntry[], c: string) => void>(),
    onFile: vi.fn(),
    onGif: vi.fn(),
    onViewOnce: vi.fn(),
    onRejected: vi.fn(),
  };
  await act(async () => root.render(createElement(MediaPicker, { open: true, recents, ...handlers, ...props })));
  return handlers;
}

const tiles = () => [...document.querySelectorAll<HTMLButtonElement>("[data-picker-grid] button[aria-pressed]")];
const click = (el: Element) => act(async () => void (el as HTMLElement).click());

describe("media picker", () => {
  it("shows the camera, the gallery and this chat's photos, with tabs underneath", async () => {
    await open();
    expect(document.querySelector("[data-camera-tile]")).toBeTruthy();
    expect(document.querySelector("[data-picker-grid]")!.textContent).toContain("Gallery");
    expect(tiles()).toHaveLength(3);
    expect(document.querySelector("[data-picker-tabs]")!.textContent).toMatch(/Photos.*File.*GIF.*View once/);
  });

  it("numbers picks in order and swaps the tabs for a caption and Send", async () => {
    await open();
    await click(tiles()[2]);
    await click(tiles()[0]);
    expect(tiles()[2].textContent).toContain("1");
    expect(tiles()[0].textContent).toContain("2");
    expect(document.querySelector("[data-picker-tabs]")).toBeNull();
    expect(document.querySelector('[aria-label="Send 2"]')).toBeTruthy();
    await click(tiles()[2]);
    expect(tiles()[0].textContent).toContain("1");
  });

  it("sends the picks in the order they were picked, with the caption", async () => {
    const h = await open();
    await click(tiles()[1]);
    await click(tiles()[0]);
    const caption = document.querySelector('[aria-label="Caption"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(caption, "the roof");
      caption.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(document.querySelector('[aria-label="Send 2"]')!);
    const [entries, text] = h.onSend.mock.calls[0];
    expect(entries.map((e) => e.url)).toEqual(["https://cdn/b.mp4", "https://cdn/a.jpg"]);
    expect(text).toBe("the roof");
    expect(h.onClose).toHaveBeenCalled();
  });

  it("adds gallery picks at the front, already picked, and turns away what can't be sent", async () => {
    const h = await open();
    const input = document.querySelector("[data-gallery-input]") as HTMLInputElement;
    const big = new File(["x"], "big.jpg", { type: "image/jpeg" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    const files = [new File(["a"], "new.jpg", { type: "image/jpeg" }), big, new File(["p"], "doc.pdf", { type: "application/pdf" })];
    Object.defineProperty(input, "files", { value: files, configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(tiles()).toHaveLength(4);
    expect(tiles()[0].getAttribute("aria-pressed")).toBe("true");
    expect(h.onRejected).toHaveBeenCalled();
  });

  it("stops at ten", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ url: `https://cdn/${i}.jpg`, type: "image" as const }));
    const h = await open({ recents: many });
    for (const t of tiles()) await click(t);
    expect(tiles().filter((t) => t.getAttribute("aria-pressed") === "true")).toHaveLength(10);
    expect(h.onRejected).toHaveBeenCalledWith("Up to 10 at a time.");
  });

  it("hands File, GIF and View once back to the chat", async () => {
    const h = await open();
    const tab = (label: string) =>
      [...document.querySelectorAll("[data-picker-tabs] button")].find((b) => b.textContent?.includes(label))!;
    await click(tab("File"));
    await click(tab("GIF"));
    await click(tab("View once"));
    expect(h.onFile).toHaveBeenCalled();
    expect(h.onGif).toHaveBeenCalled();
    expect(h.onViewOnce).toHaveBeenCalled();
  });

  it("opens the camera from the tile, and says so when the camera isn't allowed", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" })) },
    });
    await open();
    await click(document.querySelector("[data-camera-tile]")!);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    const cam = document.querySelector('[aria-label="Camera"][role="dialog"]')!;
    expect(cam).toBeTruthy();
    expect(cam.textContent).toContain("Hypefy can't use your camera");
    expect(cam.textContent).toContain("Try again");
  });
});
