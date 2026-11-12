import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The song sits under the poster's name, not on their photograph.
 *
 * It used to be a 36px glass disc in the top-left of the picture with the
 * mute button in the opposite corner: two buttons, two corners, one feature,
 * both of them on somebody's face. In the byline the photo is left alone, the
 * song sits with the rest of the post's metadata, and the mute sits beside
 * the thing it mutes.
 *
 * That move also removed a second code path. A song on a text-only post had
 * "no corner to sit in", so it kept a row of its own under the card — one
 * feature drawn two ways depending on whether the post had a picture. The
 * byline is above every post, so there is one way now.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const card = read("src/components/feed/FeedCard.tsx");
const chip = read("src/components/music/TrackChip.tsx");

/**
 * Just the disc and the byline chip.
 *
 * The plain row variant further down the same file still spins its artwork
 * on a ternary and is right to — it is a different chip, used by the
 * composer, the anthem and a shared song in a chat. Scanning the whole file
 * would have these assertions policing it too.
 */
const byline = chip.slice(chip.indexOf("function Disc"), chip.indexOf("export function TrackChip"));

describe("where the song sits", () => {
  it("in the byline, watching the card rather than itself", () => {
    // The song belongs to the post, so it starts when the post is what you
    // are looking at — not once you have scrolled past the picture.
    expect(card).toContain("<TrackChip track={postTrack} autoPlayInView watch={cardRef} byline />");
  });

  it("and nothing is left on the picture", () => {
    expect(card).not.toContain("overlay />");
    expect(card).not.toContain("<MusicMuteButton onMedia />");
    expect(card).not.toContain('className="absolute left-3 top-3 z-20"');
  });

  it("the mute is beside it, not in the far corner", () => {
    expect(card).toContain("{postTrack && <MusicMuteButton />}");
    // Exactly one of each: the text-only fallback is gone, so a song is
    // drawn one way whether or not the post has a picture.
    expect(card.match(/<TrackChip /g) ?? []).toHaveLength(1);
    expect(card.match(/<MusicMuteButton/g) ?? []).toHaveLength(1);
  });

  it("and the name keeps its own line above it", () => {
    // The byline is a column now; the name row must still be a row, or the
    // handle, the badges and the timestamp stack on top of each other.
    expect(card).toContain('<div className="flex min-w-0 flex-1 flex-col gap-0.5">');
    expect(card).toContain('<div className="flex min-w-0 items-center gap-1">');
  });
});

describe("the disc", () => {
  it("is drawn, not illustrated: sheen, label and spindle hole", () => {
    expect(chip).toContain("conic-gradient(from 210deg");
    // The artwork is the label printed on the disc, not something the disc
    // replaced.
    expect(chip).toContain("{artwork ? (");
    expect(chip).toContain("bg-background");
  });

  it("rolls while the song plays and holds still when it does not", () => {
    expect(chip).toContain('animationPlayState: playing ? "running" : "paused",');
  });

  it("keeps turning by paused state rather than by dropping the animation", () => {
    // Removing the class restarted the animation on every play and pause, so
    // the disc jumped back to the top of its turn each time.
    expect(byline).toContain("animate-[spin_3.4s_linear_infinite]");
    expect(byline).not.toContain('playing ? "animate-[spin');
  });

  it("and stands still for anyone who asked for less motion", () => {
    expect(byline).toContain("motion-reduce:animate-none");
  });

  it("drops the backdrop blur it needed over a photo", () => {
    // It is on the card's own near-black now. Glass over near-black reads as
    // a smudge, and the blur was being composited on every post in the feed.
    // The class, not the word: the comment explaining the change says it too.
    expect(byline).not.toContain("backdrop-blur-md");
    expect(byline).not.toContain("bg-black/[0.46]");
    expect(chip).toContain('const sleeve = "bg-white/[0.07]";');
  });
});
