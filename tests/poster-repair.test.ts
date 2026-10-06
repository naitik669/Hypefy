import { describe, it, expect, vi, beforeEach } from "vitest";
import { forgetRepairs, repairPoster } from "@/lib/poster-repair";

/**
 * A Shot with no cover gets one, on its owner's device. Only the owner may
 * change a Shot, so this is the one place the gap can be closed.
 */

const SHOT = { id: "s1", user_id: "owner", media_url: "https://x.test/s1.mp4", poster_url: null };

function db(opts: { uploadFails?: boolean; updateFails?: boolean } = {}) {
  const uploads: string[] = [];
  const updates: { url: string; id: string; onlyIfNull: boolean }[] = [];
  return {
    uploads,
    updates,
    client: {
      storage: {
        from: () => ({
          upload: async (path: string) => {
            uploads.push(path);
            return { error: opts.uploadFails ? new Error("no") : null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
        }),
      },
      from: () => ({
        update: (row: { poster_url: string }) => ({
          eq: (_c: string, id: string) => ({
            is: async (col: string, v: null) => {
              updates.push({ url: row.poster_url, id, onlyIfNull: col === "poster_url" && v === null });
              return { error: opts.updateFails ? new Error("no") : null };
            },
          }),
        }),
      }),
    },
  };
}

const frame = async () => new Blob(["jpg"], { type: "image/jpeg" });

beforeEach(() => forgetRepairs());

describe("repairing a missing cover", () => {
  it("takes a frame, stores it in the owner's folder, and sets it as the cover", async () => {
    const d = db();
    const url = await repairPoster(d.client, SHOT, "owner", frame);
    expect(d.uploads).toHaveLength(1);
    expect(d.uploads[0]).toMatch(/^owner\/s1-poster-\d+\.jpg$/);
    expect(url).toBe(`https://cdn.test/${d.uploads[0]}`);
    expect(d.updates).toEqual([{ url, id: "s1", onlyIfNull: true }]);
  });

  it("does nothing on anyone else's device", async () => {
    const d = db();
    expect(await repairPoster(d.client, SHOT, "someone-else", frame)).toBeNull();
    expect(await repairPoster(d.client, SHOT, null, frame)).toBeNull();
    expect(d.uploads).toHaveLength(0);
  });

  it("leaves a Shot that already has a cover alone", async () => {
    const d = db();
    const capture = vi.fn(frame);
    expect(await repairPoster(d.client, { ...SHOT, poster_url: "https://x.test/chosen.jpg" }, "owner", capture)).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it("tries each Shot once, so a video that will not decode is not fetched again and again", async () => {
    const d = db();
    const capture = vi.fn(async () => null);
    expect(await repairPoster(d.client, SHOT, "owner", capture)).toBeNull();
    expect(await repairPoster(d.client, SHOT, "owner", capture)).toBeNull();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(d.uploads).toHaveLength(0);
  });

  it("does not set a cover it failed to store, and never throws", async () => {
    const failedUpload = db({ uploadFails: true });
    expect(await repairPoster(failedUpload.client, SHOT, "owner", frame)).toBeNull();
    expect(failedUpload.updates).toHaveLength(0);

    forgetRepairs();
    const failedUpdate = db({ updateFails: true });
    expect(await repairPoster(failedUpdate.client, SHOT, "owner", frame)).toBeNull();

    forgetRepairs();
    const boom = async () => { throw new Error("decoder exploded"); };
    await expect(repairPoster(db().client, SHOT, "owner", boom)).resolves.toBeNull();
  });
});
