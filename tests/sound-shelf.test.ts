// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { findSound } from "@/lib/sound-lookup";
import { loadSoundShelf, saveSound, unsaveSound } from "@/lib/sound-shelf";
import { originalShotId, originalSoundId, originalTrackFor, parseTrack } from "@/lib/track";

/**
 * Original audio, saved sounds, trending sounds, and the sound's box on
 * the reel.
 */

const SHOT = "5b1f0c1e-7d0a-4a51-9b7e-0d5a2f6c1a11";

/** A stand-in database: answers per table (in order asked), records calls. */
function fakeDb(rows: Record<string, { data: unknown; count?: number }[]>, rpc: Record<string, unknown> = {}) {
  const asked: { table: string; calls: [string, ...unknown[]][] }[] = [];
  const seen: Record<string, number> = {};
  return {
    asked,
    rpc: async (fn: string, args: unknown) => {
      asked.push({ table: `rpc:${fn}`, calls: [["args", args]] });
      return { data: rpc[fn] ?? null, error: null };
    },
    from(table: string) {
      const i = seen[table] ?? 0;
      seen[table] = i + 1;
      const entry = { table, calls: [] as [string, ...unknown[]][] };
      asked.push(entry);
      const a = rows[table]?.[i] ?? { data: [] };
      const answer = Promise.resolve({ data: a.data, count: a.count ?? null, error: null });
      const q: unknown = new Proxy(
        {},
        {
          get(_t, key: string) {
            if (key === "then") return answer.then.bind(answer);
            return (...args: unknown[]) => {
              entry.calls.push([key, ...args]);
              return q;
            };
          },
        },
      );
      return q;
    },
  };
}

describe("original audio", () => {
  it("has an id that says which Shot it came from, and only that kind of id does", () => {
    const id = originalSoundId(SHOT);
    expect(id).toBe(`original-${SHOT}`);
    expect(originalShotId(id)).toBe(SHOT);
    expect(originalShotId("1442846473")).toBeNull();
    expect(originalShotId("original-not-a-uuid")).toBeNull();
    expect(originalShotId("original-")).toBeNull();
  });

  it("is a song whose audio is the Shot's own file, credited to whoever made it", () => {
    const t = originalTrackFor({
      id: SHOT,
      media_url: "https://cdn.test/v.mp4",
      poster_url: "https://cdn.test/p.jpg",
      trim_start: 4,
      profiles: { username: "maya", display_name: "Maya", avatar_url: "https://cdn.test/a.jpg" },
    });
    expect(t).toEqual({
      id: `original-${SHOT}`,
      title: "Original audio",
      artist: "@maya",
      artwork: "https://cdn.test/a.jpg",
      preview: "https://cdn.test/v.mp4",
      start: 4,
    });
    // It is a real, playable song as far as everything else is concerned.
    expect(parseTrack(t)).toEqual(t);
  });

  it("falls back to the frame, then nothing, for its cover", () => {
    const base = { id: SHOT, media_url: "v.mp4" };
    expect(originalTrackFor({ ...base, poster_url: "p.jpg", profiles: { username: "a" } }).artwork).toBe("p.jpg");
    expect(originalTrackFor(base).artwork).toBe("");
    expect("start" in originalTrackFor(base)).toBe(false);
  });

  const source = (is_private: boolean) => ({
    id: SHOT,
    user_id: "u1",
    media_url: "v.mp4",
    poster_url: null,
    caption: "the first one",
    trim_start: null,
    profiles: { username: "maya", display_name: "Maya", avatar_url: null, is_private },
  });
  const use = { id: "s2", user_id: "u2", media_url: "w.mp4", poster_url: null, caption: "mine", track: {} };

  it("its page is headed by the Shot it came from, then everything made with it", async () => {
    const db = fakeDb({ shots: [{ data: [use], count: 1 }, { data: source(false) }], posts: [{ data: [], count: 0 }] });
    const sound = (await findSound(db as never, `original-${SHOT}`))!;
    expect(sound.track.title).toBe("Original audio");
    expect(sound.track.artist).toBe("@maya");
    expect(sound.shots.map((s) => s.id)).toEqual([SHOT, "s2"]);
    expect(sound.shotCount).toBe(2);
    expect(sound.original).toEqual({ shotId: SHOT, username: "maya" });
    expect(sound.canUse).toBe(true);
  });

  it("cannot be used for new Shots when it belongs to a private account", async () => {
    const db = fakeDb({ shots: [{ data: [] }, { data: source(true) }], posts: [{ data: [] }] });
    expect((await findSound(db as never, `original-${SHOT}`))!.canUse).toBe(false);
  });

  it("cannot be used once its own Shot is gone, though what was made with it still shows", async () => {
    const withTrack = { ...use, track: originalTrackFor({ id: SHOT, media_url: "v.mp4", profiles: { username: "maya" } }) };
    const db = fakeDb({ shots: [{ data: [withTrack], count: 1 }, { data: null }], posts: [{ data: [] }] });
    const sound = (await findSound(db as never, `original-${SHOT}`))!;
    expect(sound.shots.map((s) => s.id)).toEqual(["s2"]);
    expect(sound.canUse).toBe(false);
    expect(sound.original).toBeNull();
  });

  it("a song can always be used, and never asks for a source Shot", async () => {
    const song = { ...use, track: { id: "144", title: "x", preview: "p" } };
    const db = fakeDb({ shots: [{ data: [song], count: 1 }], posts: [{ data: [] }] });
    const sound = (await findSound(db as never, "144"))!;
    expect(sound.canUse).toBe(true);
    expect(db.asked.filter((a) => a.table === "shots")).toHaveLength(1);
  });

  it("the composer refuses a sound that may not be used, whatever the address says", () => {
    const page = readFileSync("src/app/(app)/create/page.tsx", "utf8");
    expect(page).toContain("const found = looked?.canUse ? looked : null;");
  });
});

