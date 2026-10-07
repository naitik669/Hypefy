// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { cleanSoundId, findSound, soundCountLine } from "@/lib/sound-lookup";
import { parseTrack } from "@/lib/track";

/**
 * A Shot's sound: heard on the Shot, named on it, with a page of its own
 * and a way to use it for a new Shot.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}));

const TRACK = {
  id: "1442846473",
  title: "Golden Hour",
  artist: "JVKE",
  artwork: "https://example.test/a.jpg",
  preview: "https://example.test/a.m4a",
  appleUrl: "https://music.apple.com/x",
  start: 12,
};

/** A stand-in database that records what it was asked and answers per table. */
function fakeDb(rows: Record<string, { data: unknown[]; count?: number }>) {
  const asked: { table: string; calls: [string, ...unknown[]][] }[] = [];
  return {
    asked,
    from(table: string) {
      const entry = { table, calls: [] as [string, ...unknown[]][] };
      asked.push(entry);
      const answer = Promise.resolve({ data: rows[table]?.data ?? [], count: rows[table]?.count ?? null, error: null });
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
  } as unknown as Parameters<typeof findSound>[0] & { asked: typeof asked };
}

describe("a sound's id", () => {
  it("is taken as it comes when it is plain", () => {
    expect(cleanSoundId("1442846473")).toBe("1442846473");
    expect(cleanSoundId(encodeURIComponent("spotify:track:abc"))).toBe("spotify:track:abc");
  });
  it("is refused when it is empty, huge, or not text", () => {
    expect(cleanSoundId("")).toBeNull();
    expect(cleanSoundId("   ")).toBeNull();
    expect(cleanSoundId("x".repeat(200))).toBeNull();
    expect(cleanSoundId("%E0%A4%A")).toBeNull();
    expect(cleanSoundId("a%00b")).toBeNull();
  });
});

describe("finding everything made with a sound", () => {
  const shot = { id: "s1", user_id: "u1", media_url: "v.mp4", poster_url: null, caption: "roof", track: TRACK };
  const post = { id: "p1", user_id: "u2", image_url: "i.jpg", image_urls: null, caption: null, body: "hi", track: TRACK };

  it("asks both tables for that song's id, live rows only, newest first", async () => {
    const db = fakeDb({ shots: { data: [shot], count: 1 }, posts: { data: [post], count: 1 } });
    await findSound(db, "1442846473");
    expect(db.asked.map((a) => a.table).sort()).toEqual(["posts", "shots"]);
    for (const a of db.asked) {
      expect(a.calls).toContainEqual(["eq", "track->>id", "1442846473"]);
      expect(a.calls).toContainEqual(["is", "removed_at", null]);
      expect(a.calls).toContainEqual(["order", "created_at", { ascending: false }]);
    }
  });

  it("returns the song, what uses it, and how many", async () => {
    const db = fakeDb({ shots: { data: [shot], count: 7 }, posts: { data: [post], count: 1 } });
    const sound = (await findSound(db, "1442846473"))!;
    expect(sound.track.title).toBe("Golden Hour");
    expect(sound.shots).toEqual([{ id: "s1", user_id: "u1", media_url: "v.mp4", poster_url: null, caption: "roof" }]);
    expect(sound.posts[0].id).toBe("p1");
    expect(sound.shotCount).toBe(7);
    expect(sound.postCount).toBe(1);
  });

  it("leaves one person's snippet start out of the song itself", async () => {
    const db = fakeDb({ shots: { data: [shot] }, posts: { data: [] } });
    const sound = (await findSound(db, "1442846473"))!;
    expect("start" in sound.track).toBe(false);
  });

  it("is nothing when nothing the person can see uses it, or the id is bad", async () => {
    expect(await findSound(fakeDb({}), "1442846473")).toBeNull();
    const db = fakeDb({ shots: { data: [shot] } });
    expect(await findSound(db, "%E0%A4%A")).toBeNull();
    expect(db.asked).toHaveLength(0);
  });

  it("is nothing when the rows that match carry no playable song", async () => {
    const broken = { ...shot, track: { id: "1442846473", title: "x" } };
    expect(await findSound(fakeDb({ shots: { data: [broken] } }), "1442846473")).toBeNull();
  });
});

describe("the count line", () => {
  it("names what there is and leaves out what there is not", () => {
    expect(soundCountLine(3, 1)).toBe("3 Shots · 1 post");
    expect(soundCountLine(1, 0)).toBe("1 Shot");
    expect(soundCountLine(0, 2)).toBe("2 posts");
    expect(soundCountLine(0, 0)).toBe("");
  });
});

describe("the sound named on a Shot", () => {
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
    host.remove();
  });

  it("shows the song and opens its page", async () => {
    const { SoundPill } = await import("@/components/music/SoundPill");
    await act(async () => root.render(createElement(SoundPill, { track: parseTrack(TRACK)!, glass: true })));
    const pill = host.querySelector("[data-sound-pill]") as HTMLAnchorElement;
    expect(pill.getAttribute("href")).toBe("/sound/1442846473");
    expect(pill.textContent).toContain("Golden Hour");
    expect(pill.textContent).toContain("JVKE");
    expect(pill.getAttribute("aria-label")).toBe("Sound: Golden Hour by JVKE");
  });

  it("escapes an id that is not URL-safe", async () => {
    const { soundHref } = await import("@/components/music/SoundPill");
    expect(soundHref("spotify:track:a/b")).toBe("/sound/spotify%3Atrack%3Aa%2Fb");
  });
});

