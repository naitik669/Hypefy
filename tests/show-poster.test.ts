import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { needsPlayer, showStill } from "@/lib/show-still";

/**
 * A video Show gets a still of its own.
 *
 * shows had one media column and nothing else: no poster, no duration, no
 * trim. So everywhere a Show was drawn small — a collab grid, the author's
 * own list, a reply card — a video one was a live <video> with
 * BLANK_POSTER on it, decoding in the background to show one frame.
 *
 * Two costs, and the second is the one that matters. It looks blank until
 * the decoder catches up. And a grid of eight video Shows is eight
 * decoders running to display eight still pictures, on a phone, in a list
 * somebody is scrolling.
 *
 * A Shot has had poster_url since it existed; publishShow simply never
 * captured one, with capturePoster four lines out of reach.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const publish = read("src/lib/show-publish.ts");
const m = read("supabase/migrations/0213_shows_keep_a_poster.sql");

const PHOTO = "https://x.supabase.co/storage/v1/object/public/show-media/u/a.jpg";
const CLIP = "https://x.supabase.co/storage/v1/object/public/show-media/u/a.mp4";
const POSTER = "https://x.supabase.co/storage/v1/object/public/show-media/u/a-poster.jpg";

describe("which picture stands for a Show", () => {
  it("a photo Show is its own still", () => {
    expect(showStill({ media_url: PHOTO })).toBe(PHOTO);
    expect(needsPlayer({ media_url: PHOTO })).toBe(false);
  });

  it("a video Show is its poster", () => {
    expect(showStill({ media_url: CLIP, poster_url: POSTER })).toBe(POSTER);
    expect(needsPlayer({ media_url: CLIP, poster_url: POSTER })).toBe(false);
  });

  it("and one posted before this has none, which is said rather than faked", () => {
    // No frame was stored at the time and none can be made now without
    // downloading and decoding the clip. Those fall back to a player,
    // which is exactly what every Show did before.
    expect(showStill({ media_url: CLIP })).toBe(null);
    expect(needsPlayer({ media_url: CLIP })).toBe(true);
  });

  it("the poster wins even when the media is a photo", () => {
    // Should not happen, but preferring the stored still over guessing
    // from a file extension is the right order either way.
    expect(showStill({ media_url: PHOTO, poster_url: POSTER })).toBe(POSTER);
  });

  it("and nothing at all is null, not a crash", () => {
    expect(showStill({})).toBe(null);
    expect(showStill({ media_url: null, poster_url: null })).toBe(null);
    expect(needsPlayer({})).toBe(false);
  });
});

describe("capturing it", () => {
  it("only for a video", () => {
    expect(publish).toContain("if (isVideoFile(d.file)) {");
  });

  it("before the clip is uploaded, so the blocklist can refuse it early", () => {
    // This was the other way round when 0213 landed, so that a poster
    // failure cost nothing — which the catch below guarantees on its own,
    // wherever the capture sits. Going first buys two things: a
    // backgrounded WebView does not decode, and putting the phone down
    // during the upload is exactly what people do; and the 0214 blocklist
    // check needs the poster to refuse a clip in a second rather than
    // after a minute on a phone uplink.
    // The second argument stopped being null in 0216: the still is taken
    // at the frame the Show actually starts on, because a picture of
    // second 0 on a Show that begins at 0:40 is a picture of something
    // else. Anchored on the call, not on its arguments.
    const captureAt = publish.indexOf("capturePoster(localUrl,");
    const checkAt = publish.indexOf('rpc("check_media"');
    const uploadAt = publish.indexOf(".upload(path, d.file");
    expect(captureAt).toBeGreaterThan(-1);
    expect(captureAt).toBeLessThan(checkAt);
    expect(checkAt).toBeLessThan(uploadAt);
  });

  it("and a failure leaves the Show, not an error", () => {
    // Scoped to the capture block alone. It used to run to `const text =`,
    // which now also swallows the blocklist check — and THAT one does
    // return { ok: false }, on purpose, so the wider slice would assert
    // the opposite of what it means.
    const block = publish.slice(publish.indexOf("if (isVideoFile(d.file)) {"));
    const body = block.slice(0, block.indexOf("const fingerprintOf"));
    expect(body.length).toBeGreaterThan(50);
    expect(body).toContain("catch {");
    expect(body).not.toContain("return { ok: false");
  });

  it("the object url is released either way", () => {
    const block = publish.slice(publish.indexOf("if (isVideoFile(d.file)) {"));
    expect(block.slice(0, 1400)).toContain("URL.revokeObjectURL(localUrl)");
  });

  it("and it reaches the row", () => {
    expect(publish).toContain("poster_url: posterUrl,");
  });
});

describe("the column", () => {
  it("is nullable, because there is no honest backfill", () => {
    // Every Show posted before this has no poster and no way to make one
    // without downloading and decoding each clip server-side.
    expect(m).toContain("add column if not exists poster_url text");
    expect(m).not.toContain("not null");
    expect(m).not.toContain("update public.shows set poster_url");
  });

  it("and is granted, which a new column on shows is not by default", () => {
    // shows grants per column: a new one is invisible and unwritable
    // until it is named. Same trap posts.media hit in 0195.
    expect(m).toContain("grant select (poster_url) on public.shows to anon, authenticated");
    expect(m).toContain("grant insert (poster_url) on public.shows to authenticated");
  });
});

describe("the readers ask for it", () => {
  // The quiet way this breaks: showStill is correct, the column is
  // written, and the query never selects it — so every video Show falls
  // back to a player for ever and nothing looks wrong in the code.
  it("every page that draws a still selects the poster", () => {
    for (const f of [
      "src/app/(app)/shows/page.tsx",
      "src/app/(app)/shows/collab/[collabId]/page.tsx",
    ]) {
      const src = read(f);
      expect(src, f).toMatch(/\.select\("[^"]*poster_url/);
    }
  });

  it("and they decide with the helper rather than the file extension", () => {
    for (const f of ["src/app/(app)/shows/page.tsx", "src/components/shows/CollabView.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("showStill(s)");
      expect(src, f).not.toContain("isVideoUrl(s.media_url)");
    }
  });
});
