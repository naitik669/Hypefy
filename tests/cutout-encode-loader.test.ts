import { describe, it, expect, vi } from "vitest";
import { encodeSticker, STICKER_MAX_BYTES, type EncodeDeps } from "@/lib/cutout/encode";
import { loadModelBytes, pruneOldModels, MODEL_URL, MODEL_CACHE, MODEL_BYTES } from "@/lib/cutout/model-loader";
import { stageAfterCut, STUDIO_LAYOUT } from "@/lib/cutout/studio-layout";

/**
 * Encoding and the one-time model download, driven through the
 * dependencies they take: a fake encoder that behaves like Safari or
 * Chrome, and a fake fetch and Cache Storage.
 */

/** An encoder whose output size is bytes-per-pixel × pixels, of a chosen type. */
function fakeEncoder(opts: { webp: boolean; bytesPerPixel: number }) {
  const calls: { type: string; w: number; h: number }[] = [];
  const deps: EncodeDeps = {
    scale: (_rgba, _w, _h, tw, th) => new Uint8ClampedArray(tw * th * 4),
    encoder: (_rgba, w, h) => async (type) => {
      calls.push({ type, w, h });
      // Safari: asked for WebP, it hands back a PNG.
      const out = type === "image/webp" && !opts.webp ? "image/png" : type;
      return new Blob([new Uint8Array(Math.round(w * h * opts.bytesPerPixel))], { type: out });
    },
  };
  return { deps, calls };
}

describe("encodeSticker", () => {
  it("prefers WebP and caps the long side at 512", async () => {
    const { deps, calls } = fakeEncoder({ webp: true, bytesPerPixel: 0.5 });
    const r = await encodeSticker(new Uint8ClampedArray(1000 * 500 * 4), 1000, 500, deps);
    expect(r).not.toBeNull();
    expect(r!.blob.type).toBe("image/webp");
    expect([r!.w, r!.h]).toEqual([512, 256]);
    expect(calls).toEqual([{ type: "image/webp", w: 512, h: 256 }]);
  });

  it("falls back to PNG where the browser cannot encode WebP", async () => {
    const { deps } = fakeEncoder({ webp: false, bytesPerPixel: 0.5 });
    const r = await encodeSticker(new Uint8ClampedArray(100 * 100 * 4), 100, 100, deps);
    expect(r!.blob.type).toBe("image/png");
  });

  it("asks for PNG when the browser answers the WebP request with nothing usable", async () => {
    const types: string[] = [];
    const deps: EncodeDeps = {
      scale: (_r, _w, _h, tw, th) => new Uint8ClampedArray(tw * th * 4),
      encoder: () => async (type) => {
        types.push(type);
        return type === "image/png" ? new Blob(["p"], { type }) : null;
      },
    };
    const r = await encodeSticker(new Uint8ClampedArray(4 * 4 * 4), 4, 4, deps);
    expect(types).toEqual(["image/webp", "image/png"]);
    expect(r!.blob.type).toBe("image/png");
  });

  it("shrinks until the file fits the bucket's 1 MB cap", async () => {
    // 6 bytes a pixel: 512×512 is 1.5 MB, 384×384 is 0.84 MB.
    const { deps, calls } = fakeEncoder({ webp: true, bytesPerPixel: 6 });
    const r = await encodeSticker(new Uint8ClampedArray(512 * 512 * 4), 512, 512, deps);
    expect(r!.blob.size).toBeLessThanOrEqual(STICKER_MAX_BYTES);
    expect([r!.w, r!.h]).toEqual([384, 384]);
    expect(calls.map((c) => c.w)).toEqual([512, 384]);
  });

  it("gives up rather than send a postage stamp", async () => {
    const { deps } = fakeEncoder({ webp: true, bytesPerPixel: 1000 });
    expect(await encodeSticker(new Uint8ClampedArray(512 * 512 * 4), 512, 512, deps)).toBeNull();
  });
});

