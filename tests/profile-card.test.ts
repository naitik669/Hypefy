import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CARD_THEMES,
  DEFAULT_THEME,
  cardBackground,
  cardSwatch,
  cardTheme,
  hypefyId,
  memberSince,
  prettyUrl,
  profileUrl,
  safeHref,
} from "@/lib/profile-card";
import { badgeSpan, isFinderModule, isUnderBadge } from "@/lib/hypefy-qr";
import { idCardLayout } from "@/lib/card-image";
import { MARK_BOX, MARK_DOT, MARK_LETTER } from "@/lib/hypefy-mark";

const read = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
const card = read("src/components/profile/ProfileCard.tsx");
const front = read("src/components/profile/ProfileCardFaces.tsx");
const back = read("src/components/profile/HypefyIdFace.tsx");
const flip = read("src/components/profile/CardFlip.tsx");
const editor = read("src/components/profile/ProfileCardEditor.tsx");

/**
 * The profile card: one object, two faces.
 */

describe("one card, not seven", () => {
  it("there is a single front, and no layout left to choose", () => {
    // Seven layouts meant seven half-finished cards, and the card you met
    // on someone else's profile was a different object each time.
    expect(front).toContain("export function CardFront");
    expect(front).not.toContain("CardFaceFor");
    expect(card).not.toContain("card_layout");
    expect(editor).not.toContain("CARD_LAYOUTS");
    expect(read("src/lib/profile-card.ts")).not.toContain("CardLayout");
  });

  it("the front is the framed one — a photo in a frame, card showing round it", () => {
    expect(front).toContain('className={`block ${shape}`}');
    expect(front).toContain('aspect-[1/1.05] w-full overflow-hidden rounded-[20px]');
  });
});

describe("everything the card does is on the card", () => {
  it("no row of buttons under it", () => {
    expect(card).not.toContain("Customise card");
    expect(card).not.toContain("QR code");
    expect(card).not.toContain("View photo");
    expect(card).not.toContain("function Action");
  });

  it("share is a button over the photo", () => {
    expect(front).toContain("onClick={onShare}");
    expect(front).toContain("absolute right-2.5 top-2.5");
    expect(front).toContain("<ShareIcon");
  });

  it("the photo still opens itself, so nothing was lost with the button", () => {
    expect(front).toContain('aria-label="View photo"');
    expect(card).toContain("setPhotoOpen(true)");
  });

  it("both faces carry the strip that turns the card over", () => {
    expect(front).toContain('<FlipStrip side="front"');
    expect(back).toContain('<FlipStrip side="back"');
  });

  it("customising still has a way in, from Edit profile rather than from here", () => {
    // ?edit=1 on the card route; the editor pane is otherwise unreachable.
    expect(card).toContain('startEditing && data.isOwn');
    expect(card).toContain("<ProfileCardEditor");
  });
});

describe("the flip", () => {
  it("turns on its vertical axis, in perspective, with both faces mounted", () => {
    expect(flip).toContain("perspective: 1900");
    expect(flip).toContain('transformStyle: "preserve-3d"');
    expect(flip).toContain("rotateY(180deg)");
    expect(flip).toContain('backfaceVisibility: "hidden"');
  });

  it("the card's height travels with the turn", () => {
    // A shorter back used to snap into place after the rotation finished.
    expect(flip).toContain("ResizeObserver");
    expect(flip).toContain("transition-[height]");
  });

  it("the face pointing away cannot be tapped or read", () => {
    // backface-visibility hides it; it does not stop a finger landing on a
    // link that is facing the other way.
    expect(flip).toContain("inert={hidden}");
  });

  it("the lift is restarted by hand, because CSS plays the same animation once", () => {
    expect(flip).toContain('el.style.animation = "none"');
    expect(flip).toContain("void el.offsetWidth");
    expect(read("src/app/globals.css")).toContain("@keyframes card-lift");
  });

  it("and it does not fire on mount, when there has been no turn", () => {
    expect(flip).toContain("if (!mounted.current)");
  });

  it("someone who has asked for less motion gets a cross-fade, not a slower flip", () => {
    expect(flip).toContain("(prefers-reduced-motion: reduce)");
    expect(flip).toContain('transform: "none"');
  });
});

describe("the colours", () => {
  it("every theme is the same recipe with two hues swapped in", () => {
    for (const t of CARD_THEMES) {
      const css = cardBackground(t);
      expect(css).toContain(t.bloom.join(","));
      expect(css).toContain(t.counter.join(","));
      // The light sits low, where the card actually shows below the photo.
      expect(css).toContain("at 6% 86%");
    }
  });

  it("the swatch in the picker is that recipe in a square", () => {
    const t = cardTheme("lime");
    expect(cardSwatch(t)).toContain(t.bloom.join(","));
  });

  it("a colour chosen before the palette was rebuilt is carried over, not reset", () => {
    expect(cardTheme("lime-pulse").id).toBe("lime");
    expect(cardTheme("purple-night").id).toBe("violet");
    expect(cardTheme("rainbow-glow").id).toBe("bloom");
  });

  it("anything unrecognised falls back rather than throwing", () => {
    expect(cardTheme(null).id).toBe(DEFAULT_THEME);
    expect(cardTheme("a-colour-from-the-future").id).toBe(DEFAULT_THEME);
  });
});

