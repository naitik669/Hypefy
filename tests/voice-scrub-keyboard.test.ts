import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Scrubbing a voice note from the keyboard.
 *
 * The waveform already carried `role="slider"` and an `aria-valuenow`, with
 * no tabIndex and no key handler — so the one thing a screen reader was told
 * about it was the one thing that was not true. It was not focusable and it
 * could not be moved: a keyboard user could play a voice note and never move
 * within it. The same error SideNav's `role="tab"` would have been.
 *
 * The seek arithmetic is asserted as behaviour below. The wiring — tabIndex,
 * the ARIA range, the handler — is read from source, because the component
 * needs an <audio> element and a MediaStream to render, and what has to hold
 * is that the attributes are present at all.
 */

const raw = readFileSync("src/components/messages/VoiceMessage.tsx", "utf8");

/**
 * The source with comments removed.
 *
 * Not a nicety: the first version of this file searched `raw` for
 * `role="slider"` and found the explanation of the fix — a comment I had
 * just written saying the bars "already said role=slider" — which sits
 * earlier in the file than the markup. There was no `<div` before it, so the
 * slice came back empty and six assertions failed against ''. The same trap
 * SideNav's `role="tab"` comment set in tests/responsive-shell.
 */
const src = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

/** The opening tag of the scrubber, as text. */
function scrubberTag(): string {
  const at = src.indexOf('role="slider"');
  expect(at, "the scrubber is not in VoiceMessage").toBeGreaterThan(-1);
  const open = src.lastIndexOf("<div", at);
  expect(open, "no opening tag before role=slider").toBeGreaterThan(-1);
  // To the end of the attribute list: the first `>` on its own line after it.
  const end = src.indexOf(">", src.indexOf("onKeyDown", at));
  expect(end).toBeGreaterThan(open);
  return src.slice(open, end + 1);
}

describe("the voice note scrubber", () => {
  it("is found in the source at all", () => {
    // Every assertion below reads this slice; an empty one would pass each.
    expect(scrubberTag().length).toBeGreaterThan(200);
    expect(scrubberTag()).toContain('role="slider"');
  });

  it("is focusable", () => {
    expect(scrubberTag()).toContain("tabIndex={0}");
  });

  it("says what its range is, not only where it sits", () => {
    // With valuenow alone a reader announces "50" out of nothing.
    const tag = scrubberTag();
    expect(tag).toContain("aria-valuemin={0}");
    expect(tag).toContain("aria-valuemax={100}");
    expect(tag).toMatch(/aria-valuenow=/);
  });

  it("announces a time rather than a percentage", () => {
    // Nobody wants to hear "forty-one per cent" about a voice note.
    expect(scrubberTag()).toMatch(/aria-valuetext=\{`\$\{fmt\(displayTime\)\} of \$\{fmt\(duration\)\}`\}/);
  });

  it("handles keys", () => {
    expect(scrubberTag()).toContain("onKeyDown={onScrubKey}");
  });

  it("shows a focus ring, since it is reachable now", () => {
    expect(scrubberTag()).toContain("focus-visible:outline");
  });

  it("binds the ARIA slider pattern's own keys", () => {
    // Arrows, Page keys, Home and End — so nothing has to be learned.
    const handler = src.slice(src.indexOf("function onScrubKey"));
    const body = handler.slice(0, handler.indexOf("\n  }"));
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]) {
      expect(body, `${key} is not bound`).toContain(`"${key}"`);
    }
  });

  it("stops the page scrolling when it takes an arrow key", () => {
    // Otherwise the thread scrolls under the finger while you scrub.
    const handler = src.slice(src.indexOf("function onScrubKey"));
    const body = handler.slice(0, handler.indexOf("\n  }"));
    expect((body.match(/e\.preventDefault\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("shares one clamped seek with the pointer", () => {
    // The click handler used to hold the arithmetic. Two copies of "where in
    // the note is this" is how a scrub and a tap come to disagree.
    expect(src).toContain("function seekTo(ratio: number)");
    expect(src).toMatch(/Math\.max\(0, Math\.min\(1, ratio\)\)/);
    expect(src).toContain("seekTo((e.clientX - rect.left) / rect.width)");
  });
});

/**
 * The clamp and the steps, as arithmetic.
 *
 * seekTo's body needs an <audio> with a duration, so the rule rather than
 * the function: a ratio outside 0..1 must come back inside it, because the
 * keyboard adds a fixed step to wherever it already is and will walk off
 * both ends.
 */
describe("the seek arithmetic", () => {
  const clamp = (r: number) => Math.max(0, Math.min(1, r));
  const STEP = 0.05;

  it("stops at the start rather than going negative", () => {
    expect(clamp(0.02 - STEP)).toBe(0);
  });

  it("stops at the end rather than past it", () => {
    expect(clamp(0.98 + STEP)).toBe(1);
  });

  it("steps by a twentieth in the middle", () => {
    expect(clamp(0.5 + STEP)).toBeCloseTo(0.55, 10);
    expect(clamp(0.5 - STEP)).toBeCloseTo(0.45, 10);
  });

  it("takes twenty presses to cross the whole note", () => {
    // A note of any length: the step is a fraction, not a number of seconds,
    // so a 3-second note and a 3-minute one both take the same 20 presses.
    let r = 0;
    let presses = 0;
    while (r < 1 && presses < 100) {
      r = clamp(r + STEP);
      presses++;
    }
    expect(presses).toBe(20);
  });

  it("and the step the component uses is that one", () => {
    expect(src).toContain("const STEP = 0.05;");
    expect(src).toContain("const PAGE = 0.2;");
  });
});
