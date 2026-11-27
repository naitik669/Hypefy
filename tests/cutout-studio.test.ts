// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * The studio screen, rendered for real with only the browser-bound engine
 * replaced (jsdom has no WebAssembly worker or canvas). The engine hands
 * back a chosen mask; everything from there — the stages, the edge choice,
 * the brush writing into the mask, Undo, what reaches onSend — is the real
 * component.
 */

const W = 20;
const H = 10;
const engine = vi.hoisted(() => ({
  mask: null as Uint8ClampedArray | null,
  /** Set to keep the cut running, so the cutting state can be looked at. */
  hold: null as Promise<void> | null,
  /** What the server answers: a mask, or null for "unavailable". */
  server: null as Uint8ClampedArray | null,
  devicesMade: 0,
  exported: [] as Uint8ClampedArray[],
}));

vi.mock("@/lib/cutout/engine", () => ({
  CutoutEngine: class {
    threads = 4;
    constructor() {
      engine.devicesMade++;
    }
    prepare() {
      return Promise.resolve(4);
    }
    async cut() {
      if (engine.hold) await engine.hold;
      return engine.mask!.slice();
    }
    dispose() {}
  },
  serverCut: async () => {
    if (engine.hold) await engine.hold;
    if (!engine.server) throw new Error("503");
    return engine.server.slice();
  },
  decodePhoto: async () => ({ rgba: new Uint8ClampedArray(W * H * 4).fill(200), w: W, h: H }),
  exportSticker: async (_photo: unknown, mask: Uint8ClampedArray) => {
    engine.exported.push(mask.slice());
    return { blob: new Blob(["x"], { type: "image/webp" }), w: 10, h: 10 };
  },
}));

import { CutoutStudio, type StudioResult } from "@/components/stickers/CutoutStudio";

class FakeImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ImageData", FakeImageData);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => setTimeout(() => f(0), 0));
  // jsdom answers getContext with null (and a warning); the studio copes.
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  host = document.createElement("div");
  document.body.appendChild(host);
  engine.exported = [];
  engine.hold = null;
  engine.server = null;
  engine.devicesMade = 0;
  // The whole picture kept, by default.
  engine.mask = new Uint8ClampedArray(W * H).fill(255);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function open(props: Partial<Parameters<typeof CutoutStudio>[0]> = {}) {
  const onSend = vi.fn(async (_r: StudioResult) => {});
  const onSave = vi.fn(async (_r: StudioResult) => {});
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(CutoutStudio, { onClose: () => {}, onSend, onSave, ...props }));
  });
  // Pick a photo through the real file input.
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [new File(["p"], "p.jpg", { type: "image/jpeg" })], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return { onSend, onSave };
}

const button = (label: string) =>
  [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent?.trim() === label) ?? null;

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    (el as HTMLElement).click();
  });
}