describe("the QR", () => {
  it("knows the three corners that carry a finder, and the fourth that does not", () => {
    const n = 33;
    expect(isFinderModule(0, 0, n)).toBe(true);
    expect(isFinderModule(n - 1, 0, n)).toBe(true);
    expect(isFinderModule(0, n - 1, n)).toBe(true);
    expect(isFinderModule(n - 1, n - 1, n)).toBe(false);
    expect(isFinderModule(10, 10, n)).toBe(false);
  });

  it("the badge is centred, whatever size the code comes out", () => {
    for (const n of [21, 25, 29, 33, 41, 57, 77]) {
      const { from, to } = badgeSpan(n);
      // Equal clearance either side, or the badge sits visibly off-centre
      // in a grid it was punched out of.
      expect(from).toBe(n - 1 - to);
    }
  });

  it("the badge stays well inside what error correction level H can lose", () => {
    // H recovers about 30%. Anything near that and a scuffed screen or a
    // bad angle is the difference between scanning and not.
    for (const n of [21, 33, 57]) {
      const { from, to } = badgeSpan(n);
      const covered = ((to - from + 1) ** 2 / n ** 2) * 100;
      expect(covered).toBeLessThan(12);
    }
  });

  it("only the middle is cleared", () => {
    const n = 33;
    expect(isUnderBadge(16, 16, n)).toBe(true);
    expect(isUnderBadge(0, 0, n)).toBe(false);
    expect(isUnderBadge(n - 1, n - 1, n)).toBe(false);
  });

  it("the dark modules are dark — the lime is spent on the badge and the frame", () => {
    // Bright lime modules on black is an inverted code at about 2:1 and a
    // good share of scanners decline it. See the note in hypefy-qr.ts.
    const src = read("src/lib/hypefy-qr.ts");
    expect(src).toContain('errorCorrectionLevel: "H"');
    expect(src).toContain('from: "#4d7c0f"');
    expect(src).toContain('field: "#ffffff"');
    expect(src).not.toContain('from: "#a3e635"');
  });
});

describe("the ID itself", () => {
  it("is the account's own id, in fours, so it can be read aloud", () => {
    expect(hypefyId("3f7a5612-9c04-4b1d-8e22-77ab1290cdef")).toBe("3F7A 5612 9C04");
  });

  it("says the month and the year, never the day", () => {
    expect(memberSince("2026-03-04T10:22:00Z")).toBe("March 2026");
    expect(memberSince(null)).toBeNull();
    expect(memberSince("not a date")).toBeNull();
  });

  it("carries nothing that stops meaning something once it leaves the app", () => {
    // It is the face that gets saved to someone's photos.
    expect(back).not.toContain("FollowButton");
    expect(back).not.toContain("Links");
  });
});

describe("the saved image and the face on screen", () => {
  it("are drawn from the same theme, mark and code", () => {
    const img = read("src/lib/card-image.ts");
    expect(img).toContain('from "@/lib/profile-card"');
    expect(img).toContain("paintHypefyQr");
    expect(img).toContain("MARK_LETTER");
    expect(img).toContain("CARD_INK");
  });

  it("the layout is worked out before anything is painted, because a canvas is sized first", () => {
    const three = idCardLayout(3);
    const two = idCardLayout(2);
    expect(three.width).toBe(380);
    expect(three.height).toBeGreaterThan(two.height);
    // Everything in order down the card.
    expect(three.header).toBeLessThan(three.qrTop);
    expect(three.qrTop).toBeLessThan(three.caption);
    expect(three.caption).toBeLessThan(three.name);
    expect(three.name).toBeLessThan(three.rulesTop);
    expect(three.rulesTop).toBeLessThan(three.footer);
    expect(three.footer).toBeLessThan(three.height);
  });

  it("goes through the share sheet on a phone, where Save image lives", () => {
    const img = read("src/lib/card-image.ts");
    expect(img).toContain("navigator.canShare");
    expect(img).toContain('a.download = file.name');
  });
});

describe("the mark", () => {
  it("is geometry, so the DOM and the canvas cannot draw two different logos", () => {
    expect(MARK_LETTER).toHaveLength(3);
    for (const r of [...MARK_LETTER, MARK_DOT]) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(MARK_BOX);
      expect(r.y + r.h).toBeLessThanOrEqual(MARK_BOX);
    }
  });

  it("the full stop sits on the letter's baseline, to its right", () => {
    const baseline = Math.max(...MARK_LETTER.map((r) => r.y + r.h));
    expect(MARK_DOT.y + MARK_DOT.h).toBeCloseTo(baseline, 1);
    expect(MARK_DOT.x).toBeGreaterThan(Math.max(...MARK_LETTER.map((r) => r.x + r.w)));
  });
});

describe("addresses", () => {
  it("the QR goes to the app host, which is open without an invite", () => {
    expect(profileUrl("naitik")).toBe("https://app.hypefy.chat/u/naitik");
    expect(profileUrl(null)).toBe("https://app.hypefy.chat");
  });

  it("only http and https ever reach an href", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
    expect(safeHref("nonsense")).toBeNull();
  });

  it("a link is shown without its scheme or its query", () => {
    expect(prettyUrl("https://www.example.com/shop?x=1")).toBe("example.com/shop");
  });
});
