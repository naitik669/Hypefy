import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { SLIDES, COPY, titleOf, type SlideId } from "../apps/mobile/src/onboarding/slides";
import {
  hslToHex,
  avatarStops,
  STOP_FROM,
  STOP_MID,
  STOP_TO,
} from "../apps/mobile/src/avatar-color";

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

describe("the posts slide's feed wall matches the website's", () => {
  /** One of the web's functions, sliced out by name. */
  function webFn(name: string): string {
    const src = code(WEB);
    const start = src.indexOf(`function ${name}(`);
    expect(start, `the web no longer has a ${name}`).toBeGreaterThan(-1);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    return end === -1 ? rest : rest.slice(0, end);
  }

  const native = () => code("apps/mobile/src/onboarding/MockPostStack.tsx");

  /**
   * One entry of the native stylesheet, sliced by name.
   *
   * Per-element rather than per-number, which the first version of this got
   * wrong: `left: -112` appears twice (leo and jay both hang off the same
   * edge) and `opacity: 0.6` appears twice, so asserting the NUMBER was
   * somewhere in the file left a mutation that moved one of the pair green.
   * Mutations M2 and M3 found it.
   */
  function nativeStyle(key: string): string {
    const src = native();
    const start = src.indexOf(`  ${key}: {`);
    expect(start, `${key} is not a style in MockPostStack`).toBeGreaterThan(-1);
    /*
     * Braces are counted rather than looking for the next `},`: the hero's
     * entry contains a transform array whose first element closes with
     * `}, `, so the naive slice cut the entry in half and lost the second
     * translate. The test failed, which is the system working — but it
     * failed on a correct file, which is the kind of test that gets
     * "fixed" by changing the code.
     */
    let depth = 0;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`${key}'s style never closes`);
  }

  /**
   * Tailwind class -> the React Native field and value it means.
   *
   * Written out so the conversion is auditable rather than done once in
   * somebody's head, and so a class the web adds and the phone ignores
   * fails the audit below instead of passing silently.
   */
  const CLASS_TO_STYLE: Readonly<Record<string, readonly [string, string]>> = {
    absolute: ["position", '"absolute"'],
    "-left-28": ["left", "-112"],
    "-left-32": ["left", "-128"],
    "-right-24": ["right", "-96"],
    "-right-32": ["right", "-128"],
    "-top-8": ["top", "-32"],
    "top-3": ["top", "12"],
    "-bottom-5": ["bottom", "-20"],
    "-bottom-6": ["bottom", "-24"],
    "-bottom-10": ["bottom", "-40"],
    "w-36": ["width", "144"],
    "w-40": ["width", "160"],
    "w-48": ["width", "192"],
    "h-44": ["height", "176"],
    "opacity-50": ["opacity", "0.5"],
    "opacity-60": ["opacity", "0.6"],
    "z-20": ["zIndex", "20"],
    "z-30": ["zIndex", "30"],
    "z-40": ["zIndex", "40"],
  };

  /** Classes that say nothing about where an element sits. */
  const IGNORED = new Set(["relative", "pointer-events-none"]);

  /**
   * Which native style answers which of the web's wrappers.
   *
   * The index is the position of the `className` in the web's
   * MockPostStack, counting the outer `relative` as 0 — so a wrapper
   * inserted or removed on the web shifts the mapping and fails here
   * rather than quietly comparing leo against nia.
   */
  const WRAPPERS: ReadonlyArray<readonly [string, number, string]> = [
    ["leo", 1, "leo, up and left behind the hero"],
    ["jay", 2, "jay, down and left"],
    ["nia", 3, "nia, off the right edge"],
    ["hero", 4, "the hero itself"],
    ["ada", 5, "ada, biggest and in front"],
    ["fade", 6, "the fade into the background"],
  ];

  const webClasses = [...webFn("MockPostStack").matchAll(/className="([^"]+)"/g)].map((m) => m[1]);

  it("the web's posts slide still has the six wrappers this is read off", () => {
    expect(webClasses.length).toBe(7); // the outer relative plus six
  });

  for (const [key, index, what] of WRAPPERS) {
    it(`${what} sits where the web puts it`, () => {
      const classes = webClasses[index].split(/\s+/).filter((c) => !IGNORED.has(c));
      expect(classes.length, `wrapper ${index} has no positioning classes`).toBeGreaterThan(0);
      const style = nativeStyle(key);
      for (const cls of classes) {
        const pair = CLASS_TO_STYLE[cls];
        expect(pair, `${cls} is not in the conversion table — add it or explain it`).toBeTruthy();
        const [field, value] = pair ?? ["", ""];
        expect(style, `${key} should carry ${field}: ${value} (${cls})`).toContain(
          `${field}: ${value}`,
        );
      }
    });
  }

  it("the hero is nudged up and left by the web's own offsets", () => {
    expect(webFn("MockPostStack")).toContain("translate(-12px, -10px)");
    expect(nativeStyle("hero")).toContain("translateX: -12");
    expect(nativeStyle("hero")).toContain("translateY: -10");
  });

  it("each post bobs for the web's own duration, after the web's own delay", () => {
    /*
     * Five Float instances with five pairs of figures. They are what makes
     * the wall feel alive rather than pasted on, and a pair copied onto the
     * wrong post is invisible in a screenshot — so the pairs are read off
     * the web and matched as pairs, not as a set of numbers that happen to
     * appear somewhere in the file.
     */
    const web = webFn("MockPostStack");
    const pairs = [...web.matchAll(/<Float dur="([\d.]+)s" delay="([\d.]+)s">/g)].map(
      (m) => [Number(m[1]) * 1000, Number(m[2]) * 1000] as const,
    );
    expect(pairs.length, "the web's Float instances have changed shape").toBe(5);
    const src = native();
    for (const [dur, delay] of pairs) {
      expect(src, `no Float at ${dur}ms after ${delay}ms`).toMatch(
        new RegExp(`dur=\\{${dur}\\} delay=\\{${delay}\\}`),
      );
    }
  });

  it("the reveal runs in the web's order", () => {
    const web = webFn("MockPostStack");
    const orders = [...web.matchAll(/revealStyle\(active, (\d)\)/g)].map((m) => Number(m[1]));
    expect(orders, "the web's reveal order has changed").toEqual([4, 3, 4, 2, 5]);
    expect([...native().matchAll(/order=\{(\d)\}/g)].map((m) => Number(m[1]))).toEqual(orders);
  });

  it("the four neighbours are the web's four users, with the web's figures", () => {
    /*
     * Name, time and hype count per post, in the web's order. A reordered
     * list would otherwise pass every individual assertion while putting
     * ada's count under leo's photograph.
     */
    const web = code(WEB);
    const block = web.slice(web.indexOf("const BG_POSTS"), web.indexOf("function MockPostStack"));
    const webRows = [...block.matchAll(/name: "(\w+)".*?time: "([^"]+)", hypes: "([^"]+)"/g)].map(
      (m) => [m[1], m[2], m[3]] as const,
    );
    expect(webRows.length, "the web's BG_POSTS no longer parse").toBe(4);

    const src = native();
    const nativeBlock = src.slice(src.indexOf("const BG_POSTS"), src.indexOf("export function"));
    const nativeRows = [
      ...nativeBlock.matchAll(/name: "(\w+)".*?time: "([^"]+)", hypes: "([^"]+)"/g),
    ].map((m) => [m[1], m[2], m[3]] as const);
    expect(nativeRows).toEqual(webRows);
  });

  it("and the two with a photograph of their own still have one", () => {
    // leo and nia fall back to the gradient avatar; jay and ada have real
    // pictures. Losing one silently swaps a face for a coloured square.
    const web = code(WEB);
    const block = web.slice(web.indexOf("const BG_POSTS"), web.indexOf("function MockPostStack"));
    const withAvatar = [...block.matchAll(/name: "(\w+)"[^\n]*avatar:/g)].map((m) => m[1]);
    expect(withAvatar).toEqual(["jay", "ada"]);

    const src = native();
    const nativeBlock = src.slice(src.indexOf("const BG_POSTS"), src.indexOf("export function"));
    expect([...nativeBlock.matchAll(/name: "(\w+)"[^\n]*avatar:/g)].map((m) => m[1])).toEqual(
      withAvatar,
    );
  });

  it("the card sizes are the web's", () => {
    const SIZES: ReadonlyArray<readonly [string, string, RegExp, string]> = [
      ["MockPostCard", "w-[300px]", /CARD_W = 300/, "the hero's width"],
      ["MockPostCard", "rounded-[28px]", /borderRadius: 28/, "the hero's radius"],
      ["MockPostCard", "h-[42px]", /CARD_AVATAR = 42/, "the hero's avatar"],
      ["BgPost", "rounded-[20px]", /borderRadius: 20/, "a neighbour's radius"],
      ["BgPost", "h-[26px]", /BG_AVATAR = 26/, "a neighbour's avatar"],
      ["BgPost", "text-[11px]", /fontSize: 11/, "a neighbour's name"],
      ["BgPost", "text-[9px]", /fontSize: 9/, "a neighbour's timestamp"],
    ];
    for (const [fn, cls, nativeRe, what] of SIZES) {
      expect(webFn(fn), `${fn} no longer uses ${cls}`).toContain(cls);
      expect(native(), `${what} does not match`).toMatch(nativeRe);
    }
  });

  it("the icons are the same sizes the web draws them at", () => {
    /*
     * Three glyphs on two cards, six sizes between them, and they are
     * deliberately uneven on the web — 24/23/22 on the hero, 13/12/11 on a
     * neighbour — so a single shared number would be wrong.
     */
    for (const fn of ["MockPostCard", "BgPost"] as const) {
      const web = webFn(fn);
      const sizes = [...web.matchAll(/<(HypeIcon|CommentIcon|ShareIcon) size=\{(\d+)\}/g)].map(
        (m) => [m[1], Number(m[2])] as const,
      );
      expect(sizes.length, `${fn} no longer draws three glyphs`).toBe(3);
      for (const [icon, size] of sizes) {
        expect(native(), `${icon} is not ${size} as it is in ${fn}`).toMatch(
          new RegExp(`<${icon} size=\\{${size}\\}`),
        );
      }
    }
  });

  it("uses the website's own image files rather than copies of them", () => {
    const src = native();
    const imports = [...src.matchAll(/from "([^"]*public\/onboarding\/[^"]+)"/g)].map((m) => m[1]);
    expect(imports.length, "no shared onboarding images are imported").toBeGreaterThan(0);
    for (const spec of imports) {
      const file = spec.replace(/^(\.\.\/)+/, "");
      expect(existsSync(file), `${file} is missing from the web's public folder`).toBe(true);
    }
    expect(src, "an image was copied into the app instead of shared").not.toMatch(
      /assets\/onboarding/,
    );
  });

  it("and every image it names is one the web's posts slide names", () => {
    const web = code(WEB);
    const block = web.slice(web.indexOf("const BG_POSTS"), web.indexOf("type ReelData"));
    for (const m of native().matchAll(/public\/onboarding\/([\w.-]+)"/g)) {
      expect(block, `${m[1]} is not used by the web's posts slide`).toContain(m[1]);
    }
  });

  it("the gradient placeholder behind the hero photograph is the web's two colours", () => {
    const web = webFn("MockPostCard");
    const m = web.match(/linear-gradient\(135deg, (#[0-9a-f]{6}), (#[0-9a-f]{6})\)/);
    expect(m, "the web's hero no longer has a gradient placeholder").toBeTruthy();
    expect(native()).toContain(`color: "${m?.[1]}"`);
    expect(native()).toContain(`color: "${m?.[2]}"`);
  });

  it("and the fade to black turns solid where the web's does", () => {
    /*
     * The web's gradient runs `to top`, solid until 42% and transparent at
     * the far end. This one runs downward, so the same stop is at 58%. The
     * arithmetic is the point of the assertion: an un-flipped copy fades
     * the wrong way and hides the hero instead of the posts' feet.
     */
    const web = webFn("MockPostStack");
    const m = web.match(/var\(--color-background\) (\d+)%, transparent/);
    expect(m, "the web's fade no longer states its stop").toBeTruthy();
    const flipped = (100 - Number(m?.[1])) / 100;
    // Bounded by the comma that follows, not by \b — see the reels slide's
    // gradient test for why a word boundary is the wrong tool on a decimal.
    expect(native()).toMatch(new RegExp(`offset: ${String(flipped).replace(".", "\\.")},`));
  });
});

describe("the slides' shared motion is the website's", () => {
  /*
   * Float, the two reveals and the star's pop are declared once on the web
   * and shared by its five visuals, so they are one file here too — and
   * asserted here rather than inside each slide's block, so a second copy
   * appearing in a slide is visible as an unexplained duplicate.
   */
  const MOTION = "apps/mobile/src/onboarding/motion.tsx";
  const motion = () => code(MOTION);
  const web = () => code(WEB);

  it("the bob travels the web's 7px", () => {
    const css = read("src/app/globals.css");
    const block = css.slice(css.indexOf("@keyframes float-y"));
    expect(block.slice(0, 200)).toContain("translateY(-7px)");
    expect(motion()).toMatch(/FLOAT_Y = -7/);
  });

  it("the stagger is the web's REVEAL_GAP, and reelReveal's own step agrees", () => {
    const gap = web().match(/const REVEAL_GAP = (\d+)/);
    expect(gap, "the web no longer declares REVEAL_GAP").toBeTruthy();
    expect(motion()).toMatch(new RegExp(`REVEAL_GAP = ${gap?.[1]}\\b`));
    /*
     * The web writes the reels' step as a literal — `order * 170` inside
     * reelReveal — rather than reusing REVEAL_GAP. They happen to agree,
     * and this is the assertion that keeps them agreeing: one constant
     * serves both slides here, so if the web ever changes only one of the
     * two this fails rather than silently following the wrong one.
     */
    const reel = web().slice(web().indexOf("function reelReveal("));
    expect(reel.slice(0, 200)).toContain(`order * ${gap?.[1]}`);
  });

  it("revealStyle's rise and both its timings", () => {
    const reveal = web().slice(web().indexOf("function revealStyle("));
    expect(reveal).toContain("translateY(16px)");
    expect(reveal).toContain("opacity 0.5s ease");
    expect(reveal).toContain("transform 0.55s cubic-bezier(0.16,1,0.3,1)");

    const fn = motion().slice(motion().indexOf("export function Reveal("));
    expect(fn).toMatch(/outputRange: \[0, 16\]/);
    expect(fn).toMatch(/duration: 500/);
    expect(fn).toMatch(/duration: 550/);
    expect(fn).toMatch(/Easing\.bezier\(0\.16, 1, 0\.3, 1\)/);
  });

  it("reelReveal's rise, its scale and both its timings", () => {
    const reel = web().slice(web().indexOf("function reelReveal("));
    const block = reel.slice(0, reel.indexOf("\nfunction "));
    expect(block).toContain("translateY(22px) scale(0.95)");
    expect(block).toContain("opacity 0.55s ease");
    expect(block).toContain("transform 0.6s cubic-bezier(0.16,1,0.3,1)");

    const fn = motion().slice(motion().indexOf("export function ReelReveal("));
    expect(fn).toMatch(/outputRange: \[0, 22\]/);
    expect(fn).toMatch(/outputRange: \[1, 0\.95\]/);
    expect(fn).toMatch(/duration: 550/);
    expect(fn).toMatch(/duration: 600/);
    expect(fn).toMatch(/Easing\.bezier\(0\.16, 1, 0\.3, 1\)/);
  });

  it("and the two reveals are not the same thing wearing two names", () => {
    /*
     * The web keeps them separate because the numbers differ. If a future
     * edit collapses one into the other, this says so.
     *
     * Each slice is bounded at the next export, which the first version
     * was not: slicing from `export function Reveal(` to the end of the
     * file swept ReelReveal in with it, so the test failed on correct
     * code. The same mistake as the stylesheet slicer on the posts slide.
     */
    const bounded = (name: string) => {
      const src = motion();
      const start = src.indexOf(`export function ${name}(`);
      expect(start, `${name} is not exported from motion.tsx`).toBeGreaterThan(-1);
      const rest = src.slice(start + 1);
      const end = rest.indexOf("\nexport function ");
      return end === -1 ? rest : rest.slice(0, end);
    };
    expect(bounded("Reveal")).not.toContain("outputRange: [0, 22]");
    expect(bounded("ReelReveal")).not.toContain("outputRange: [0, 16]");
  });

  it("the star pops to the web's scale and tilt, over the web's duration", () => {
    const css = read("src/app/globals.css");
    const block = css.slice(css.indexOf("@keyframes star-pop"));
    expect(block.slice(0, 300)).toContain("scale(1.2) rotate(10deg)");
    const dur = block.match(/animation: star-pop ([\d.]+)s/);
    expect(dur, "the web no longer states star-pop's duration").toBeTruthy();

    const fn = motion().slice(motion().indexOf("export function StarPop("));
    expect(fn).toMatch(/outputRange: \[1, 1\.2\]/);
    expect(fn).toMatch(/outputRange: \["0deg", "10deg"\]/);
    // There and back, so each leg is half.
    expect(fn).toMatch(new RegExp(`leg = ${(Number(dur?.[1]) * 1000) / 2}\\b`));
  });

  it("and the blur every one of these leaves out is recorded as left out", () => {
    /*
     * The web's reveals fade in FROM a blur, and there is no filter in
     * React Native. This asserts the omission is written down rather than
     * forgotten — and that nobody has quietly added a fake for it.
     */
    expect(web()).toContain("blur(8px)");
    expect(web()).toContain("blur(10px)");
    expect(read(MOTION), "the missing blur is no longer explained").toMatch(
      /no filter|expo-blur/i,
    );
    expect(motion(), "something is pretending to be the blur").not.toMatch(/blur/i);
  });
});

describe("the shots slide's reels match the website's", () => {
  function webFn(name: string): string {
    const src = code(WEB);
    const start = src.indexOf(`function ${name}(`);
    expect(start, `the web no longer has a ${name}`).toBeGreaterThan(-1);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    return end === -1 ? rest : rest.slice(0, end);
  }

  const native = () => code("apps/mobile/src/onboarding/MockReel.tsx");

  it("the three cards are the web's three sizes, paired as the web pairs them", () => {
    /*
     * Width and height together, not as two sets of numbers: a height
     * copied onto the wrong card gives a reel the wrong shape while every
     * individual figure still appears in the file.
     */
    const web = webFn("MockReel");
    const pairs = [...web.matchAll(/w=\{(\d+)\} h=\{(\d+)\}/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    expect(pairs.length, "the web no longer renders three reels").toBe(3);
    for (const [w, h] of pairs) {
      expect(native(), `no reel at ${w}x${h}`).toMatch(new RegExp(`w=\\{${w}\\} h=\\{${h}\\}`));
    }
  });

  it("the hero is the only one that gets the star's pop", () => {
    // The web passes `active` to one ReelCard. Pass it to all three and
    // three stars tick out of sync for no reason.
    const web = webFn("MockReel");
    const withActive = [...web.matchAll(/w=\{(\d+)\} h=\{\d+\} active=\{active\}/g)].map(
      (m) => m[1],
    );
    expect(withActive, "the web no longer marks exactly one reel active").toEqual(["188"]);
    expect([...native().matchAll(/w=\{(\d+)\} h=\{\d+\} active=\{active\}/g)].map((m) => m[1])).toEqual(
      withActive,
    );
  });

  it("the two behind sit where the web puts them", () => {
    const PLACEMENT: ReadonlyArray<readonly [string, string, RegExp]> = [
      ["left", "-left-20", /left: -80/],
      ["left", "top-7", /top: 28/],
      ["left", "opacity-50", /opacity: 0\.5/],
      ["right", "-right-20", /right: -80/],
      ["right", "top-12", /top: 48/],
      ["right", "opacity-45", /opacity: 0\.45/],
    ];
    const web = webFn("MockReel");
    for (const [key, cls, re] of PLACEMENT) {
      expect(web, `the web no longer uses ${cls}`).toContain(cls);
      const src = native();
      const start = src.indexOf(`  ${key}: {`);
      expect(start, `${key} is not a style in MockReel`).toBeGreaterThan(-1);
      const entry = src.slice(start, src.indexOf("},", start));
      expect(entry, `${key} should carry ${cls}`).toMatch(re);
    }
  });

  it("the hero sits above them", () => {
    expect(webFn("MockReel")).toContain("z-10");
    expect(native()).toMatch(/hero: \{ zIndex: 10/);
  });

  it("each reel bobs for the web's duration after the web's delay", () => {
    const pairs = [...webFn("MockReel").matchAll(/<Float dur="([\d.]+)s" delay="([\d.]+)s">/g)].map(
      (m) => [Number(m[1]) * 1000, Number(m[2]) * 1000] as const,
    );
    expect(pairs.length, "the web's reels no longer float").toBe(3);
    for (const [dur, delay] of pairs) {
      expect(native(), `no Float at ${dur}ms after ${delay}ms`).toMatch(
        new RegExp(`dur=\\{${dur}\\} delay=\\{${delay}\\}`),
      );
    }
  });

  it("and reveals in the web's order", () => {
    const orders = [...webFn("MockReel").matchAll(/reelReveal\(active, (\d)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(orders, "the web's reel reveal order has changed").toEqual([3, 4, 2]);
    expect([...native().matchAll(/order=\{(\d)\}/g)].map((m) => Number(m[1]))).toEqual(orders);
  });

  it("the card's inner proportions are the web's fractions of its width", () => {
    // The web sizes the play disc and its glyph off `w`, which is what lets
    // one set of numbers serve all three cards. Hard-coding either would
    // make the two small reels wrong and only the hero right.
    const card = webFn("ReelCard");
    expect(card).toContain("width: w * 0.26");
    expect(card).toContain("size={w * 0.13}");
    expect(native()).toMatch(/PLAY_DISC = 0\.26/);
    expect(native()).toMatch(/PLAY_GLYPH = 0\.13/);
    expect(native()).toMatch(/w \* PLAY_DISC/);
    expect(native()).toMatch(/w \* PLAY_GLYPH/);
  });

  it("the hype rail switches icon sizes at the web's own threshold", () => {
    const card = webFn("ReelCard");
    const threshold = card.match(/const big = w > (\d+)/);
    expect(threshold, "the web no longer has a `big` threshold").toBeTruthy();
    expect(native()).toMatch(new RegExp(`BIG_ABOVE = ${threshold?.[1]}\\b`));

    // Three glyphs, each with a big size and a small one, paired.
    const sizes = [...card.matchAll(/size=\{big \? (\d+) : (\d+)\}/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    expect(sizes.length, "the web's rail no longer sizes three glyphs").toBe(3);
    for (const [b, s] of sizes) {
      expect(native(), `no glyph at ${b}/${s}`).toMatch(
        new RegExp(`size=\\{big \\? ${b} : ${s}\\}`),
      );
    }
  });

  it("the card's own measurements are the web's", () => {
    const SIZES: ReadonlyArray<readonly [string, RegExp, string]> = [
      ["rounded-[26px]", /borderRadius: 26/, "the card's radius"],
      ["bottom-12", /bottom: 48/, "how high the hype rail sits"],
      ["right-2.5", /right: 10/, "how far in it sits"],
      ["h-7", /width: 28/, "the author's avatar"],
      ["rounded-[9px]", /borderRadius: 9/, "its radius"],
      ["ring-2", /borderWidth: 2/, "its ring"],
      ["pr-11", /paddingRight: 44/, "the room the footer leaves the rail"],
      ["text-[11px]", /fontSize: 11/, "the caption"],
    ];
    for (const [cls, re, what] of SIZES) {
      expect(webFn("ReelCard"), `the web no longer uses ${cls}`).toContain(cls);
      expect(native(), `${what} does not match`).toMatch(re);
    }
  });

  it("the white-on-photograph opacities are the web's", () => {
    const card = webFn("ReelCard");
    expect(card).toContain("ring-white/60");
    expect(native()).toContain("rgba(255, 255, 255, 0.6)");
    expect(card).toContain("text-white/85");
    expect(native()).toContain("rgba(255, 255, 255, 0.85)");
    expect(card).toContain("bg-black/35");
    expect(native()).toContain("rgba(0, 0, 0, 0.35)");
  });

  it("the darkening over the photograph is the web's three stops, flipped", () => {
    /*
     * `bg-gradient-to-t from-black/75 via-transparent to-black/10` reads
     * UPWARD: 75% black at the bottom, clear in the middle, 10% at the
     * top. This one reads downward, so the stops are reversed. Copied
     * un-flipped it darkens the caption's sky and lightens the caption,
     * which is the one thing the gradient exists to prevent.
     */
    const card = webFn("ReelCard");
    const m = card.match(/bg-gradient-to-t from-black\/(\d+) via-transparent to-black\/(\d+)/);
    expect(m, "the web's reel gradient no longer parses").toBeTruthy();
    const bottom = Number(m?.[1]) / 100;
    const top = Number(m?.[2]) / 100;
    /*
     * The stop is matched up to its terminating `,` or `}`, not with a
     * word boundary. `opacity: 0\b` matched the 0 in `opacity: 0.3`,
     * because a full stop is not a word character — so the mutation that
     * darkened the middle of the gradient passed. R17 found it.
     */
    const stop = (offset: string, opacity: number) =>
      new RegExp(
        `offset: ${offset.replace(".", "\\.")}, color: "#000000", opacity: ${String(
          opacity,
        ).replace(".", "\\.")}\\s*[,}]`,
      );
    const src = native();
    expect(src).toMatch(stop("0", top));
    expect(src).toMatch(stop("1", bottom));
    expect(src, "the middle is no longer clear").toMatch(stop("0.5", 0));
  });

  it("the three users are the web's three, with the web's captions and counts", () => {
    const web = code(WEB);
    const block = web.slice(web.indexOf("const HERO_REEL"), web.indexOf("function reelReveal"));
    /*
     * The fields are matched across newlines: HERO_REEL is written one
     * field per line on both sides while BG_REELS' entries are each on one
     * line, and a single-line regex silently found only the two.
     */
    const ROW = /handle: "(\w+)",[\s\S]*?caption: "([^"]+)",[\s\S]*?hypes: "([^"]+)"/g;
    const rows = [...block.matchAll(ROW)].map((m) => [m[1], m[2], m[3]] as const);
    expect(rows.length, "the web's reel data no longer parses").toBe(3);

    const src = native();
    const nativeBlock = src.slice(src.indexOf("const HERO_REEL"), src.indexOf("export function"));
    const nativeRows = [...nativeBlock.matchAll(ROW)].map((m) => [m[1], m[2], m[3]] as const);
    expect(nativeRows).toEqual(rows);
  });

  it("every reel has a photograph AND an author's face, as on the web", () => {
    // The web's ReelData makes pfp optional and falls back to a gradient
    // avatar; all three supply one, so this app needs no fallback. If the
    // web ever drops one, the phone would render nothing there — hence the
    // assertion rather than a silent assumption.
    const web = code(WEB);
    const block = web.slice(web.indexOf("const HERO_REEL"), web.indexOf("function reelReveal"));
    expect([...block.matchAll(/img:/g)].length).toBe(3);
    expect([...block.matchAll(/pfp:/g)].length).toBe(3);
  });

  it("uses the website's own image files rather than copies of them", () => {
    const src = native();
    const imports = [...src.matchAll(/from "([^"]*public\/onboarding\/[^"]+)"/g)].map((m) => m[1]);
    expect(imports.length, "no shared onboarding images are imported").toBe(6);
    for (const spec of imports) {
      const file = spec.replace(/^(\.\.\/)+/, "");
      expect(existsSync(file), `${file} is missing from the web's public folder`).toBe(true);
    }
    expect(src, "an image was copied into the app instead of shared").not.toMatch(
      /assets\/onboarding/,
    );
  });

  it("and every image it names is one the web's reels name", () => {
    const web = code(WEB);
    const block = web.slice(web.indexOf("const HERO_REEL"), web.indexOf("function reelReveal"));
    for (const m of native().matchAll(/public\/onboarding\/([\w.-]+)"/g)) {
      expect(block, `${m[1]} is not used by the web's reels`).toContain(m[1]);
    }
  });
});

describe("the discover slide's constellation matches the website's", () => {
  function webFn(name: string): string {
    const src = code(WEB);
    const start = src.indexOf(`function ${name}(`);
    expect(start, `the web no longer has a ${name}`).toBeGreaterThan(-1);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    return end === -1 ? rest : rest.slice(0, end);
  }

  const native = () => code("apps/mobile/src/onboarding/MockDiscover.tsx");

  /** The web's DISCOVER_BUBBLES, parsed. */
  const webBubbles = (() => {
    const src = code(WEB);
    const block = src.slice(src.indexOf("const DISCOVER_BUBBLES"), src.indexOf("function MockDiscover"));
    return [
      ...block.matchAll(
        /deg: (-?\d+), size: (\d+), r: (\d+), dur: "([\d.]+)s", delay: "([\d.]+)s", img: "\/onboarding\/([\w.-]+)"/g,
      ),
    ].map((m) => ({
      deg: Number(m[1]),
      size: Number(m[2]),
      r: Number(m[3]),
      dur: Math.round(Number(m[4]) * 1000),
      delay: Math.round(Number(m[5]) * 1000),
      img: m[6],
    }));
  })();

  /** The native BUBBLES, parsed the same way. */
  const nativeBubbles = (() => {
    const src = native();
    const block = src.slice(src.indexOf("const BUBBLES"), src.indexOf("export function"));
    return [
      ...block.matchAll(
        /deg: (-?\d+), size: (\d+), r: (\d+), dur: (\d+), delay: (\d+), img: (\w+)/g,
      ),
    ].map((m) => ({
      deg: Number(m[1]),
      size: Number(m[2]),
      r: Number(m[3]),
      dur: Number(m[4]),
      delay: Number(m[5]),
      binding: m[6],
    }));
  })();

  it("there are ten faces on the ring, as there are on the web", () => {
    expect(webBubbles.length, "the web's DISCOVER_BUBBLES no longer parse").toBe(10);
    expect(nativeBubbles.length).toBe(10);
  });

  it("each one has the web's angle, size, orbit, duration and delay", () => {
    /*
     * Compared row by row rather than as five sets of numbers: a size
     * copied onto the wrong angle leaves every figure present in the file
     * and the constellation visibly lopsided. Ten rows, five fields, and
     * the order is the web's.
     */
    expect(
      nativeBubbles.map((b) => [b.deg, b.size, b.r, b.dur, b.delay]),
    ).toEqual(webBubbles.map((b) => [b.deg, b.size, b.r, b.dur, b.delay]));
  });

  it("and the web's photograph, in the web's order", () => {
    /*
     * The native side imports each file under a name, so the row holds a
     * binding rather than a path. The binding is resolved through the
     * import list, which is what makes a swapped pair of faces visible.
     */
    const src = native();
    const imports = new Map(
      [...src.matchAll(/import (\w+) from "[^"]*public\/onboarding\/([\w.-]+)"/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    expect(nativeBubbles.map((b) => imports.get(b.binding))).toEqual(webBubbles.map((b) => b.img));
  });

  it("every face has a photograph, so none falls back to nothing", () => {
    // The web's Bubble type allows a gradient-avatar fallback. All ten
    // supply a picture, so this app has no fallback — and if the web ever
    // drops one, a face here would render blank rather than degrade.
    const src = code(WEB);
    const block = src.slice(src.indexOf("const DISCOVER_BUBBLES"), src.indexOf("function MockDiscover"));
    expect([...block.matchAll(/img: "/g)].length).toBe(10);
    expect([...block.matchAll(/name: "/g)].length).toBe(0);
  });

  it("the disc, the hub and the ring are the web's measurements", () => {
    const SIZES: ReadonlyArray<readonly [string, RegExp, string]> = [
      ["h-[300px]", /BOX = 300/, "the disc's box"],
      ["inset-3", /left: 12,/, "the ring's inset"],
      ["h-[68px]", /HUB = 68/, "the hub"],
      ["rounded-[22px]", /borderRadius: 22/, "the hub's radius"],
      ["text-3xl", /fontSize: 30/, "the hub's wordmark"],
      ["translate-x-\\[3px\\]".replace("\\[", "[").replace("\\]", "]"), /translateX: 3/, "its optical nudge"],
      ["rounded-[28%]", /size \* 0\.28/, "a face's radius"],
      ["ring-2", /borderWidth: 2/, "a face's ring"],
      ["z-10", /zIndex: 10/, "the hub above the ring"],
    ];
    for (const [cls, re, what] of SIZES) {
      expect(webFn("MockDiscover"), `the web no longer uses ${cls}`).toContain(cls);
      expect(native(), `${what} does not match`).toMatch(re);
    }
  });

  it("the hub's own colours are the web's, not tokens that look close", () => {
    // #262626 and white/15 are literals on the web, chosen so the hub stays
    // distinct from the disc behind it. `elevated` is #1e1e1e and would
    // very nearly disappear into it.
    expect(webFn("MockDiscover")).toContain("#262626");
    expect(native()).toContain('"#262626"');
    expect(webFn("MockDiscover")).toContain("ring-white/15");
    expect(native()).toContain("rgba(255, 255, 255, 0.15)");
  });

  it("the disc's radial gradient is the web's centre and its three stops", () => {
    const m = webFn("MockDiscover").match(
      /radial-gradient\(circle at (\d+)% (\d+)%, (#[0-9a-f]{6}) 0%, (#[0-9a-f]{6}) (\d+)%, (#[0-9a-f]{6}) 100%\)/,
    );
    expect(m, "the web's disc gradient no longer parses").toBeTruthy();
    const src = native();
    expect(src).toMatch(new RegExp(`cx=\\{${Number(m?.[1]) / 100}\\}`));
    expect(src).toMatch(new RegExp(`cy=\\{0\\.${m?.[2]}\\}`));
    expect(src).toContain(`offset: 0, color: "${m?.[3]}"`);
    expect(src).toContain(`offset: ${Number(m?.[5]) / 100}, color: "${m?.[4]}"`);
    expect(src).toContain(`offset: 1, color: "${m?.[6]}"`);
  });

  it("the ring turns for the web's 48 seconds, and the faces turn back as fast", () => {
    const css = read("src/app/globals.css");
    const fwd = css.match(/animation: orbit (\d+)s linear infinite/);
    const back = css.match(/animation: orbit-reverse (\d+)s linear infinite/);
    expect(fwd, "the web no longer states orbit's duration").toBeTruthy();
    expect(back?.[1], "the web's two orbits no longer agree").toBe(fwd?.[1]);
    expect(native()).toMatch(new RegExp(`ORBIT_MS = ${fwd?.[1]}_000\\b`));
    // One duration for both directions, so they cannot drift and leave the
    // faces slowly tumbling.
    expect([...native().matchAll(/duration=\{ORBIT_MS\}/g)].length).toBe(2);
    expect(native()).toMatch(/<Orbit reverse duration=\{ORBIT_MS\}>/);
  });

  it("and a full turn each way, as the web's keyframes do", () => {
    const css = read("src/app/globals.css");
    expect(css.slice(css.indexOf("@keyframes orbit {"), css.indexOf(".animate-orbit"))).toContain(
      "rotate(-360deg)",
    );
    const motion = code("apps/mobile/src/onboarding/motion.tsx");
    expect(motion).toContain('reverse ? "-360deg" : "360deg"');
  });

  it("uses the website's own image files rather than copies of them", () => {
    const src = native();
    const imports = [...src.matchAll(/from "([^"]*public\/onboarding\/[^"]+)"/g)].map((m) => m[1]);
    expect(imports.length, "the ten faces are not all imported").toBe(10);
    for (const spec of imports) {
      const file = spec.replace(/^(\.\.\/)+/, "");
      expect(existsSync(file), `${file} is missing from the web's public folder`).toBe(true);
    }
    expect(src, "an image was copied into the app instead of shared").not.toMatch(
      /assets\/onboarding/,
    );
  });
});

describe("the identity slide's profile card matches the website's", () => {
  function webFn(name: string): string {
    const src = code(WEB);
    const start = src.indexOf(`function ${name}(`);
    expect(start, `the web no longer has a ${name}`).toBeGreaterThan(-1);
    const rest = src.slice(start + 1);
    const end = rest.indexOf("\nfunction ");
    return end === -1 ? rest : rest.slice(0, end);
  }

  const native = () => code("apps/mobile/src/onboarding/MockProfile.tsx");

  /**
   * One entry of the native stylesheet, sliced by name, braces counted.
   *
   * Per-element, because the card has two 36-high boxes and several bold
   * runs: an assertion that a number or a weight appeared SOMEWHERE in the
   * file passed while the one element being mutated was wrong. P21 and P23
   * found that.
   */
  function nativeStyle(key: string): string {
    const src = native();
    const start = src.indexOf(`  ${key}: {`);
    expect(start, `${key} is not a style in MockProfile`).toBeGreaterThan(-1);
    let depth = 0;
    for (let i = src.indexOf("{", start); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`${key}'s style never closes`);
  }

  it("the copy is the website's copy, word for word", () => {
    /*
     * Name, handle and bio. A profile that says something slightly
     * different from the site is the most visible kind of drift there is,
     * because it is the only part a reader can quote.
     *
     * Compared as whole text nodes, not with `toContain`: "@maya" is a
     * prefix of "@mayarivera", so a plain containment check passed while
     * the handle had grown (P15). The nodes are taken by removing the tags
     * and trimming what is left, which also handles the web writing its
     * bio on its own line inside the paragraph.
     */
    const nodes = (src: string) =>
      src
        .replace(/<[^>]*>/g, "\u0000")
        .split("\u0000")
        .map((t) => t.trim())
        .filter(Boolean);

    const web = nodes(webFn("MockProfile"));
    const phone = nodes(native());
    for (const line of ["Maya Rivera", "@maya", "creator mode · late night energy ✦"]) {
      expect(web, `the web no longer says exactly "${line}"`).toContain(line);
      expect(phone, `the phone no longer says exactly "${line}"`).toContain(line);
    }
  });

  it("the three tags are the web's three, in the web's order", () => {
    const m = webFn("MockProfile").match(/const tags = \[([^\]]+)\]/);
    expect(m, "the web no longer declares its tags").toBeTruthy();
    const tags = [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(tags.length).toBe(3);
    const nativeTags = [
      ...(native().match(/const TAGS = \[([^\]]+)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
    ].map((x) => x[1]);
    expect(nativeTags).toEqual(tags);
  });

  it("the three stats are the web's figures against the web's labels", () => {
    /*
     * Figure and label as pairs, in order. "843 Posts" would otherwise
     * pass a check that only asked whether 843 and Posts both appeared.
     */
    const pairs = [...webFn("MockProfile").matchAll(/<ProfileStat n="([^"]+)" l="([^"]+)" \/>/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    expect(pairs.length, "the web's stats no longer parse").toBe(3);
    const nativePairs = [...native().matchAll(/\{ n: "([^"]+)", l: "([^"]+)" \}/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    expect(nativePairs).toEqual(pairs);
  });

  it("the four recent posts are the web's four, in the web's order", () => {
    const src = code(WEB);
    const block = webFn("MockProfile");
    const webThumbs = [
      ...(block.match(/const thumbs = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(
        /"\/onboarding\/([\w.-]+)"/g,
      ),
    ].map((m) => m[1]);
    expect(webThumbs.length, "the web's thumbs no longer parse").toBe(4);
    expect(src.length).toBeGreaterThan(0);

    const imports = new Map(
      [...native().matchAll(/import (\w+) from "[^"]*public\/onboarding\/([\w.-]+)"/g)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    const nativeThumbs = [...(native().match(/const THUMBS = \[([^\]]+)\]/)?.[1] ?? "").matchAll(
      /(\w+)/g,
    )].map((m) => imports.get(m[1]));
    expect(nativeThumbs).toEqual(webThumbs);
  });

  it("the measurements are the website's", () => {
    const SIZES: ReadonlyArray<readonly [string, RegExp, string]> = [
      ["w-[300px]", /CARD_W = 300/, "the card's width"],
      ["rounded-[26px]", /borderRadius: 26/, "the card's radius"],
      ["h-16", /height: 64, width: "100%"/, "the banner"],
      ["-mt-9", /marginTop: -36/, "how far the avatar overlaps it"],
      ["h-[68px]", /AVATAR = 68/, "the avatar"],
      ["rounded-\\[22px\\]".replace("\\[", "[").replace("\\]", "]"), /borderRadius: 22/, "its radius"],
      ["ring-4", /borderWidth: 4/, "its ring"],
      ["text-[17px]", /fontSize: 17/, "the name"],
      ["rounded-lg", /borderRadius: 8/, "a tag and a thumbnail"],
    ];
    for (const [cls, re, what] of SIZES) {
      expect(webFn("MockProfile"), `the web no longer uses ${cls}`).toContain(cls);
      expect(native(), `${what} does not match`).toMatch(re);
    }
  });

  it("both action buttons are h-9, each checked in its own style", () => {
    /*
     * There are two 36-high boxes — the Edit profile button and the square
     * share button beside it — so `/height: 36/` anywhere in the file was
     * satisfied by whichever one was still right. P21 moved the primary
     * button to 40 and passed.
     */
    expect(webFn("MockProfile")).toContain("h-9");
    expect(nativeStyle("primary")).toMatch(/height: 36\b/);
    expect(nativeStyle("secondary")).toMatch(/height: 36\b/);
    expect(nativeStyle("secondary"), "the square button is no longer square").toMatch(/width: 36\b/);
  });

  it("the avatar's ring is the card's own colour, so it cuts the banner cleanly", () => {
    // ring-surface, not white and not the border — the ring exists to make
    // the avatar look punched out of the card.
    expect(webFn("MockProfile")).toContain("ring-surface");
    expect(native()).toMatch(/borderColor: palette\.surface/);
  });

  it("the banner's gradient is the web's two colours at the web's opacities", () => {
    const m = webFn("MockProfile").match(
      /linear-gradient\((\d+)deg, rgba\(163,230,53,([\d.]+)\), rgba\(109,40,217,([\d.]+)\) (\d+)%\), (#[0-9a-f]{6})/,
    );
    expect(m, "the web's banner gradient no longer parses").toBeTruthy();
    const src = native();
    // The accent and the violet, as hex with the web's alphas.
    expect(src).toContain(`color: "#a3e635", opacity: ${Number(m?.[2])}`);
    expect(src).toContain(`color: "#6d28d9", opacity: ${Number(m?.[3])}`);
    expect(src).toMatch(new RegExp(`offset: ${Number(m?.[4]) / 100}, color: "#6d28d9"`));
    // And the near-black ground it sits over.
    expect(src).toContain(`backgroundColor: "${m?.[5]}"`);
  });

  it("the accent in that gradient is the palette's accent, spelled out", () => {
    // SVG stops take a colour and an opacity separately, so the accent
    // appears as a literal here where the rest of the app uses the token.
    // This is the assertion that keeps the literal honest.
    const tokens = read("packages/tokens/src/index.ts");
    expect(tokens).toContain('accent: "#a3e635"');
    expect(native()).toContain('color: "#a3e635"');
  });

  it("the bio and the name are different weights, as on the web", () => {
    /*
     * The weight is asserted inside the `name` entry, not with a lazy
     * `name: \{[\s\S]*?family\.bold` over the whole file — that matched
     * forward past a semibold name to the next bold run in the stylesheet,
     * so P23 downgraded the name and passed.
     */
    const web = webFn("MockProfile");
    expect(web).toContain("text-[17px] font-bold");
    expect(web).toContain("text-foreground/90");
    expect(nativeStyle("name")).toContain("family.bold");
    expect(nativeStyle("bio")).toContain("family.normal");
    expect(nativeStyle("bio")).toContain('"rgba(255, 255, 255, 0.9)"');
  });

  it("uses the website's own image files rather than copies of them", () => {
    const src = native();
    const imports = [...src.matchAll(/from "([^"]*public\/onboarding\/[^"]+)"/g)].map((m) => m[1]);
    expect(imports.length, "the avatar and four thumbnails are not all imported").toBe(5);
    for (const spec of imports) {
      const file = spec.replace(/^(\.\.\/)+/, "");
      expect(existsSync(file), `${file} is missing from the web's public folder`).toBe(true);
    }
    expect(src, "an image was copied into the app instead of shared").not.toMatch(
      /assets\/onboarding/,
    );
  });
});

describe("the gradient avatar is the website's gradient", () => {
  it("uses the web Avatar's own saturation and lightness", () => {
    // Three stops since the web stopped draining the lightness and started
    // carrying the hue instead. A two-stop copy of it reads as a different
    // colour by the bottom corner, which is why the middle one is asserted
    // too rather than left to the renderer to guess.
    const web = read("src/components/ui/Avatar.tsx");
    const m = web.match(
      /linear-gradient\(\d+deg, hsl\(\$\{hue\} (\d+)% (\d+)%\) 0%, hsl\(\$\{hue\} (\d+)% (\d+)%\) (\d+)%, hsl\(\$\{\(hue \+ (\d+)\) % 360\} (\d+)% (\d+)%\) 100%\)/,
    );
    expect(m, "the web's Avatar gradient no longer parses").toBeTruthy();
    expect(STOP_FROM).toEqual({ s: Number(m?.[1]), l: Number(m?.[2]) });
    expect(STOP_MID).toEqual({
      s: Number(m?.[3]),
      l: Number(m?.[4]),
      at: Number(m?.[5]) / 100,
    });
    expect(STOP_TO).toEqual({
      s: Number(m?.[7]),
      l: Number(m?.[8]),
      hueShift: Number(m?.[6]),
    });
  });

  it("converts hsl to hex at every sector boundary", () => {
    expect(hslToHex(0, 100, 50)).toBe("#ff0000");
    expect(hslToHex(60, 100, 50)).toBe("#ffff00");
    expect(hslToHex(120, 100, 50)).toBe("#00ff00");
    expect(hslToHex(180, 100, 50)).toBe("#00ffff");
    expect(hslToHex(240, 100, 50)).toBe("#0000ff");
    expect(hslToHex(300, 100, 50)).toBe("#ff00ff");
  });

  it("and inside every one of the six sectors", () => {
    /*
     * The boundaries above are not enough on their own: at a boundary one
     * of the two channels being interpolated is 0 or 1, so a mutation that
     * swaps the pair inside a sector still lands on the right colour.
     * Mutation M20 survived the boundary tests and is caught by these.
     */
    expect(hslToHex(30, 100, 50)).toBe("#ff8000");
    expect(hslToHex(90, 100, 50)).toBe("#80ff00");
    expect(hslToHex(150, 100, 50)).toBe("#00ff80");
    expect(hslToHex(210, 100, 50)).toBe("#0080ff");
    expect(hslToHex(270, 100, 50)).toBe("#8000ff");
    expect(hslToHex(330, 100, 50)).toBe("#ff0080");
  });

  it("handles no saturation at any lightness", () => {
    expect(hslToHex(0, 0, 100)).toBe("#ffffff");
    expect(hslToHex(0, 0, 0)).toBe("#000000");
    expect(hslToHex(0, 0, 50)).toBe("#808080");
  });

  it("wraps a hue past 360 rather than running off the sector table", () => {
    /*
     * nia is hue 330, so her second stop is 380. `avatarStops` takes that
     * modulo 360 itself, which is why the wrap inside `hslToHex` is belt
     * and braces — and why asserting it through `avatarStops` proved
     * nothing (mutation M19 survived that). It is asserted directly.
     */
    expect(hslToHex(380, 100, 50)).toBe(hslToHex(20, 100, 50));
    expect(hslToHex(-40, 100, 50)).toBe(hslToHex(320, 100, 50));
  });

  it("and nia's last stop is the wrapped hue, not the raw one", () => {
    // 330 + 36 is 366, which is 6. The middle stop stays on her own hue.
    expect(avatarStops(330)[2]).toBe(hslToHex(6, STOP_TO.s, STOP_TO.l));
    expect(avatarStops(330)[1]).toBe(hslToHex(330, STOP_MID.s, STOP_MID.l));
  });

  it("and the two users without a photograph get different gradients", () => {
    // leo is 30 and nia is 330. Identical stops would mean the hue in
    // BG_POSTS is being ignored.
    expect(avatarStops(30)).not.toEqual(avatarStops(330));
  });
});

describe("every slide now has its visual", () => {
  it("all five are rendered, and nothing is left empty", () => {
    /*
     * This replaces the assertion that counted what was still missing.
     * It now says the opposite thing: every one of the web's five slides
     * draws its own mock-up, and the slot is never empty — so a visual
     * being dropped or a slide being added without one fails here.
     */
    const carousel = code(NATIVE);
    const PER_SLIDE: ReadonlyArray<readonly [SlideId, string]> = [
      ["welcome", "WelcomeVisual"],
      ["posts", "MockPostStack"],
      ["shots", "MockReel"],
      ["discover", "MockDiscover"],
      ["identity", "MockProfile"],
    ];
    expect(PER_SLIDE.map(([s]) => s), "the web's slides have changed").toEqual([...SLIDES]);
    for (const [, component] of PER_SLIDE) {
      expect(
        existsSync(`apps/mobile/src/onboarding/${component}.tsx`),
        `${component}.tsx is missing`,
      ).toBe(true);
    }

    /*
     * The PAIRING is what is asserted, not merely that each component
     * appears somewhere. The first version checked presence only, so a
     * mutation that handed the discover slide the profile card and the
     * identity slide the constellation passed — both were still rendered,
     * just on each other's slide. C4 found it.
     */
    const slot = carousel.slice(
      carousel.indexOf("styles.visualSlot"),
      carousel.indexOf("styles.copySlot"),
    );
    const branches = [...slot.matchAll(/slide === "(\w+)" \? \(\s*<(\w+)/g)].map(
      (m) => [m[1], m[2]] as const,
    );
    const fallback = slot.match(/\) : \(\s*<(\w+)/);
    expect(fallback, "the slot no longer ends in a visual for the last slide").toBeTruthy();
    expect([...branches, [PER_SLIDE.at(-1)?.[0], fallback?.[1]]]).toEqual(
      PER_SLIDE.map(([s, c]) => [s, c]),
    );

    // And no `null` branch is left, so no slide can show nothing.
    expect(slot, "a slide still renders nothing").not.toContain("null");
  });

  it("and the three that animate on arrival are told when they arrive", () => {
    // The post wall, the reels and their stars reveal on a timeline that
    // only starts when the slide is the one on screen; the discover ring
    // and the profile card do not animate in, as on the web.
    const carousel = code(NATIVE);
    for (const c of ["MockPostStack", "MockReel"]) {
      expect(carousel, `${c} is not given active`).toMatch(
        new RegExp(`<${c} active=\\{active\\} />`),
      );
    }
    const web = code(WEB);
    expect(web).toMatch(/<MockDiscover \/>/);
    expect(web).toMatch(/<MockProfile \/>/);
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