function fakeCaches(entry?: ArrayBuffer) {
  const store = new Map<string, ArrayBuffer>();
  if (entry) store.set(MODEL_URL, entry);
  const cache = {
    match: vi.fn(async (u: string) => (store.has(u) ? new Response(store.get(u)!.slice(0)) : undefined)),
    put: vi.fn(async (u: string, r: Response) => void store.set(u, await r.arrayBuffer())),
    delete: vi.fn(async (u: string) => store.delete(u)),
  };
  const names = new Set([MODEL_CACHE, "hypefy-cutout-v0", "something-else"]);
  return {
    store,
    cache,
    names,
    caches: {
      open: vi.fn(async () => cache as unknown as Cache),
      keys: vi.fn(async () => [...names]),
      delete: vi.fn(async (n: string) => names.delete(n)),
    },
  };
}

const model = () => new Uint8Array(MODEL_BYTES).buffer;

describe("loadModelBytes", () => {
  it("downloads once, reports progress, and stores the bytes", async () => {
    const c = fakeCaches();
    const fetch = vi.fn(async () => new Response(model(), { headers: { "content-length": String(MODEL_BYTES) } }));
    const seen: number[] = [];
    const buf = await loadModelBytes({ fetch, caches: c.caches }, (p) => seen.push(p.loaded));
    expect(buf.byteLength).toBe(MODEL_BYTES);
    expect(fetch).toHaveBeenCalledWith(MODEL_URL);
    expect(seen.at(-1)).toBe(MODEL_BYTES);
    expect(c.store.get(MODEL_URL)?.byteLength).toBe(MODEL_BYTES);
  });

  it("a second visit reads the cache and never touches the network", async () => {
    const c = fakeCaches(model());
    const fetch = vi.fn();
    const buf = await loadModelBytes({ fetch, caches: c.caches });
    expect(buf.byteLength).toBe(MODEL_BYTES);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a truncated cache entry is thrown away and downloaded again", async () => {
    const c = fakeCaches(new Uint8Array(10).buffer);
    const fetch = vi.fn(async () => new Response(model()));
    const buf = await loadModelBytes({ fetch, caches: c.caches });
    expect(fetch).toHaveBeenCalledOnce();
    expect(buf.byteLength).toBe(MODEL_BYTES);
  });

  it("a failed download is an error, not a half-model", async () => {
    await expect(loadModelBytes({ fetch: async () => new Response("nope", { status: 404 }) })).rejects.toThrow(/404/);
    await expect(loadModelBytes({ fetch: async () => new Response(new Uint8Array(5)) })).rejects.toThrow(/expected/);
  });

  it("works with no Cache Storage at all", async () => {
    const buf = await loadModelBytes({ fetch: async () => new Response(model()) });
    expect(buf.byteLength).toBe(MODEL_BYTES);
  });

  it("pruneOldModels removes only earlier cutout caches", async () => {
    const c = fakeCaches();
    await pruneOldModels({ fetch: vi.fn(), caches: c.caches });
    expect([...c.names].sort()).toEqual([MODEL_CACHE, "something-else"].sort());
  });
});

describe("studio layout switch", () => {
  it("D opens on the cut, E opens straight into the tools", () => {
    expect(stageAfterCut("D")).toBe("cut");
    expect(stageAfterCut("E")).toBe("edit");
  });
  it("ships as D, the shape Naitik described, until he picks otherwise", () => {
    expect(STUDIO_LAYOUT).toBe("D");
  });
});

describe("the way into the studio", async () => {
  const { stickerStudioHref, openStickerStudio } = await import("@/lib/cutout/studio-href");
  it("carries the conversation the sticker is for", () => {
    expect(stickerStudioHref("abc-1")).toBe("/stickers/new?to=abc-1");
    expect(stickerStudioHref(null)).toBe("/stickers/new");
  });
  it("is a full navigation, so the studio document loads cross-origin isolated", () => {
    const nav = { assign: vi.fn() };
    openStickerStudio("abc-1", nav);
    expect(nav.assign).toHaveBeenCalledOnce();
    expect(nav.assign).toHaveBeenCalledWith("/stickers/new?to=abc-1");
  });
});
