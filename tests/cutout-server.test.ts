import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { falCutout, FAL_BIREFNET_URL, CUTOUT_MAX_BYTES } from "@/lib/cutout/fal-cutout";
import { cutWithFallback, type DeviceCutter } from "@/lib/cutout/cut";
import { maskFromImage } from "@/lib/cutout/mask";

/**
 * The server cutout (BiRefNet on fal.ai) and the fallback to the device,
 * driven through the fetch and cutters they are given.
 */

const photo = new Uint8Array([1, 2, 3, 4]).buffer;
const MASK = new Uint8Array([137, 80, 78, 71]).buffer;

function fakeFal(opts: { status?: number; body?: unknown; maskStatus?: number } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url) === FAL_BIREFNET_URL) {
      return new Response(JSON.stringify(opts.body ?? { image: { url: "https://cdn.example/mask.png" } }), {
        status: opts.status ?? 200,
      });
    }
    return new Response(MASK, { status: opts.maskStatus ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("falCutout", () => {
  it("asks BiRefNet for the mask only, with the photo inline and the key server-side", async () => {
    const { fetchImpl, calls } = fakeFal();
    const r = await falCutout(photo, "image/jpeg", "k-123", fetchImpl);
    expect(r).toEqual({ ok: true, mask: MASK });
    expect(calls[0].url).toBe(FAL_BIREFNET_URL);
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe("Key k-123");
    const body = JSON.parse(String(calls[0].init!.body));
    expect(body.image_url).toBe(`data:image/jpeg;base64,${Buffer.from(photo).toString("base64")}`);
    expect(body.mask_only).toBe(true);
    expect(body.model).toBe("General Use (Light)");
    expect(calls[1].url).toBe("https://cdn.example/mask.png");
  });

  it("refuses what is not a photo, or too big, without spending a call", async () => {
    const { fetchImpl } = fakeFal();
    expect(await falCutout(photo, "text/html", "k", fetchImpl)).toEqual({ ok: false, reason: "bad_input" });
    expect(await falCutout(new ArrayBuffer(0), "image/png", "k", fetchImpl)).toEqual({ ok: false, reason: "bad_input" });
    expect(await falCutout(new ArrayBuffer(CUTOUT_MAX_BYTES + 1), "image/png", "k", fetchImpl)).toEqual({ ok: false, reason: "too_big" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("says upstream when fal refuses, and no_mask when it answers without one", async () => {
    expect(await falCutout(photo, "image/png", "k", fakeFal({ status: 401 }).fetchImpl)).toEqual({ ok: false, reason: "upstream", status: 401 });
    expect(await falCutout(photo, "image/png", "k", fakeFal({ body: {} }).fetchImpl)).toEqual({ ok: false, reason: "no_mask" });
    expect(await falCutout(photo, "image/png", "k", fakeFal({ maskStatus: 404 }).fetchImpl)).toEqual({ ok: false, reason: "upstream", status: 404 });
  });
});

describe("cutWithFallback", () => {
  const p = { rgba: new Uint8ClampedArray(16), w: 2, h: 2 };
  function device() {
    const d: DeviceCutter & { made: number } = {
      made: 0,
      prepare: vi.fn(async () => 4),
      cut: vi.fn(async () => new Uint8ClampedArray([9, 9, 9, 9])),
    };
    return d;
  }

  it("uses the server's mask and never wakes the device model", async () => {
    const d = device();
    const make = vi.fn(() => d);
    const r = await cutWithFallback(p, { server: async () => new Uint8ClampedArray([1, 2, 3, 4]), device: make });
    expect(r).toEqual({ mask: new Uint8ClampedArray([1, 2, 3, 4]), via: "server" });
    expect(make).not.toHaveBeenCalled();
  });

  it("falls back to the device when the server fails", async () => {
    const d = device();
    const r = await cutWithFallback(p, { server: async () => { throw new Error("503"); }, device: () => d });
    expect(r.via).toBe("device");
    expect(d.prepare).toHaveBeenCalledOnce();
    expect([...r.mask]).toEqual([9, 9, 9, 9]);
  });

  it("does not trust a server mask of the wrong size", async () => {
    const d = device();
    const r = await cutWithFallback(p, { server: async () => new Uint8ClampedArray(3), device: () => d });
    expect(r.via).toBe("device");
  });
});

describe("maskFromImage", () => {
  it("white is kept, black is gone, and transparency counts as gone", () => {
    const m = maskFromImage(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 0, 128, 128, 128, 255]));
    expect([...m]).toEqual([255, 0, 0, 128]);
  });
});

describe("POST /api/stickers/cutout", () => {
  const ENV = { ...process.env };
  const guard = vi.hoisted(() => ({ answer: null as Response | null }));
  vi.mock("@/lib/api-guard", () => ({ guardApi: async () => guard.answer }));
  vi.mock("@sentry/nextjs", () => ({ captureMessage: () => {}, captureException: () => {} }));

  beforeEach(() => {
    guard.answer = null;
  });
  afterEach(() => {
    process.env = { ...ENV };
    vi.unstubAllGlobals();
  });

  async function post(body: BodyInit, type = "image/jpeg") {
    const { POST } = await import("@/app/api/stickers/cutout/route");
    const { NextRequest } = await import("next/server");
    return POST(new NextRequest("https://app.hypefy.chat/api/stickers/cutout", { method: "POST", body, headers: { "content-type": type } }));
  }

  it("a caller the guard turns away never reaches fal", async () => {
    guard.answer = new Response("no", { status: 401 });
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    process.env.FAL_KEY = "k";
    expect((await post(new Uint8Array([1]))).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
  });

  it("without FAL_KEY it says not configured, so the studio cuts on the device", async () => {
    delete process.env.FAL_KEY;
    const res = await post(new Uint8Array([1]));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "not_configured" });
  });

  it("with a key it answers with the mask as a PNG", async () => {
    process.env.FAL_KEY = "k";
    vi.stubGlobal("fetch", fakeFal().fetchImpl);
    const res = await post(new Uint8Array([1, 2]));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(MASK));
  });

  it("a non-image body is a 400, and fal failing is a 502", async () => {
    process.env.FAL_KEY = "k";
    vi.stubGlobal("fetch", fakeFal({ status: 500 }).fetchImpl);
    expect((await post(new Uint8Array([1]), "text/plain")).status).toBe(400);
    expect((await post(new Uint8Array([1]))).status).toBe(502);
  });
});
