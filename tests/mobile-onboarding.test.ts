import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { SLIDES, COPY, titleOf, type SlideId } from "../apps/mobile/src/onboarding/slides";

/**
 * The phone's onboarding says and measures what the website's does.
 *
 * The instruction is that the app should not be distinguishable from
 * app.hypefy.chat. Copy drifts silently — a word changed on the site and
 * not on the phone is invisible to everyone except the person who notices
 * the two do not match — and so do measurements, which is worse, because a
 * 24 where the web says 28 reads as "slightly off" with nothing to point
 * at.
 *
 * Both are therefore read OFF the web's source rather than restated here.
 */

const WEB = "src/components/onboarding/IntroCarousel.tsx";
const NATIVE = "apps/mobile/src/onboarding/IntroCarousel.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** Source with comments gone — the trap that keeps reappearing in this repo. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\/.*$/gm, "");
}

/** The web's Copy function, with JSX tags removed so the words are left. */
function webCopyText(): string {
  const src = code(WEB);
  const start = src.indexOf("function Copy(");
  expect(start, "the web no longer has a Copy function").toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  const block = end === -1 ? rest : rest.slice(0, end);
  return block.replace(/<[^>]*>/g, "");
}

describe("the slides are the website's slides", () => {
  it("same ids, same order", () => {
    const m = code(WEB).match(/const SLIDES = \[([^\]]+)\]/);
    expect(m, "the web no longer declares SLIDES").toBeTruthy();
    const webSlides = [...(m?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
    expect(webSlides.length).toBeGreaterThan(0);
    expect([...SLIDES]).toEqual(webSlides);
  });
});

describe("the copy is the website's copy, word for word", () => {
  const block = webCopyText();

  for (const slide of SLIDES) {
    it(`${slide}: title, lead and body all appear in the web source`, () => {
      const c = COPY[slide as SlideId];
      // The title is reassembled from the two halves the component renders,
      // so a change to either one is caught rather than only the first.
      expect(block, `${slide} title`).toContain(titleOf(slide).trim());
      expect(block, `${slide} lead`).toContain(c.lead);
      expect(block, `${slide} text`).toContain(c.text);
    });
  }

  it("and only the welcome slide has an accented tail, as on the web", () => {
    // The web wraps exactly one run in <span className="text-accent">.
    const accented = SLIDES.filter((s) => COPY[s].titleAccent !== undefined);
    expect(accented).toEqual(["welcome"]);
    expect(code(WEB)).toMatch(/<span className="text-accent">Hypefy<\/span>/);
  });
});

describe("the measurements are the website's measurements", () => {
  /**
   * Tailwind class -> the number of pixels it means.
   *
   * Written out so the mapping is auditable rather than buried in a
   * conversion done once in somebody's head. Every entry is checked in
   * both directions: the class is present on the web, and the number is
   * present in the native stylesheet.
   */
  const SCALE: ReadonlyArray<readonly [string, number, string]> = [
    // [web class, px, what it sets]
    ["px-7", 28, "slide and footer side padding"],
    ["px-6", 24, "top bar side padding"],
    ["pt-5", 20, "top bar top padding"],
    ["h-14", 56, "the CTA's height"],
    ["pb-10", 40, "footer bottom padding"],
    ["mb-5", 20, "gap under the dots"],
  ];

  const web = code(WEB);
  const native = code(NATIVE);

  for (const [cls, px, what] of SCALE) {
    it(`${cls} is ${px} — ${what}`, () => {
      // Word-boundaried, so px-7 does not match px-70 and h-14 does not
      // match h-140.
      expect(web, `the web no longer uses ${cls}`).toMatch(
        new RegExp(`(^|[\\s"'\`])${cls.replace("-", "\\-")}($|[\\s"'\`])`),
      );
      expect(native, `${px} (${cls}) missing from the native styles`).toMatch(
        new RegExp(`\\b${px}\\b`),
      );
    });
  }

  it("the title is 2rem, which is 32", () => {
    expect(web).toContain("text-[2rem]");
    expect(native).toMatch(/fontSize: 32/);
  });

  it("the active dot is three times the width of an idle one", () => {
    // w-6 active, w-2 idle — 24 and 8.
    expect(web).toMatch(/w-6 bg-accent/);
    expect(web).toMatch(/w-2 bg-border/);
    expect(native).toMatch(/dotActive: \{ width: 24/);
    expect(native).toMatch(/dotIdle: \{ width: 8/);
  });

  it("the CTA presses to 0.96, as the web's active: state does", () => {
    expect(web).toContain("active:scale-[0.96]");
    expect(native).toMatch(/scale: 0\.96/);
  });

  it("the arrow is the same size and weight", () => {
    const m = web.match(/<ArrowRight\s+size=\{(\d+)\}\s+strokeWidth=\{([\d.]+)\}/);
    expect(m, "the web's ArrowRight no longer declares size and strokeWidth").toBeTruthy();
    expect(native).toMatch(new RegExp(`size=\\{${m?.[1]}\\}`));
    expect(native).toMatch(new RegExp(`strokeWidth=\\{${m?.[2]}\\}`));
  });

  it("and the slide transition uses the web's own easing curve", () => {
    // cubic-bezier(0.16,1,0.3,1) on both sides. A different curve is the
    // kind of difference you feel without being able to name.
    expect(web).toMatch(/cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    expect(native).toMatch(/Easing\.bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/);
    /*
     * Anchored to the PAGER, not to the first duration in the file. The
     * web declares three: 0.6s for a slide's content transform, 0.55s for
     * the reveal, and 0.55s for the track. An unanchored match took the
     * 0.6 and compared it against the track's 550, which is the test
     * being wrong rather than the code.
     */
    const pager = web.slice(web.indexOf("translateX(-${index * 100}%)"));
    const dur = pager.match(/transition: "transform (0\.\d+)s cubic-bezier\(0\.16,1,0\.3,1\)"/);
    expect(dur, "the web's pager no longer states a transition duration").toBeTruthy();
    // Rounded: 0.55 * 1000 is 550.0000000000001 in binary floating point,
    // and the unrounded value never matches anything.
    const ms = Math.round(Number(dur?.[1]) * 1000);
    expect(native).toMatch(new RegExp(`duration: ${ms}\\b`));
  });

  it("and the swipe threshold is the web's 45px", () => {
    expect(web).toMatch(/dx <= -45/);
    expect(native).toMatch(/SWIPE_THRESHOLD = 45/);
  });
});

describe("the welcome slide's mock-up matches the website's", () => {
  const WEB_VISUAL = (() => {
    const src = code(WEB);
    const start = src.indexOf("function WelcomeVisual()");
    expect(start, "the web no longer has a WelcomeVisual").toBeGreaterThan(-1);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    return end === -1 ? rest : rest.slice(0, end);
  })();

  const native = () => code("apps/mobile/src/onboarding/WelcomeVisual.tsx");

  /**
   * The web class, verbatim, and what the native side must say.
   *
   * The class is matched with `toContain`, NOT by building a RegExp from
   * it. The first version did the latter and `"w-[212px]"` became a
   * character class — it matched `w-2` in `w-224px`, so the website could
   * change the card's width and this test would shrug. Mutation M12 found
   * it. A literal string needs no escaping and cannot be misread.
   */
  const SIZES: ReadonlyArray<readonly [string, RegExp, string]> = [
    ["w-[212px]", /CARD_W = 212/, "the card's width"],
    ["rounded-[28px]", /borderRadius: 28/, "the card's radius"],
    ["h-[26px]", /RING_INNER = 26/, "a Shows ring"],
    ["gap-2.5", /gap: 10/, "the gap between rings"],
    ["text-[13px]", /fontSize: 13/, "the mock wordmark"],
    ["text-[11px]", /fontSize: 11/, "the hype count"],
    ["-right-6", /right: -24/, "how far the badge hangs off"],
  ];

  for (const [cls, nativeRe, what] of SIZES) {
    it(`${what} — ${cls}`, () => {
      expect(WEB_VISUAL, `the web no longer uses ${cls}`).toContain(cls);
      expect(native(), `${what} does not match`).toMatch(nativeRe);
    });
  }

  it("the badge sits 42% down, as it does on the web", () => {
    expect(WEB_VISUAL).toContain("top-[42%]");
    expect(native()).toMatch(/top: "42%"/);
  });

  it("uses the website's own image files rather than copies of them", () => {
    /*
     * Metro watches the workspace root, so these resolve across it and
     * bundle — verified by `expo export`, which lists them from
     * ../../public/onboarding. Copying them into the app would have meant
     * ~600KB duplicated and two sets to keep in step; this way an image
     * changed on the site is changed here by construction.
     *
     * The assertion is that the imports point OUT of the app. A copy
     * appearing inside apps/mobile/assets would pass a naive "the image
     * exists" check while reintroducing exactly the drift being avoided.
     */
    const src = native();
    const imports = [...src.matchAll(/from "([^"]*public\/onboarding\/[^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(imports.length, "no shared onboarding images are imported").toBeGreaterThan(0);
    for (const spec of imports) {
      const file = spec.replace(/^(\.\.\/)+/, "");
      expect(existsSync(file), `${file} is missing from the web's public folder`).toBe(true);
    }
    expect(src, "an image was copied into the app instead of shared").not.toMatch(
      /assets\/onboarding/,
    );
  });

  it("and every image it names is one the web's own visual names", () => {
    for (const m of native().matchAll(/public\/onboarding\/([\w.-]+)"/g)) {
      expect(WEB_VISUAL, `${m[1]} is not in the web's WelcomeVisual`).toContain(m[1]);
    }
  });

  it("the glow is left out rather than faked", () => {
    /*
     * The web has `bg-accent/10` with `blur-3xl` behind the card. React
     * Native has no filter, and a 10%-accent rectangle with hard edges
     * looks worse than nothing — so it is absent, and recorded as absent.
     * This fails if someone adds a hard-edged stand-in for it.
     */
    expect(WEB_VISUAL).toContain("blur-3xl");
    expect(native()).not.toMatch(/glow/i);
  });
});

describe("what is deliberately not done yet", () => {
  it("the four remaining visuals are absent, not stubbed", () => {
    // Welcome is drawn. The other four slides render nothing in the slot,
    // which is honest; a placeholder illustration would make the screen
    // look finished and then have to come out.
    const carousel = code(NATIVE);
    expect(carousel).toMatch(/slide === "welcome" \? <WelcomeVisual \/> : null/);
    for (const other of ["MockPostStack", "MockReel", "MockDiscover", "MockProfile"]) {
      expect(carousel, `${other} appeared without being announced`).not.toContain(other);
    }
  });

  it("the visual slot is reserved and centred", () => {
    /*
     * The five mock-ups are the other 600 lines of the web component. The
     * seat they will take is laid out now so the copy and footer sit where
     * they will end up, and left empty rather than filled — a stand-in
     * illustration would have to come back out, and would make the screen
     * look finished while it is not.
     */
    const native = code(NATIVE);
    expect(native).toMatch(/visualSlot/);
    expect(native).toMatch(/visualSlot: \{ flex: 1/);
  });
});