describe("the sound shelf", () => {
  const T = (id: string) => ({ id, title: id, artist: "", artwork: "", preview: "p" });

  it("lists your saved sounds, then what is trending that you have not saved", async () => {
    const db = fakeDb(
      { saved_sounds: [{ data: [{ track: T("a") }, { track: T("b") }] }] },
      { trending_sounds: [{ track: T("b"), uses: 9 }, { track: T("c"), uses: 4 }, { track: { id: "bad" }, uses: 1 }] },
    );
    const shelf = await loadSoundShelf(db as never, "me");
    expect(shelf.saved.map((t) => t.id)).toEqual(["a", "b"]);
    expect(shelf.trending.map((t) => t.id)).toEqual(["c"]);
    const saved = db.asked.find((a) => a.table === "saved_sounds")!;
    expect(saved.calls).toContainEqual(["eq", "user_id", "me"]);
  });

  it("signed out, shows trending and asks for nobody's shelf", async () => {
    const db = fakeDb({}, { trending_sounds: [{ track: T("c"), uses: 4 }] });
    const shelf = await loadSoundShelf(db as never, null);
    expect(shelf).toEqual({ saved: [], trending: [T("c")] });
    expect(db.asked.some((a) => a.table === "saved_sounds")).toBe(false);
  });

  it("saves the sound whole, without one Shot's snippet start, and removes only your own", async () => {
    const db = fakeDb({ saved_sounds: [{ data: null }, { data: null }] });
    expect(await saveSound(db as never, "me", { ...T("a"), start: 12 })).toBe(true);
    expect(db.asked[0].calls[0]).toEqual([
      "upsert",
      { user_id: "me", track_id: "a", track: T("a") },
      { onConflict: "user_id,track_id" },
    ]);
    expect(await unsaveSound(db as never, "me", "a")).toBe(true);
    expect(db.asked[1].calls).toEqual([["delete"], ["eq", "user_id", "me"], ["eq", "track_id", "a"]]);
  });

  it("is what the song picker shows before anything is typed", () => {
    const src = readFileSync("src/components/music/TrackPicker.tsx", "utf8");
    expect(src).toContain('{ title: "Your sounds", items: shelf.saved }');
    expect(src).toContain('{ title: "Trending on Hypefy", items: shelf.trending }');
    expect(src).toContain(".filter((g) => g.items.length > 0)");
  });
});

