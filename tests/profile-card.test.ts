import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  anthemLine,
  memberNumber,
  memberSince,
  prettyUrl,
  profileUrl,
  safeHref,
} from "@/lib/profile-card";
import { remarkFor, traitsOf, type RemarkSource } from "@/lib/card-remarks";
import { badgeSpan, isFinderModule, isUnderBadge, QR_PALETTE } from "@/lib/hypefy-qr";
import { idCardLayout } from "@/lib/card-image";
import { MARK_BOX, MARK_DOT, MARK_H, MARK_LETTER, MARK_LOCKUP } from "@/lib/hypefy-mark";

const read = (p: string) => readFileSync(p, "utf8").split("\r\n").join("\n");
const card = read("src/components/profile/ProfileCard.tsx");
const plate = read("src/components/profile/CardPlate.tsx");
const front = read("src/components/profile/ProfileCardFaces.tsx");
const back = read("src/components/profile/HypefyIdFace.tsx");
const flip = read("src/components/profile/CardFlip.tsx");
const editor = read("src/components/profile/ProfileCardEditor.tsx");
const lib = read("src/lib/profile-card.ts");

/**
 * The profile card: one machined black plate with two faces.
 */

describe("one card, one plate", () => {
  it("there is a single front, and no layout left to choose", () => {
    expect(front).toContain("export function CardFront");
    expect(front).not.toContain("CardFaceFor");
    expect(card).not.toContain("card_layout");
    expect(editor).not.toContain("CARD_LAYOUTS");
    expect(lib).not.toContain("CardLayout");
  });

  it("no gradient anywhere on it", () => {
    // A coloured bloom over an ink ramp is what every dark-mode card in
    // every app looks like; it read as a default rather than as ours.
    expect(lib).not.toContain("radial-gradient");
    expect(plate).not.toContain("radial-gradient");
    expect(front).not.toContain("radial-gradient");
    expect(back).not.toContain("radial-gradient");
  });

  it("and no texture either — the edges do the work alone", () => {
    // A fine vertical brush read as banding on a bad screen rather than
    // as machining, behind a photograph and small mono type alike.
    expect(plate).not.toContain("repeating-linear-gradient");
    expect(read("src/lib/card-image.ts")).not.toContain("The brush");
  });

  it("the colour picker went with the gradients", () => {
    expect(editor).not.toContain("CARD_THEMES");
    expect(editor).not.toContain("card_theme");
    expect(card).not.toContain("card_theme");
  });

  it("the one piece of colour is the painted edge, and it takes the owner's accent", () => {
    expect(plate).toContain('className="absolute inset-x-0 bottom-0 h-[3px] bg-accent"');
    // The card portals to body, so it re-applies the owner's accent itself.
    expect(card).toContain("accentVars(data.accentId)");
  });

  it("both faces are the same plate", () => {
    expect(front).toContain("<CardPlate>");
    expect(back).toContain("<CardPlate>");
    expect(front).toContain("<PlateFoot side=\"front\"");
    expect(back).toContain("<PlateFoot side=\"back\"");
  });

  it("the photo and the code sit in the same well, on the same corner", () => {
    // A superellipse was tried and bowed its sides outward, which at this
    // size reads as an app icon stuck on the card.
    expect(plate).toContain("export const WELL_RADIUS = 20");
    expect(plate).not.toContain("SQUIRCLE");
    expect(front).toContain("<Well className=");
    expect(back).toContain("<Well className=");
    // The saved image uses the same number, not one that looks close.
    expect(read("src/lib/card-image.ts")).toContain("WELL_RADIUS");
  });
});

