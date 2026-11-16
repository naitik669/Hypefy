import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * What a keyboard can reach.
 *
 * A `<button>` or `<a href>` is focusable and fires on Enter or Space for
 * free. A `div` with an onClick is not: no focus, no key handling, nothing
 * announced. It is the commonest keyboard failure in a React codebase and it
 * is findable without running anything.
 *
 * This is a ratchet, not a clean bill of health. 44 such elements exist and
 * most are fine — see the classification below — but the number must not grow
 * without someone saying why, because every new one is a control a keyboard
 * user cannot operate.
 *
 * **The scanner has to parse a JSX tag properly.** The first version matched
 * /<div\b([^>]*?)>/ and reported that NONE of these were keyboard-operable,
 * which was wrong: an attribute like `onClick={(e) => ...}` contains a `>`,
 * so the match ended inside the arrow function and every attribute after it
 * was invisible. It counted TrackPicker — which handles Enter and Space
 * correctly — as a defect. A confident wrong number from a plausible regex.
 */

function tsxFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Elements that are not interactive on their own. */
const TAGS = ["div", "span", "li", "p", "section", "article", "img", "svg", "label", "td", "tr"];

/**
 * The whole opening tag starting at `i`.
 *
 * Walks forward tracking brace depth and quotes, so the tag ends at the
 * first `>` actually at depth 0 rather than one inside an arrow function.
 */
function readTag(src: string, i: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (quote) {
      if (c === quote && src[j - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(i, j + 1);
  }
  return null;
}

type Hit = { file: string; tag: string; operable: boolean };

function clickableNonInteractive(): Hit[] {
  const hits: Hit[] = [];
  for (const f of tsxFiles()) {
    const src = readFileSync(f, "utf8");
    for (const tag of TAGS) {
      for (const m of src.matchAll(new RegExp(`<${tag}(?=[\\s/>])`, "g"))) {
        const open = readTag(src, m.index!);
        if (!open || !/\bonClick=/.test(open)) continue;
        hits.push({
          file: f.split("\\").join("/"),
          tag,
          operable: /\btabIndex=/.test(open) && /\bonKey(Down|Up|Press)=/.test(open),
        });
      }
    }
  }
  return hits;
}

/**
 * Where the number stands.
 *
 * Measured on 16 Nov 2026. Of the 44, reviewed one at a time:
 *
 *  - ~17 are click-outside backdrops. A full-screen div that closes the
 *    thing above it. Escape already closes all of them, so there is a
 *    keyboard path and making the backdrop itself focusable would add a tab
 *    stop that does nothing visible.
 *  - ~13 are event swallowers: `onClick={(e) => e.stopPropagation()}`. They
 *    add no action at all; they stop a click reaching something above.
 *  - Most of the rest duplicate an action that already has a real button
 *    beside them. FriendDiaryCard is the clearest: tapping the words opens
 *    the page, and so does a labelled maximise button in the card's header,
 *    on every variant of it. Turning the words into a button would add three
 *    tab stops all doing the same thing.
 *  - One was a genuine defect and is fixed: VoiceMessage's waveform declared
 *    `role="slider"` with no tabIndex and no key handler, so a keyboard user
 *    could play a voice note and never move within it. See
 *    tests/voice-scrub-keyboard.test.ts.
 *
 * The ones still worth looking at sit in files held by the lint ratchet
 * (CallProvider, FeedCard, InAppNotifier, RealChatView), which cannot be
 * touched until their react-hooks debt is paid.
 */
const CEILING = 44;

describe("keyboard reach", () => {
  it("the scanner finds these at all", () => {
    // A ceiling compared against an empty list passes and proves nothing.
    expect(clickableNonInteractive().length).toBeGreaterThan(20);
  });

  it("and can read an attribute containing an arrow function", () => {
    // The bug that made the first version of this file useless. TrackPicker's
    // preview control has onClick, onKeyDown and tabIndex, in that order, so
    // a scanner that stops at the `>` inside onClick misses the other two.
    const picker = readFileSync("src/components/music/TrackPicker.tsx", "utf8");
    const at = picker.indexOf('role="button"');
    const open = readTag(picker, picker.lastIndexOf("<span", at))!;
    expect(open).toContain("onKeyDown");
    expect(open).toContain("tabIndex");
  });

  it("does not grow", () => {
    const hits = clickableNonInteractive();
    expect(
      hits.length,
      `clickable non-interactive elements went from ${CEILING} to ${hits.length}. ` +
        `A new one is a control a keyboard cannot operate — use a <button>, or ` +
        `if it is a backdrop or an event swallower, raise CEILING and say which.`,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("and TrackPicker's preview stays operable", () => {
    // The one hand-rolled control in the set that does it correctly. Keeps
    // the "operable" branch of the scanner exercised.
    const operable = clickableNonInteractive().filter((h) => h.operable);
    expect(operable.length).toBeGreaterThanOrEqual(1);
  });
});
