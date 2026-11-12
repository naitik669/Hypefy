import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A song on the media: a Shot's record, and the sleeve that unrolls.
 *
 * A post's song no longer lives here. It sat in the corner of the photo
 * with the speaker in the opposite corner, and it now rides under the
 * poster's name — song-in-the-byline.test.ts owns that placement, and
 * track-chip.test.ts owns the chip's behaviour, since it mounts it.
 *
 * What is left here is everything that is still on a picture: a Shot's
 * record in its case, the speaker's wording, and the unroll itself, which
 * both surfaces share.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const box = read("src/components/music/SoundBox.tsx");


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
    expect(box).toContain("data-sound-disc");
    expect(box).toContain("data-sound-plate");
    // A plate with a hole in it, not a frame around a square cover.
    expect(box).toContain("radial-gradient(circle at 50% 50%, transparent 0 ");
  });

  it("it turns only while the song is playing", () => {
    // With the Shot, not with the song: a Shot on its own audio has no
    // song playing, so a music-driven disc would never have turned at all.
    expect(box).toContain("const roll = spinning ?? songPlaying;");
    expect(box).toContain('roll ? "animate-[spin_3600ms_linear_infinite]" : ""');
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

describe("the name unrolls out of the case", () => {
  const chip = read("src/components/music/TrackChip.tsx");
  const shot = read("src/components/music/ShotSound.tsx");

  it("on nothing but transform and opacity", () => {
    // The first version animated clip-path. Android's WebView does not
    // composite it, so it repainted the pill every frame and stuttered on
    // the one device this had to look right on. This is the regression
    // guard for that, not a style preference.
    // Comments stripped first: both files explain why clip-path is gone,
    // and a comment that mentions it would fail this on its own.
    const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const [name, raw] of [["chip", chip], ["shot", shot]] as const) {
      const src = code(raw);
      expect(src, name).not.toContain("clip-path");
      expect(src, name).not.toContain("clipPath");
      const transitions = src.match(/transition: `[^`]+`/g) ?? [];
      expect(transitions.length, name).toBeGreaterThan(0);
      for (const t of transitions) {
        expect(t, `${name}: ${t}`).toMatch(/^transition: `(transform|opacity)/);
        expect(t, `${name}: ${t}`).not.toMatch(/width|height|left|right|top|bottom|clip/);
      }
    }
  });

  it("the ground grows from the case, and the words follow a beat behind", () => {
    // Arriving together reads as a box appearing. The delay is the whole
    // difference between unrolling and popping.
    for (const [name, src, origin] of [
      ["chip", chip, '"0% 50%"'],
      ["shot", shot, '"100% 50%"'],
    ] as const) {
      expect(src, name).toContain(`transformOrigin: ${origin}`);
      expect(src, name).toContain('transform: open ? "scaleX(1)" : "scaleX(0)"');
      expect(src, name).toContain('"70ms"');
    }
  });

  it("and the post's title cannot swallow a tap while it is hidden", () => {
    // Invisible is not gone: at opacity 0 it still sits over the photo and
    // would take taps meant for the picture.
    expect(chip).toContain('pointerEvents: open ? "auto" : "none"');
  });
});

describe("a Shot's sound", () => {
  const shot = read("src/components/music/ShotSound.tsx");

  it("turns with the Shot rather than with the song", () => {
    expect(shot).toContain("<SoundBox track={track} spinning={playing} />");
  });

  it("introduces itself once on arrival, then rolls back", () => {
    expect(shot).toContain("setTimeout(() => setRevealed(true), LEAD_MS)");
    expect(shot).toContain("setTimeout(() => setRevealed(false), LEAD_MS + HOLD_MS)");
  });

  it("and is simply not shown once you have swiped away", () => {
    // Derived, not stored: leaving the Shot hides the name without an
    // effect reaching for setState to put it back.
    expect(shot).toContain("const open = revealed && active && playing;");
  });

  it("it is anchored to the case, not to the rail", () => {
    // Absolutely positioned off the case's own edge, so it cannot widen the
    // column it sits in and nothing has to know where that column is.
    expect(shot).toContain("absolute right-full");
    expect(shot).toContain("pointer-events-none");
  });
});
