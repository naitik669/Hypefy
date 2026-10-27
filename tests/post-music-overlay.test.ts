import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The song wears the picture it belongs to.
 *
 * It used to sit in a row under the card, which is not where the post is.
 * Now the disc rides in the corner of the photo in its case, rolling while
 * the song plays, and the speaker opposite is the only thing that stops it.
 *
 * The behaviour of the case itself — that a tap shows the title instead of
 * silencing the post — is covered by track-chip.test.ts, which mounts it.
 * What is checked here is that the pieces ended up in the right corners and
 * that the one post shape without a corner still gets its song.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const card = read("src/components/feed/FeedCard.tsx");
const box = read("src/components/music/SoundBox.tsx");

describe("on a post", () => {
  it("the case sits inside the picture, top left", () => {
    expect(card).toContain('<div className="absolute left-3 top-3 z-20">');
    const overlay = card.slice(card.indexOf('<div className="absolute left-3 top-3 z-20">'));
    expect(overlay.slice(0, 220)).toContain("overlay");
  });

  it("and the speaker opposite it, bottom right", () => {
    expect(card).toContain('<div className="absolute bottom-3 right-3 z-20">');
    const mute = card.slice(card.indexOf('<div className="absolute bottom-3 right-3 z-20">'));
    expect(mute.slice(0, 180)).toContain("<MusicMuteButton onMedia />");
  });

  it("both are inside the frame the photo is clipped to", () => {
    // Outside it they would float over the card's padding, and on a 1.91:1
    // post there is no card left to float over.
    const gallery = card.indexOf('className="group relative mx-4 overflow-hidden rounded-2xl"');
    expect(gallery).toBeGreaterThan(-1);
    expect(card.indexOf('<div className="absolute left-3 top-3 z-20">')).toBeGreaterThan(gallery);
    expect(card.indexOf('<div className="absolute bottom-3 right-3 z-20">')).toBeGreaterThan(gallery);
  });

  it("a song on a post with no picture keeps the row it always had", () => {
    // There is no corner to sit in, and dropping the song entirely would be
    // a worse answer than the row.
    expect(card).toContain("{postTrack && images.length === 0 && (");
  });
});

describe("the speaker says what it really does", () => {
  const mute = read("src/components/music/MusicMuteButton.tsx");

  it("it is named as the global control it is, not as this post's", () => {
    // Sitting in the corner of one post, it looks local. It is not: it
    // silences every music surface in the app and persists.
    expect(mute).toContain('aria-label={muted ? "Unmute music everywhere" : "Mute music everywhere"}');
  });

  it("and says so once, the first time it is used", () => {
    expect(mute).toContain("Music off everywhere, not just this post");
    const fn = mute.slice(mute.indexOf("function explainOnce"), mute.indexOf("const look"));
    // Once ever, and never at the cost of the mute itself working: the
    // read has to be inside the try, not merely somewhere near a catch.
    // Private mode throws on the very first getItem.
    expect(fn).toMatch(/try\s*\{[^}]*localStorage\.getItem\(TOLD_KEY\)/);
    expect(fn).toMatch(/\}\s*catch\s*\{/);
  });
});

describe("on a Shot", () => {
  it("the record is round inside its square case", () => {
    // Filling the case with the cover made it read as a thumbnail, which is
    // the one thing it is not.
    expect(box).toContain("rounded-full");
    expect(box).toContain("data-sound-disc");
    expect(box).toContain("Math.round(size * 0.3)");
  });

  it("it turns only while the song is playing", () => {
    expect(box).toContain("const playing = useIsPlaying(track.id);");
    expect(box).toContain('playing ? "animate-[spin_4s_linear_infinite]" : ""');
  });

  it("and holds still for anyone who asked for less motion", () => {
    // A disc rotating for ever in the corner of every Shot is exactly the
    // kind of persistent motion that reduced-motion exists for.
    expect(box).toContain("motion-reduce:animate-none");
  });

  it("tapping it opens the sound's page, and nothing else", () => {
    // No reveal on a Shot: the name is already beside the caption, and
    // there is no room to slide a title across the video.
    expect(box).toContain("href={soundHref(track.id)}");
    expect(box).not.toContain("onClick={() => set");
  });
});