describe("everything the card does is on the card", () => {
  it("no row of buttons under it", () => {
    expect(card).not.toContain("Customise card");
    expect(card).not.toContain("QR code");
    expect(card).not.toContain("View photo");
  });

  it("share sits under the Follow button, as a node graph and nothing else", () => {
    expect(front).toContain("<ShareNodesIcon");
    expect(front).toContain('<div className="flex justify-end">');
    // The word beside it said nothing the icon had not already.
    expect(front).not.toContain('{shared ? "Copied" : "Share"}');
    // Not over the photograph: a card exists to be screenshotted, and it
    // ended up in every screenshot of one.
    expect(front).not.toContain("absolute right-2.5 top-2.5");
  });

  it("the photo still opens itself", () => {
    expect(front).toContain('aria-label="View photo"');
    expect(card).toContain("setPhotoOpen(true)");
  });

  it("customising still has a way in, from Edit profile rather than from here", () => {
    expect(card).toContain("startEditing && data.isOwn");
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

  it("follows a finger, and lets go of a vertical drag", () => {
    expect(flip).toContain("onTouchStart");
    expect(flip).toContain('g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"');
    expect(flip).toContain('if (g.axis !== "x") return;');
    expect(flip).toContain("(half + drag) * 180");
  });

  it("a short flick turns it as surely as a long drag", () => {
    expect(flip).toContain("travelled < COMMIT && speed < FLICK");
  });

  it("turns either way, from either side", () => {
    // It was clamped to one direction per face — left from the front,
    // right from the back — so half of every attempt to turn it did
    // nothing, by a rule nobody was told.
    expect(flip).toContain("setDrag(Math.max(-1, Math.min(1, raw)));");
    expect(flip).toContain("onTurn(drag < 0 ? -1 : 1)");
  });

  it("counts half-turns rather than holding a flag", () => {
    // 180 and -180 look the same at rest and are a revolution apart in
    // between, so a boolean would spin a right-turned card all the way
    // back round the moment it settled.
    expect(flip).toContain("half: number");
    expect(flip).toContain("((half % 2) + 2) % 2 === 1");
    expect(card).toContain("setHalf((h) => h + dir)");
  });

  it("the lift is for the button, not the finger", () => {
    // A finger is already holding the card; lifting it on release reads
    // as the card bouncing out of your grip.
    expect(flip).toContain("turnedByFinger.current = true;");
    expect(flip).toContain("if (turnedByFinger.current) {");
  });

  it("the guard against a swipe's own click expires on its own", () => {
    // It used to clear only when the click it suppressed actually
    // arrived. When one never came, the flag ate the next tap on the
    // card — the flip button, share, a link.
    expect(flip).toContain("swipeExpiry");
    expect(flip).toContain("swiped.current = false;");
  });

  it("a card does not change size when you turn it over", () => {
    // Both faces are laid into one grid cell: the row is as tall as the
    // taller and stretches the other to match. Measuring them instead
    // could not work — a face has to be stretched to be the same size and
    // left alone to report what size it needs, and not both at once.
    expect(flip).toContain('className="grid h-full');
    expect(flip).toContain('gridArea: "1 / 1"');
    expect(flip).not.toContain("ResizeObserver");
    expect(flip).not.toContain("offsetHeight");
  });

  it("the photograph takes whatever height the back does not need", () => {
    // The back carries six rows and the front does not, so without this
    // the front had a band of empty plate above its foot.
    expect(front).toContain("flex min-h-0 flex-1 p-2.5");
    expect(front).toContain('const shape = "w-full flex-1 [min-height:170px]"');
  });

  it("the card is capped to the screen, and the big things give up height first", () => {
    // It used to be 746px tall whatever the phone, so a 667px one scrolled
    // a card. The photograph and the code are the two things that can lose
    // a hundred pixels and still do their job.
    expect(card).toContain("flex max-h-full w-full max-w-[380px]");
    expect(flip).toContain("max-h-full min-h-0 w-full");
    expect(plate).toContain("flex h-full min-h-0 flex-col");
    expect(back).toContain("[min-height:150px]");
  });

  it("the code stays square however little room is left", () => {
    // Letting the well stretch and only the code shrink turned the tile
    // into a wide white strip with a stamp in the middle.
    expect(back).toContain('<Well className="aspect-square h-full max-w-full">');
  });

  it("nothing above the foot claims the slack with an auto margin", () => {
    // An auto margin eats all free space before flex-grow is consulted, so
    // the block above the foot was quietly taking every spare pixel the
    // photograph and the code were trying to grow into.
    expect(plate).not.toContain("mt-auto");
    expect(back).not.toContain("mt-auto");
  });

  it("the face pointing away cannot be tapped or read", () => {
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

describe("the member number", () => {
  it("is padded to four, so it reads as a place in a queue", () => {
    expect(memberNumber(1)).toBe("0001");
    expect(memberNumber(2)).toBe("0002");
    expect(memberNumber(1234)).toBe("1234");
    expect(memberNumber(99999)).toBe("99999");
  });

  it("is simply absent before onboarding is finished", () => {
    // A credential with a blank field on it looks broken, not pending.
    expect(memberNumber(null)).toBeNull();
    expect(memberNumber(undefined)).toBeNull();
    expect(memberNumber(0)).toBeNull();
  });

  it("the database assigns it, and nobody awards themselves 0001", () => {
    const m = read("supabase/migrations/0136_member_number.sql");
    expect(m).toContain("profiles_member_no_seq");
    expect(m).toContain("where profile_completed");
    expect(m).toContain("new.member_no   := old.member_no;");
    // The preserve trigger resets it, so the assigning trigger has to sort
    // after it — triggers of one timing fire in alphabetical order.
    expect(m).toContain("profiles_zz_assign_member_no");
    expect(m).toContain("grant select (member_no)");
    expect(m).not.toContain("grant update (member_no)");
  });

  it("the column is granted and listed, or it cannot be read at all", () => {
    expect(read("src/lib/profile.ts")).toContain("member_no");
  });
});

describe("the remark", () => {
  const base: RemarkSource = { userId: "a", tags: [], interests: [], hasAnthem: false, memberNo: null };

  it("the same person always gets the same line", () => {
    const s = { ...base, userId: "f7de5612-3fd9-41cb-9e0a-089c0a704576", hasAnthem: true };
    const once = remarkFor(s);
    expect(remarkFor(s)).toBe(once);
    expect(remarkFor(s)).toBe(once);
  });

  it("the strongest thing about a profile is what gets said", () => {
    // A musician with an anthem is read as a musician, not as a student.
    const s = { ...base, userId: "x", tags: ["Student"], hasAnthem: true };
    expect(remarkFor(s)).toMatch(/^This user (plays it out loud|has a song picked out|holds the aux|keeps the sound on|will send you the track).$/);
  });

  it("reads tags and interests alike", () => {
    expect(remarkFor({ ...base, tags: ["Founder"] })).not.toBe(remarkFor({ ...base, tags: [] }));
    expect(remarkFor({ ...base, interests: ["Startups"], userId: "q" })).toBe(
      remarkFor({ ...base, tags: ["Founder"], userId: "q" }),
    );
  });

  it("an empty profile still gets a line", () => {
    expect(remarkFor(base)).toMatch(/^This user (is new here|is figuring it out|just arrived|has not filled this in yet).$/);
  });

  it("being early is itself a fact worth saying", () => {
    expect(remarkFor({ ...base, userId: "z", memberNo: 2 })).toMatch(
      /^This user (was here before most|found it first|got in early).$/,
    );
  });

  it("every line carries its own subject, so none needs a pronoun to agree with", () => {
    // Pronouns are a profile field now, and using them here would mean
    // writing each line twice for the verb — and guessing for anyone who
    // leaves the field unset.
    const src = read("src/lib/card-remarks.ts");
    expect(src).toContain('const SUBJECT = "This user"');
    for (const s of [base, { ...base, hasAnthem: true }, { ...base, tags: ["Designer"] }]) {
      expect(remarkFor(s).startsWith("This user ")).toBe(true);
      expect(remarkFor(s).endsWith(".")).toBe(true);
    }
  });

  it("everything on a profile counts, not just the first thing that matched", () => {
    // An earlier version took whichever trait matched first, so a founder
    // who also makes music was only ever a musician, and a long carefully
    // filled profile read exactly like a bare one.
    const ranked = traitsOf({
      ...base,
      userId: "n",
      tags: ["Founder", "Artist"],
      interests: ["Startups", "Memes"],
      hasAnthem: true,
    });
    expect(ranked.length).toBeGreaterThan(3);
    // Founder + Startups is two mentions of the same thing, so it outranks
    // a single one; an anthem counts for more still than either alone.
    expect(ranked[0].key).toBe("build");
    expect(ranked[0].score).toBe(4);
    expect(ranked.find((t) => t.key === "music")?.score).toBe(3);
  });

  it("a tie is broken by the account, not by the order the traits are written in", () => {
    // Otherwise everyone with the same two interests gets the same one of
    // them, for ever.
    const of = (userId: string) => traitsOf({ ...base, userId, tags: ["Designer", "Writer"] })[0].key;
    const picks = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(of));
    expect(picks.size).toBe(2);
  });

  it("moves on with the week, and holds still within one", () => {
    const s = { ...base, userId: "f7de5612", tags: ["Developer"], interests: ["Coding"] };
    expect(remarkFor({ ...s, epoch: 100 })).toBe(remarkFor({ ...s, epoch: 100 }));
    const overAYear = new Set(Array.from({ length: 52 }, (_, w) => remarkFor({ ...s, epoch: 100 + w })));
    expect(overAYear.size).toBeGreaterThan(2);
  });

  it("pairs two things sometimes, and not every time", () => {
    const s = { ...base, tags: ["Developer", "Designer"] };
    const lines = Array.from({ length: 40 }, (_, i) => remarkFor({ ...s, userId: `u${i}`, epoch: 7 }));
    const paired = lines.filter((l) => l.includes(" and "));
    // Always pairing would be its own formula — every card the same shape.
    expect(paired.length).toBeGreaterThan(0);
    expect(paired.length).toBeLessThan(lines.length);
  });

  it("two people are not handed the same words by accident", () => {
    // uuids share most of their alphabet and all of their length, so a
    // character sum clusters them hard. Spread across a realistic set.
    const ids = Array.from({ length: 60 }, (_, i) => `f7de5612-3fd9-41cb-9e0a-0897a0704${String(i).padStart(3, "0")}`);
    const got = new Set(ids.map((userId) => remarkFor({ ...base, userId, hasAnthem: true })));
    expect(got.size).toBeGreaterThanOrEqual(4);
  });

  it("is set lowercase against the uppercase labels", () => {
    const lines = read("src/lib/card-remarks.ts").match(/"[a-z][^"]*."/g) ?? [];
    expect(lines.length).toBeGreaterThan(30);
    expect(back).toContain('<Row label="Remarks" value={remark} lower />');
  });
});

describe("what the ID says", () => {
  it("says the month and the year, never the day", () => {
    expect(memberSince("2026-06-02T10:22:00Z")).toBe("JUNE 2026");
    expect(memberSince(null)).toBeNull();
    expect(memberSince("not a date")).toBeNull();
  });

  it("the anthem is the song and who made it", () => {
    expect(anthemLine({ title: "Die For You", artist: "The Weeknd" })).toBe("Die For You — The Weeknd");
    expect(anthemLine({ title: "Untitled" })).toBe("Untitled");
    expect(anthemLine({ artist: "Nobody" })).toBeNull();
    expect(anthemLine(null)).toBeNull();
    expect(anthemLine("a string")).toBeNull();
  });

  it("carries nothing that stops being true once it leaves the app", () => {
    // It is the face that gets saved to someone's photos. A card from June
    // claiming twelve followers reads badly by October.
    expect(back).not.toContain("FollowButton");
    expect(back).not.toContain("stats.followers");
    expect(back).not.toContain("stats.posts");
  });

  it("the wordmark signs the bottom of it", () => {
    expect(back).toContain("<HypefyWordmark");
  });

  it("it is a record, not a caption: the code, the caption, six rows and the address", () => {
    expect(back).toContain("Scan to open");
    expect(back).toContain('<Row label="Member"');
    expect(back).toContain('<Row label="Since"');
    expect(back).toContain('<Row label="Pronouns"');
    expect(back).toContain('<Row label="Roles"');
    expect(back).toContain('<Row label="Remarks"');
    expect(back).toContain('<Row label="Anthem"');
    // The address, for anyone holding a screenshot with no camera to hand.
    expect(back).toContain("prettyUrl(url)");
  });

  it("the header is the words alone, at the right", () => {
    // The mark used to sit on the left of that row; it is in the middle of
    // the code now, which is the one place on the back it has a job.
    expect(back).toContain("Hypefy ID");
    expect(back).not.toContain("<HypefyMark");
  });

  it("pronouns are a row here and a handle line on the front, never both", () => {
    expect(back).toContain('<Row label="Pronouns"');
    expect(front).toContain("function HandleLine");
    expect(back).not.toContain("function HandleLine");
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
      expect(from).toBe(n - 1 - to);
    }
  });

  it("the badge stays well inside what error correction level H can lose", () => {
    for (const n of [21, 33, 57]) {
      const { from, to } = badgeSpan(n);
      expect(((to - from + 1) ** 2 / n ** 2) * 100).toBeLessThan(12);
    }
  });

  it("only the middle is cleared", () => {
    const n = 33;
    expect(isUnderBadge(16, 16, n)).toBe(true);
    expect(isUnderBadge(0, 0, n)).toBe(false);
    expect(isUnderBadge(n - 1, n - 1, n)).toBe(false);
  });

  it("is dark on light — the polarity every scanner ever written agrees on", () => {
    // A light-on-dark code looked better against the plate, but it is an
    // inverted symbol and a share of older scanner apps flatly refuse one.
    expect(QR_PALETTE.field).toBe("#ffffff");
    expect(QR_PALETTE.module).toBe("#0a0a0a");
    expect(read("src/lib/hypefy-qr.ts")).toContain('errorCorrectionLevel: "H"');
  });

  it("the mark in the badge is centred on the H, not on the lockup", () => {
    // The full stop pulls the lockup's box right, so centring that puts
    // the letter visibly left of middle.
    expect(read("src/lib/hypefy-qr.ts")).toContain("MARK_H.w");
    expect(read("src/lib/hypefy-qr.ts")).not.toContain("MARK_LOCKUP");
  });
});

describe("the mark", () => {
  it("is the measured logo, not a redrawing of it", () => {
    // From public/icons/icon-512.png: stems 43 across, crossbar 36 deep,
    // the dot a 29-square on the letter's baseline, scaled by 24/202.
    expect(MARK_LETTER).toHaveLength(3);
    const [leftStem, crossbar, rightStem] = MARK_LETTER;
    expect(leftStem.w).toBeCloseTo(rightStem.w, 3);
    expect(leftStem.h).toBeCloseTo(rightStem.h, 3);
    expect(leftStem.x).toBe(0);
    expect(rightStem.x + rightStem.w).toBeCloseTo(crossbar.w, 2);
    expect(crossbar.y).toBeGreaterThan(leftStem.y);
    expect(crossbar.y + crossbar.h).toBeLessThan(leftStem.y + leftStem.h);
  });

  it("the full stop sits on the letter's baseline, to its right", () => {
    const baseline = Math.max(...MARK_LETTER.map((r) => r.y + r.h));
    expect(MARK_DOT.y + MARK_DOT.h).toBeCloseTo(baseline, 2);
    expect(MARK_DOT.x).toBeGreaterThan(Math.max(...MARK_LETTER.map((r) => r.x + r.w)));
  });

  it("the lockup is what anything placing it centres on, not the box", () => {
    // Scaled against the box, the mark covered about 40% of the badge it
    // was given and sat visibly off to one side.
    const inkRight = Math.max(MARK_DOT.x + MARK_DOT.w, ...MARK_LETTER.map((r) => r.x + r.w));
    expect(MARK_LOCKUP.w).toBeCloseTo(inkRight, 2);
    expect(MARK_LOCKUP.h).toBeCloseTo(MARK_LETTER[0].h, 3);
    // Centred in the box: equal margin above and below.
    expect(MARK_LOCKUP.y).toBeCloseTo((MARK_BOX - MARK_LOCKUP.h) / 2, 2);
  });

  it("MARK_H is the letter without the dot, which is what the badge centres on", () => {
    const crossbar = MARK_LETTER[1];
    expect(MARK_H.w).toBeCloseTo(crossbar.w, 3);
    expect(MARK_H.w).toBeLessThan(MARK_LOCKUP.w);
    expect(MARK_H.h).toBeCloseTo(MARK_LOCKUP.h, 3);
  });
});

describe("the saved image and the face on screen", () => {
  it("are drawn from the same mark, code, number and line", () => {
    const img = read("src/lib/card-image.ts");
    expect(img).toContain("paintHypefyQr");
    expect(img).toContain("remarkFor");
    expect(img).toContain("memberNumber");
    expect(img).toContain("anthemLine");
    expect(img).toContain("pronounLabel");
  });

  it("the layout is worked out before anything is painted, because a canvas is sized first", () => {
    const four = idCardLayout(4);
    const two = idCardLayout(2);
    expect(four.width).toBe(380);
    expect(four.height).toBeGreaterThan(two.height);
    expect(four.header).toBeLessThan(four.qrTop);
    expect(four.qrTop).toBeLessThan(four.name);
    expect(four.name).toBeLessThan(four.rulesTop);
    expect(four.rulesTop).toBeLessThan(four.footer);
    expect(four.footer).toBeLessThan(four.height);
  });

  it("goes through the share sheet on a phone, where Save image lives", () => {
    const img = read("src/lib/card-image.ts");
    expect(img).toContain("navigator.canShare");
    expect(img).toContain("a.download = file.name");
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