describe("the top of a sound's page", () => {
  const toast = vi.fn();
  const calls: unknown[][] = [];
  let root: Root;
  let host: HTMLDivElement;
  const track = { id: "144", title: "Golden Hour", artist: "JVKE", artwork: "", preview: "p" };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    toast.mockReset();
    calls.length = 0;
    const chain: Record<string, unknown> = {};
    for (const k of ["upsert", "delete", "eq"]) {
      chain[k] = (...a: unknown[]) => {
        calls.push([k, ...a]);
        return chain;
      };
    }
    (chain as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: null, error: null });
    vi.doMock("@/lib/supabase/client", () => ({ createClient: () => ({ from: () => chain }) }));
    vi.doMock("@/components/ui/ToastProvider", () => ({ useToast: () => toast }));
    vi.doMock("@/lib/haptics", () => ({ haptics: { select: () => {} } }));
    vi.doMock("@/lib/spotify-player", () => ({ spotifyPlay: async () => true, spotifyPause: async () => {} }));
    vi.doMock("next/link", () => ({
      default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
        createElement("a", { href, ...rest }, children as never),
    }));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.resetModules();
  });

  async function mount(props: { userId: string | null; canUse: boolean; initialSaved: boolean }) {
    const { SoundHero } = await import("@/components/music/SoundHero");
    await act(async () => root.render(createElement(SoundHero, { track, countLine: "1 Shot", ...props })));
  }
  const q = (sel: string) => host.querySelector(sel) as HTMLElement | null;

  it("Use this sound opens the Shot camera with it chosen", async () => {
    await mount({ userId: "me", canUse: true, initialSaved: false });
    expect(q("[data-use-sound]")!.getAttribute("href")).toBe("/create?mode=shot&sound=144");
  });

  it("says so, instead of offering it, when the sound may not be used", async () => {
    await mount({ userId: "me", canUse: false, initialSaved: false });
    expect(q("[data-use-sound]")).toBeNull();
    expect(q("[data-use-sound-off]")!.textContent).toContain("can’t be used");
  });

  it("saves and unsaves, and says where a saved sound turns up", async () => {
    await mount({ userId: "me", canUse: true, initialSaved: false });
    const save = q("[data-save-sound]") as HTMLButtonElement;
    expect(save.getAttribute("aria-pressed")).toBe("false");
    await act(async () => {
      save.click();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(calls[0][0]).toBe("upsert");
    expect(save.getAttribute("aria-pressed")).toBe("true");
    expect(toast.mock.calls[0][0]).toContain("sound picker");
    await act(async () => {
      save.click();
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(calls.some((c) => c[0] === "delete")).toBe(true);
    expect(save.getAttribute("aria-pressed")).toBe("false");
  });

  it("offers no Save to someone signed out", async () => {
    await mount({ userId: null, canUse: true, initialSaved: false });
    expect(q("[data-save-sound]")).toBeNull();
    expect(q("[data-use-sound]")!.getAttribute("href")).toBe("/onboarding");
  });
});

describe("the sound's box on the reel", () => {
  it("sits under the three dots, and every Shot has one", () => {
    const src = readFileSync("src/components/shots/ReelsFeed.tsx", "utf8");
    const dots = src.indexOf('<MoreHorizontal size={30} className="text-white" />');
    const box = src.indexOf("<SoundBox track={sound} />");
    expect(dots).toBeGreaterThan(0);
    expect(box).toBeGreaterThan(dots);
    expect(src.slice(dots, box)).not.toContain("<RailButton");
    // A Shot without a song still has a sound: its own.
    expect(src).toContain("() => track ?? originalTrackFor(reel)");
    expect(src).toContain("<SoundPill track={sound} glass />");
  });

  it("only a song is played beside the video; original audio is the video's own sound", () => {
    const src = readFileSync("src/components/shots/ReelsFeed.tsx", "utf8");
    expect(src).toContain("if (!track || !isActive || !playing || muted) return;");
    expect(src).toContain("muted={muted || !!track}");
  });
});
