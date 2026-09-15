import { describe, it, expect } from "vitest";
import {
  applyFilterPixels,
  carouselOrder,
  filterById,
  filterCss,
  NORMAL,
  PHOTO_FILTERS,
  toggleFavorite,
} from "@/lib/photo-filters";
import { cropRect, fitWithin, pickMainBackCamera } from "@/lib/photo-capture";

describe("filters", () => {
  it("each has a unique id and a name", () => {
    expect(new Set(PHOTO_FILTERS.map((f) => f.id)).size).toBe(PHOTO_FILTERS.length);
    for (const f of PHOTO_FILTERS) expect(f.name).toBeTruthy();
  });

  it("writes CSS the viewfinder can use", () => {
    expect(filterCss(NORMAL)).toBe("none");
    expect(filterCss(filterById("cool"))).toBe("saturate(1.1) hue-rotate(-12deg) brightness(1.03)");
  });

  it("draws the saved photo the way CSS draws the preview", () => {
    // grayscale(1) of pure red is its luminance, 0.2126 of 255
    const px = new Uint8ClampedArray([255, 0, 0, 255]);
    applyFilterPixels(px, { id: "t", name: "t", ops: [["grayscale", 1]] });
    expect([px[0], px[1], px[2]]).toEqual([54, 54, 54]);

    // contrast pivots on mid-grey; brightness scales
    const grey = new Uint8ClampedArray([200, 128, 50, 255]);
    applyFilterPixels(grey, { id: "t", name: "t", ops: [["contrast", 2]] });
    expect([grey[0], grey[1], grey[2]]).toEqual([255, 128, 0]);
    const dim = new Uint8ClampedArray([200, 100, 50, 255]);
    applyFilterPixels(dim, { id: "t", name: "t", ops: [["brightness", 0.5]] });
    expect([dim[0], dim[1], dim[2]]).toEqual([100, 50, 25]);
    // alpha untouched
    expect(dim[3]).toBe(255);
  });
});

describe("carousel order", () => {
  it("puts favourites left of Normal and the rest right", () => {
    const order = carouselOrder(["noir", "vivid"]).map((f) => f.id);
    const n = order.indexOf("normal");
    expect(order.slice(0, n)).toEqual(["noir", "vivid"]);
    expect(order.slice(n + 1)).not.toContain("noir");
    expect(order).toHaveLength(PHOTO_FILTERS.length);
  });

  it("ignores unknown ids and never favourites Normal", () => {
    expect(carouselOrder(["gone", "normal"])[0].id).toBe("normal");
    expect(toggleFavorite([], "normal")).toEqual([]);
    expect(toggleFavorite(["mono"], "mono")).toEqual([]);
    expect(toggleFavorite(["mono"], "rose")).toEqual(["mono", "rose"]);
  });
});

describe("photo framing", () => {
  it("crops a 3:4 still to the 9:16 viewfinder, full height", () => {
    expect(cropRect(3000, 4000, 9 / 16)).toEqual({ sx: 375, sy: 0, sw: 2250, sh: 4000 });
  });

  it("caps the size without upscaling", () => {
    expect(fitWithin(2250, 4000, 2560)).toEqual({ w: 1440, h: 2560 });
    expect(fitWithin(720, 1280, 2560)).toEqual({ w: 720, h: 1280 });
  });

  it("picks the main back lens, not a zoom lens", () => {
    const devices = [
      { kind: "videoinput", deviceId: "front", label: "camera2 1, facing front" },
      { kind: "videoinput", deviceId: "tele", label: "camera2 2, facing back" },
      { kind: "videoinput", deviceId: "main", label: "camera2 0, facing back" },
    ];
    expect(pickMainBackCamera(devices, "tele")).toBe("main");
    expect(pickMainBackCamera(devices, "main")).toBeNull();
    expect(pickMainBackCamera(devices.slice(0, 2), "tele")).toBeNull();
  });
});