describe("CutoutStudio", () => {
  it("lands on the cut with Edit, the edge choice, Send and Save, and nowhere to type a name", async () => {
    await open();
    expect(button("Edit the cut")).not.toBeNull();
    expect(button("Stroke")?.getAttribute("aria-checked")).toBe("true");
    expect(button("Clean")?.getAttribute("aria-checked")).toBe("false");
    expect(button("Send")).not.toBeNull();
    expect(button("Save to my stickers")).not.toBeNull();
    // A sticker has no name: the only inputs are the two hidden file pickers.
    const inputs = [...host.querySelectorAll("input, textarea")].map((i) => (i as HTMLInputElement).type);
    expect(inputs).toEqual(["file", "file"]);
  });

  it("sends with the edge that was chosen", async () => {
    const { onSend, onSave } = await open();
    await click(button("Clean"));
    await click(button("Send"));
    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0][0]).toMatchObject({ edge: "clean", w: 10, h: 10 });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("stroke is the default edge, and Save goes to onSave", async () => {
    const { onSend, onSave } = await open();
    await click(button("Save to my stickers"));
    expect(onSave.mock.calls[0][0]).toMatchObject({ edge: "stroke" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("outside a chat there is only Save", async () => {
    const onSave = vi.fn(async (_r: StudioResult) => {});
    await open({ onSend: undefined, onSave });
    expect(button("Send")).toBeNull();
    await click(button("Save to my stickers"));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("a photo with no subject opens on the brush and cannot be sent empty", async () => {
    engine.mask = new Uint8ClampedArray(W * H);
    await open();
    expect(host.textContent).toContain("Nothing stood out");
    expect(button("Keep")).not.toBeNull();
    expect((button("Done") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Edit opens Keep, Erase, Undo and Start again, with Undo off until something is painted", async () => {
    await open();
    await click(button("Edit the cut"));
    for (const l of ["Keep", "Erase", "Start again"]) expect(button(l)).not.toBeNull();
    expect((button("Undo") as HTMLButtonElement).disabled).toBe(true);
    expect(button("Keep")?.getAttribute("aria-pressed")).toBe("true");
  });

  /** Put the picture at 0,0 on screen at 2 screen px per photo px. */
  function placeFrame() {
    const canvas = host.querySelector('canvas[aria-label="Your sticker"]')!;
    const frame = canvas.parentElement!;
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: W * 2, height: H * 2, right: W * 2, bottom: H * 2, x: 0, y: 0, toJSON() {} });
    return frame.parentElement!; // the stage, which takes the pointer
  }

  async function drag(stage: Element, points: [number, number][]) {
    const fire = (type: string, [x, y]: [number, number]) =>
      stage.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }));
    await act(async () => {
      fire("pointerdown", points[0]);
      for (const p of points.slice(1)) fire("pointermove", p);
      fire("pointerup", points[points.length - 1]);
    });
  }

  it("Erase with a finger removes exactly what it was dragged over, and Undo brings it back", async () => {
    await open();
    await click(button("Edit the cut"));
    await click(button("Erase"));
    const stage = placeFrame();
    // Brush 24 screen px = 12 photo px wide; a drag along the top-left.
    await drag(stage, [[2, 2], [6, 2]]);
    await click(button("Done"));
    await click(button("Send"));
    let sent = engine.exported.at(-1)!;
    expect(sent[0]).toBe(0); // under the finger: gone
    expect(sent[W * H - 1]).toBe(255); // far corner: untouched
    // Undo restores the mask before the stroke.
    await click(button("Edit the cut"));
    await click(button("Undo"));
    await click(button("Done"));
    await click(button("Send"));
    sent = engine.exported.at(-1)!;
    expect(sent.every((v) => v === 255)).toBe(true);
  });

  it("Keep paints back what the model missed, and Start again returns to the model's cut", async () => {
    engine.mask = new Uint8ClampedArray(W * H);
    engine.mask[W * H - 1] = 255; // the model kept one corner pixel
    await open();
    await click(button("Edit the cut"));
    const stage = placeFrame();
    await drag(stage, [[2, 2], [4, 4]]);
    await click(button("Done"));
    await click(button("Send"));
    expect(engine.exported.at(-1)![0]).toBe(255);
    await click(button("Edit the cut"));
    await click(button("Start again"));
    await click(button("Done"));
    await click(button("Send"));
    const sent = engine.exported.at(-1)!;
    expect(sent[0]).toBe(0);
    expect(sent[W * H - 1]).toBe(255);
  });

  it("while it cuts, the photo is scanned by a moving line, with no spinner and no pill", async () => {
    let release = () => {};
    engine.hold = new Promise<void>((r) => (release = r));
    await open();
    expect(host.querySelector(".sticker-scan .sticker-scan-beam")).not.toBeNull();
    expect(host.querySelector(".animate-spin")).toBeNull();
    expect(host.textContent).not.toContain("Cutting it out…");
    await act(async () => {
      release();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(host.querySelector(".sticker-scan")).toBeNull();
    expect(button("Edit the cut")).not.toBeNull();
  });

  it("cuts on the server when it answers, and never starts the 46 MB device model", async () => {
    engine.server = new Uint8ClampedArray(W * H).fill(255);
    engine.server[0] = 0;
    const { onSend } = await open();
    expect(engine.devicesMade).toBe(0);
    await click(button("Send"));
    expect(onSend).toHaveBeenCalledOnce();
    expect(engine.exported.at(-1)![0]).toBe(0);
  });

  it("falls back to the device model when the server can't cut", async () => {
    await open();
    expect(engine.devicesMade).toBe(1);
    expect(button("Edit the cut")).not.toBeNull();
  });

  it("layout E puts the tools on the picture as soon as the cut lands", async () => {
    await open({ layout: "E" });
    expect(button("Keep")).not.toBeNull();
    expect(button("Edit the cut")).toBeNull();
    expect(button("Edge: stroke")).not.toBeNull();
  });
});
