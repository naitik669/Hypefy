// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ALBUM_CAPTION_MAX,
  ALBUM_MAX_ITEMS,
  albumCount,
  albumSnippet,
  encodeAlbum,
  parseAlbum,
  type AlbumItem,
} from "@/lib/chat-album";

/**
 * Several photos and videos sent at once travel as one "album" message, drawn
 * as a folder with a frosted glass front.
 */

const photo = (n: number): AlbumItem => ({ url: `https://x/p${n}.jpg`, type: "image" });
const video = (n: number): AlbumItem => ({ url: `https://x/v${n}.mp4`, type: "video" });

describe("album body", () => {
  it("round-trips, trimming the caption to its limit and the items to the cap", () => {
    const items = Array.from({ length: ALBUM_MAX_ITEMS + 3 }, (_, i) => photo(i));
    const body = encodeAlbum({ caption: `  ${"a".repeat(60)}  `, items });
    const album = parseAlbum(body)!;
    expect(album.caption).toHaveLength(ALBUM_CAPTION_MAX);
    expect(album.items).toHaveLength(ALBUM_MAX_ITEMS);
  });

  it("refuses anything that isn't an album, without throwing", () => {
    expect(parseAlbum(null)).toBeNull();
    expect(parseAlbum("https://x/p.jpg")).toBeNull();
    expect(parseAlbum(JSON.stringify({ items: [] }))).toBeNull();
    expect(parseAlbum(JSON.stringify({ items: [{ url: "x", type: "exe" }] }))).toBeNull();
  });

  it("counts photos and videos the way the folder says them", () => {
    expect(albumCount([photo(1), photo(2), photo(3), photo(4), photo(5), video(1)])).toBe("5 photos · 1 video");
    expect(albumCount([video(1), video(2)])).toBe("2 videos");
    expect(albumSnippet(encodeAlbum({ caption: "Golden hour", items: [photo(1), photo(2)] }))).toBe("Golden hour");
    expect(albumSnippet(encodeAlbum({ caption: "", items: [photo(1), photo(2)] }))).toBe("2 photos");
  });
});

vi.mock("@/lib/overlay-stack", () => ({ useOverlayBackButton: () => {} }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

describe("the folder", () => {
  const album = { caption: "Golden hour walk", items: [photo(1), photo(2), video(1), photo(3), photo(4), photo(5)] };

  it("shows three in the deck, the rest as +N, and the caption with the count", async () => {
    const { MediaFolder } = await import("@/components/messages/MediaFolder");
    await act(async () => root.render(createElement(MediaFolder, { album, mine: false, onOpen: () => {} })));
    const folder = host.querySelector("[data-media-folder]")!;
    expect(folder.querySelectorAll("img, video")).toHaveLength(3);
    expect(folder.textContent).toContain("+3");
    expect(folder.textContent).toContain("Golden hour walk");
    expect(folder.textContent).toContain("5 photos · 1 video");
  });

  it("blurs through the glass, with nothing above it that would switch the blur off", async () => {
    const { MediaFolder } = await import("@/components/messages/MediaFolder");
    await act(async () => root.render(createElement(MediaFolder, { album, mine: true, onOpen: () => {} })));
    // jsdom drops backdrop-filter; the blur itself is checked in a real browser.
    const glass = host.querySelector<HTMLElement>("[data-glass]")!;
    expect(glass.style.clipPath).toContain("path(");
    for (let el = glass.parentElement; el && el !== host; el = el.parentElement) {
      expect(el.style.filter).toBe("");
      expect(el.style.opacity).toBe("");
    }
    // Sent folders are lime glass.
    expect(glass.style.background).toContain("163, 230, 53");
  });

  it("opens the viewer at the first item, and the viewer steps through all of them", async () => {
    const { MediaFolder, AlbumViewer } = await import("@/components/messages/MediaFolder");
    const onOpen = vi.fn();
    await act(async () => root.render(createElement(MediaFolder, { album, mine: false, onOpen })));
    await act(async () => (host.querySelector("[data-media-folder]") as HTMLButtonElement).click());
    expect(onOpen).toHaveBeenCalledWith(0);

    await act(async () => root.render(createElement(AlbumViewer, { album, start: 0, onClose: () => {} })));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("1 / 6");
    expect(dialog.querySelectorAll("img, video")).toHaveLength(6);
    expect(dialog.textContent).toContain("Golden hour walk");
  });
});