describe("where a Shot's sound is wired", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it.each([
    "src/app/(app)/shots/page.tsx",
    "src/app/(app)/shots/[shotId]/page.tsx",
    "src/app/(app)/home/page.tsx",
    "src/components/shots/ReelsFeed.tsx",
  ])("%s fetches the song with the Shot", (file) => {
    expect(read(file)).toMatch(/trim_end, track, profiles\(|repost_count, track, profiles\(/);
  });

  it("the reel plays the song while its Shot is on screen, playing and not muted", () => {
    const src = read("src/components/shots/ReelsFeed.tsx");
    expect(src).toContain("if (!track || !isActive || !playing || muted) return;");
    expect(src).toContain("return claimPreview(track, { loop: true, audible: true });");
    // With a song, the clip's own sound stays off.
    expect(src).toContain("muted={muted || !!track}");
    expect(src).toContain("{track && <SoundPill track={track} glass />}");
  });

  it("a Shot card in the feed does the same, and never asks the video for sound", () => {
    const src = read("src/components/feed/ShotFeedCard.tsx");
    expect(src).toContain("if (!track || !playing || muted || peekOpen) return;");
    expect(src).toContain("const wantSound = !hasTrack && !isMuted() && ownsAudio(shot.id);");
    expect(src).toContain("const wantSound = !muted && !hasTrack;");
    expect(src).toContain("<SoundPill track={track}");
  });

  it("a post's song name opens the song's page, except while composing", () => {
    const src = read("src/components/music/TrackChip.tsx");
    expect(src).toContain("href={soundHref(track.id)}");
    expect(src).toMatch(/\{onRemove \? \(\s*<p /);
  });

  it("Use this sound opens the Shot composer with the song chosen", async () => {
    const { composerHrefFor } = await import("@/components/music/SoundHero");
    expect(composerHrefFor("1442846473")).toBe("/create?mode=shot&sound=1442846473");
    const page = read("src/app/(app)/create/page.tsx");
    expect(page).toContain("findSound(supabase, soundId)");
    expect(page).toContain("initialTrack={found?.track ?? null}");
    expect(read("src/components/create/CreateScreen.tsx")).toContain("useState<Track | null>(initialTrack)");
  });

  it("the song parser can be used on the server", () => {
    expect(read("src/lib/track.ts")).not.toContain('"use client"');
    expect(read("src/lib/sound-lookup.ts")).toContain('from "@/lib/track"');
  });
});
