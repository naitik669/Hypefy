import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The song sits under the post, and the speaker sits on it.
 *
 * The disc keeps the case it wore in the corner of the photo — the roll, and
 * the title unrolling out from behind it — but it no longer stands on the
 * picture. It is a row under it, so a song is credited where the rest of the
 * post's words are and nothing covers somebody's face.
 *
 * The speaker is the exception and stays in the picture's bottom-right
 * corner, which is where the sound is coming from.
 *
 * The behaviour of the case itself — that a tap shows the title rather than
 * silencing the post — is covered by track-chip.test.ts, which mounts it.
 * What is checked here is where the pieces ended up.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const card = read("src/components/feed/FeedCard.tsx");

const GALLERY = 'className="group relative mx-4 overflow-hidden rounded-2xl"';
const CHIP = "<TrackChip track={postTrack} autoPlayInView watch={cardRef} overlay />";
const MUTE = '<div className="absolute bottom-3 right-3 z-20">';

describe("where the song sits", () => {
  it("in a row of its own, in its case", () => {
    expect(card).toContain(CHIP);
    expect(card).toContain('<div className="flex items-center px-4 pt-2.5">');
  });

  it("under the picture, not on it and not above it", () => {
    // Between the gallery and the action row: after the photo it belongs to,
    // before the buttons, so it reads as this post's sound.
    const gallery = card.indexOf(GALLERY);
    const chip = card.indexOf(CHIP);
    const actions = card.indexOf("{/* Actions */}");
    expect(gallery).toBeGreaterThan(-1);
    expect(chip).toBeGreaterThan(gallery);
    expect(chip).toBeLessThan(actions);
  });

  it("watching the card rather than itself", () => {
    // The song belongs to the post, so it starts when the post is what you
    // are looking at — not once you have scrolled past the picture.
    expect(card).toContain("watch={cardRef}");
  });

  it("and the byline is one row again", () => {
    // No song and no mute above the picture: the name, its badges and the
    // timestamp, as before.
    expect(card).toContain('<div className="flex min-w-0 flex-1 items-center gap-1">');
    expect(card).not.toContain("flex-col gap-0.5");
    expect(card).not.toContain("byline />");
  });
});

describe("where the speaker sits", () => {
  it("in the picture's bottom-right corner, in its glass", () => {
    expect(card).toContain(MUTE);
    const mute = card.slice(card.indexOf(MUTE));
    expect(mute.slice(0, 200)).toContain("<MusicMuteButton onMedia />");
  });

  it("inside the frame the photo is clipped to", () => {
    /*
     * Outside it the speaker would float over the card's padding, and on a
     * 1.91:1 post there is no card left to float over.
     *
     * Pinned as the last child of the gallery, closing div and all, rather
     * than by comparing positions: "after the gallery opens and before the
     * deck" is also true of a speaker sitting just OUTSIDE the gallery, so
     * that test passed when the element had been moved out of the frame.
     */
    expect(card).toContain(
      [
        "          {postTrack && (",
        '            <div className="absolute bottom-3 right-3 z-20">',
        "              <MusicMuteButton onMedia />",
        "            </div>",
        "          )}",
        "",
        "        </div>",
      ].join("\n"),
    );
  });

  it("and the deck stays a sibling of the photo rather than a child", () => {
    // Its faces are meant to be dragged off the picture, which a child of a
    // clipping box cannot be.
    const mute = card.indexOf(MUTE);
    const deck = card.indexOf("<RehypeDeck");
    expect(mute).toBeLessThan(deck);
  });
});

describe("one of each, and only one", () => {
  it("a song is drawn one way, whether or not the post has a picture", () => {
    expect(card.match(/<TrackChip /g) ?? []).toHaveLength(1);
    expect(card.match(/<MusicMuteButton/g) ?? []).toHaveLength(1);
  });

  it("and both appear only when there is a song", () => {
    expect(card).toContain("{postTrack && (");
    expect(card).not.toContain("images.length === 0 &&");
  });
});
