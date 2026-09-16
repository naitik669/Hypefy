import { describe, it, expect, vi } from "vitest";
import { uploadAlbumFiles, uploadTimeout, type AlbumFile } from "@/lib/chat-album-upload";

/**
 * A folder always ends: every file up and the folder sent, or failed with a
 * Retry that sends only what didn't make it.
 */

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

const file = (name: string): AlbumFile => ({ file: new File(["x"], name, { type: "image/jpeg" }), type: "image" });
const bucket = (upload: (path: string) => Promise<{ error: unknown }>) => ({
  upload: vi.fn(upload),
  getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
});

describe("uploadAlbumFiles", () => {
  it("returns every item once all are up, two at a time", async () => {
    let running = 0;
    let most = 0;
    const b = bucket(async () => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return { error: null };
    });
    const items = await uploadAlbumFiles([file("a.jpg"), file("b.jpg"), file("c.jpg"), file("d.jpg")], b, "me");
    expect(items).toHaveLength(4);
    expect(items![0].url).toMatch(/^https:\/\/cdn\/me\//);
    expect(most).toBe(2);
  });

  it("gives up on an upload that never answers, instead of hanging", async () => {
    const b = bucket((p) => (p.endsWith("-1.jpg") ? new Promise(() => {}) : Promise.resolve({ error: null })));
    const items = await uploadAlbumFiles([file("a.jpg"), file("b.jpg")], b, "me", { baseTimeoutMs: 20 });
    expect(items).toBeNull();
  });

  it("on retry, only uploads what failed", async () => {
    const files = [file("a.jpg"), file("b.jpg"), file("c.jpg")];
    let fail = true;
    const b = bucket(async (p) => ({ error: fail && p.endsWith("-2.jpg") ? new Error("no") : null }));
    expect(await uploadAlbumFiles(files, b, "me")).toBeNull();
    expect(b.upload).toHaveBeenCalledTimes(3);
    fail = false;
    expect(await uploadAlbumFiles(files, b, "me")).toHaveLength(3);
    expect(b.upload).toHaveBeenCalledTimes(4);
  });

  it("gives a bigger file longer, so a slow uplink can still finish it", () => {
    expect(uploadTimeout(250_000)).toBeGreaterThan(uploadTimeout(20_000));
    // A 2MB original on a ~50KB/s uplink needs about 40s on top of the floor.
    expect(uploadTimeout(2_000_000)).toBeGreaterThan(45_000 + 40_000);
  });
});
