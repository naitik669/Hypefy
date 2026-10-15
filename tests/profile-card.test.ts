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
import {
  eraOf,
  PREDICATE_CHARS,
  remarkRows,
  traitsOf,
  VALUE_CHARS,
  type RemarkSource,
} from "@/lib/card-remarks";
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
    // Only while it is turning, which is the test below this block.
    expect(flip).toContain("perspective: spatial ? 1900 : undefined");
    expect(flip).toContain('"preserve-3d"');
    expect(flip).toContain("rotateY(180deg)");
    expect(flip).toContain('backfaceVisibility: spatial ? "hidden" : undefined');
  });

  it("follows a finger, and lets go of a vertical drag", () => {
    expect(flip).toContain("onTouchStart");
    expect(flip).toContain('g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"');
    expect(flip).toContain('if (g.axis !== "x") return;');
    expect(flip).toContain("(half - base + drag) * 180");
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
    expect(flip).toContain("((n % 2) + 2) % 2 === 1");
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
    expect(flip).toContain("inert={away}");
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
  const NOW = Date.parse("2026-10-15T20:00:00Z");
  const ago = (d: number) => new Date(NOW - d * 864e5).toISOString();
  /** A timestamp at a given hour in IST, which is the clock the line reads. */
  const at = (hour: number) => new Date(NOW - (NOW % 864e5) + (hour - 5.5) * 36e5).toISOString();
  const base: RemarkSource = {
    userId: "a",
    tags: [],
    interests: [],
    hasAnthem: false,
    memberNo: null,
    now: NOW,
  };
  /** Someone with enough history that every rule is in play. */
  const lively = (over: Partial<RemarkSource> = {}): RemarkSource => ({
    ...base,
    userId: "lively",
    tags: ["Founder", "Artist"],
    interests: ["Startups", "Art", "Music"],
    hasAnthem: true,
    joinedAt: ago(200),
    posts: 30,
    hypers: 80,
    ...over,
  });
  const text = (s: RemarkSource) =>
    remarkRows(s)
      .map((r) => r.value)
      .join(" / ");

  it("fits the column it is drawn in", () => {
    // The value column is 208px and the mono face runs 6.32px to the
    // character, both measured on the live card; past that the row
    // truncates with an ellipsis rather than wrapping. This is the
    // constraint the whole two-row format exists to satisfy.
    expect(VALUE_CHARS).toBe(32);
    expect(PREDICATE_CHARS).toBe(22);
    let checked = 0;
    for (let i = 0; i < 400; i++) {
      for (const s of [
        { ...base, userId: `u${i}` },
        { ...base, userId: `u${i}`, interests: ["Music"], joinedAt: ago(3) },
        lively({ userId: `u${i}`, lastSeenAt: at(3), frame: "deco-bolt", memberNo: 2 }),
        lively({ userId: `u${i}`, posts: 0, hypers: 400, joinedAt: ago(45) }),
        { ...base, userId: `u${i}`, tags: ["Editor"], joinedAt: ago(500), posts: 2, hypers: 30 },
      ]) {
        for (const epoch of [0, 1, 2, 3, 4]) {
          for (const row of remarkRows({ ...s, epoch })) {
            expect(row.value.length).toBeLessThanOrEqual(VALUE_CHARS);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("the same person always gets the same line", () => {
    // The screen and the saved image are drawn moments apart from the
    // same function, and must not disagree.
    const s = lively({ epoch: 9 });
    const once = text(s);
    expect(text(s)).toBe(once);
    expect(text(s)).toBe(once);
  });

  it("moves on, and not all on the same day", () => {
    const s = lively();
    const overAYear = new Set(Array.from({ length: 13 }, (_, c) => text({ ...s, epoch: c })));
    expect(overAYear.size).toBeGreaterThan(4);
    // Staggered per account: two accounts do not turn over together.
    const starts = new Set(
      Array.from({ length: 24 }, (_, i) => text(lively({ userId: `stag${i}` }))),
    );
    expect(starts.size).toBeGreaterThan(5);
  });

  it("reads two people differently", () => {
    const spread = new Set(Array.from({ length: 40 }, (_, i) => text(lively({ userId: `u${i}`, epoch: 7 }))));
    expect(spread.size).toBeGreaterThan(8);
  });

  it("reports a gap as two rows, and anything else as one", () => {
    // The pair is the voice: what was declared against what was seen.
    const rows = remarkRows(lively({ userId: "pairy", lastSeenAt: at(3), epoch: 1 }));
    expect(rows.length === 1 || rows.length === 2).toBe(true);
    const pairs = Array.from({ length: 30 }, (_, i) =>
      remarkRows(lively({ userId: `p${i}`, lastSeenAt: at(3) })),
    );
    expect(pairs.some((r) => r.length === 2)).toBe(true);
    for (const r of pairs) {
      if (r.length === 2) expect(r.map((x) => x.label)).toEqual(["Declared", "Observed"]);
      else expect(r[0].label).toBe("Remarks");
    }
  });

  it("single rows all name their subject and end in a stop", () => {
    for (let i = 0; i < 200; i++) {
      for (const rows of [remarkRows({ ...base, userId: `s${i}` }), remarkRows(lively({ userId: `s${i}` }))]) {
        if (rows.length !== 1) continue;
        expect(rows[0].value.startsWith("This user ")).toBe(true);
        expect(rows[0].value.endsWith(".")).toBe(true);
      }
    }
  });

  it("never prints a count", () => {
    // Bands, not numbers: a saved card saying "a few" ages gracefully and
    // one saying "7" does not. The member number and the one clock hour
    // are the only digits allowed out.
    for (let i = 0; i < 300; i++) {
      for (const s of [
        lively({ userId: `n${i}`, posts: 7, hypers: 143 }),
        lively({ userId: `n${i}`, posts: 0, hypers: 1200, joinedAt: ago(40) }),
        { ...base, userId: `n${i}`, tags: ["Writer"], joinedAt: ago(300), posts: 3, hypers: 55 },
      ]) {
        for (const epoch of [0, 1, 2]) {
          const v = text({ ...s, epoch }).replace("3am", "").replace(/\b0\d{3}\b/, "");
          expect(v).not.toMatch(/\d/);
        }
      }
    }
  });

  it("will not read the clock when the profile says not to", () => {
    // show_activity is the profile's own toggle. Using last_seen_at for
    // someone who switched it off would publish exactly what they hid.
    const seen = lively({ userId: "clock", lastSeenAt: at(3) });
    const hidden = { ...seen, showActivity: false };
    const nocturnal = ["awake at 3am", "nocturnal", "keeps odd hours", "still awake"];
    let sawIt = false;
    for (let e = 0; e < 12; e++) {
      if (nocturnal.some((p) => text({ ...seen, epoch: e }).includes(p))) sawIt = true;
      for (const p of nocturnal) expect(text({ ...hidden, epoch: e })).not.toContain(p);
    }
    expect(sawIt).toBe(true);
  });

  it("will not call someone nocturnal on the strength of a stale timestamp", () => {
    const stale = lively({ userId: "clock", lastSeenAt: ago(60) });
    for (let e = 0; e < 12; e++) {
      expect(text({ ...stale, epoch: e })).not.toContain("3am");
    }
  });

  it("earns the right to say things", () => {
    expect(eraOf({ ...base, interests: ["Music"], joinedAt: ago(3) }, NOW)).toBe("arrival");
    expect(eraOf({ ...base, joinedAt: ago(900) }, NOW)).toBe("veteran");
    expect(eraOf({ ...base, tags: ["Gamer"], joinedAt: ago(20) }, NOW)).toBe("settling");
    expect(eraOf({ ...base, tags: ["Gamer"], joinedAt: ago(40), posts: 5 }, NOW)).toBe("regular");
    expect(eraOf({ ...base, tags: ["Gamer"], joinedAt: ago(400), posts: 5 }, NOW)).toBe("veteran");
  });

  it("does not roast a three-day-old account", () => {
    // A roast needs material, and the one card where a burn would land
    // badly is somebody's first week.
    const sharp = ["hypes, rarely posts", "excellent frame", "posts about one", "awake at 3am", "attends, does not file"];
    for (let i = 0; i < 300; i++) {
      const s = {
        ...base,
        userId: `new${i}`,
        interests: ["Music"],
        joinedAt: ago(2),
        posts: 0,
        hypers: 0,
        frame: "deco-x",
        lastSeenAt: at(3),
      };
      for (let e = 0; e < 5; e++) {
        for (const p of sharp) expect(text({ ...s, epoch: e })).not.toContain(p);
      }
    }
  });

  it("does not tell a year-old empty profile that it just arrived", () => {
    const old = { ...base, userId: "bare", joinedAt: ago(400), posts: 5 };
    expect(eraOf(old, NOW)).toBe("veteran");
    const over = new Set(Array.from({ length: 8 }, (_, e) => text({ ...old, epoch: e })));
    for (const line of over) expect(line).not.toContain("just arrived");
    expect(over.size).toBeGreaterThan(2);
  });

  it("says something about a blank new profile rather than nothing", () => {
    const rows = remarkRows({ ...base, userId: "blank", joinedAt: ago(1) });
    expect(rows).toHaveLength(1);
    expect(rows[0].value.length).toBeGreaterThan(12);
  });

  it("counts a tag and an interest for the same thing twice", () => {
    expect(traitsOf({ ...base, tags: ["Musician"], interests: ["Music"] })[0]).toEqual({
      key: "music",
      score: 4,
    });
    // An anthem is worth more than either: it is the one you go and find.
    expect(traitsOf({ ...base, hasAnthem: true })[0]).toEqual({ key: "music", score: 3 });
  });

  it("is set lowercase against the uppercase labels", () => {
    const written = read("src/lib/card-remarks.ts").match(/"[a-z][^"]*"/g) ?? [];
    expect(written.length).toBeGreaterThan(60);
    expect(back).toContain("{remark.map((row) => (");
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
    // The counts are read, but only ever as bands, and only by the line —
    // they reach remarkRows and nothing else. The test that no digit
    // survives to the card is over in "the remark".
    expect(back).not.toContain("{data.stats.followers}");
    expect(back).not.toContain("{data.stats.posts}");
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
    // One Remarks row, or the Declared/Observed pair that replaces it.
    expect(back).toContain("{remark.map((row) => (");
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
    expect(img).toContain("remarkRows");
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

describe("the card is drawn at the screen's own resolution", () => {
  it("is only in perspective while it is actually turning", () => {
    // A `perspective` puts the whole subtree into a 3D rendering context,
    // which the browser composites as a texture at a resolution it picks
    // for itself. On a display at a fractional scale — a Windows desktop
    // at 125% — that is not the screen's, and the card sat permanently
    // soft: measured at 13% less edge contrast on its own text, with
    // nothing moving. At a dead-on 0 or 180 degrees the card is square to
    // the screen, so taking it off at rest costs nothing to look at.
    expect(flip).toContain("const spatial = !reduced && (turning || dragging);");
    expect(flip).not.toContain("style={{ perspective: 1900 }}");
    // And the 3D context itself goes with it, which is what the back
    // face needed: it carried a rotateY(180deg) of its own on top of
    // the inner's, so it stayed soft after the front came good.
    expect(flip).toContain('(spatial ? "preserve-3d" : "flat")');
    expect(flip).toContain("backfaceVisibility: spatial ? \"hidden\" : undefined");
    expect(flip).not.toContain('transform: back && !reduced ? "rotateY(180deg)" : undefined');
  });

  it("puts it back before the rotation starts, and takes it off after", () => {
    // Same render as the transform change, so no frame of the turn is
    // drawn flat; off again only once this element's own transform has
    // finished moving.
    expect(flip).toContain("setTurning(true)");
    expect(flip).toContain('e.propertyName !== "transform"');
    expect(flip).toContain("e.target !== e.currentTarget");
  });

  it("holds it through a drag that drops back as well as one that turns", () => {
    // Releasing below the threshold animates back to where it was, and
    // that transition needs the perspective too — but half does not
    // change to announce it.
    expect(flip).toContain("if (travelled > 0) setTurning(true);");
  });

  it("stops claiming an animation once the lift has played", () => {
    // Left set, the element reads as permanently animating and stays on
    // its own compositor layer for the rest of the session.
    expect(flip).toContain('el.style.animation = "";');
    expect(flip).toContain('addEventListener("animationend", done, { once: true })');
  });

  it("paints the QR for the screen rather than at one fixed size", () => {
    // 640 was a third short of a phone tile at 3x, so every module edge
    // was resampled — the one softness a scanner cares about.
    expect(back).toContain("const QR_MAX_CSS = 380;");
    expect(back).toContain("window.devicePixelRatio");
    expect(back).toContain("hypefyQrDataUrl(url, Math.ceil(QR_MAX_CSS * dpr))");
    expect(back).not.toContain("hypefyQrDataUrl(url)");
  });
});

describe("the back face is flat at rest too", () => {
  it("folds a finished turn into the resting side instead of carrying it", () => {
    // The back used to sit under a permanent rotateY(180deg) of its own,
    // on top of the inner's — two 3D transforms stacked — so it stayed
    // soft after the front came good. Measured on its mono rows: 3.49
    // mean edge contrast before, 4.70 after, at a 1.25 pixel ratio.
    expect(flip).toContain("setBase(half)");
    expect(flip).toContain("const [base, setBase] = useState(half)");
    // Which face carries the half turn follows the side being rested on,
    // so a turn always starts from no rotation at all.
    expect(flip).toContain("rotated={spatial && baseFlipped}");
    expect(flip).toContain("rotated={spatial && !baseFlipped}");
  });

  it("hides the spare face flatly when there is no rotation to hide it", () => {
    expect(flip).toContain("visibility: !spatial && !reduced && away ? \"hidden\" : undefined");
  });

  it("still cross-fades rather than turning for reduced motion", () => {
    // visibility would kill the fade, so it is only used when the card
    // is genuinely flat and not in the reduced-motion path.
    expect(flip).toContain("opacity: reduced && away ? 0 : 1");
  });
});

describe("the card clears the phone's system bars", () => {
  it("reserves the safe areas rather than measuring space it cannot have", () => {
    // The overlay is fixed inset-0, so it covers the whole window —
    // including whatever the status bar and the gesture bar sit over. The
    // card sizes itself to what is left, so without these it was laying
    // itself out into room that was not there: measured 24px of the card
    // under the gesture bar at 360x640 and at 360x800.
    expect(card).toContain("pt-[max(0.75rem,var(--sat))]");
    expect(card).toContain("pb-[max(1.5rem,var(--sab))]");
    expect(card).not.toContain("justify-between px-4 py-3");
    expect(card).not.toContain("overflow-y-auto px-5 pb-6");
  });

  it("uses the project's variables, not env() directly", () => {
    // globals.css explains why: Capacitor writes --safe-area-inset-* in
    // the same step that lays the web view out, and an older WebView's
    // own env() copy goes stale when the layout changes after launch.
    expect(card).not.toContain("env(safe-area-inset");
  });

  it("falls back to the spacing the website already had", () => {
    // max() with the old values, so with no safe areas — every browser
    // on a desktop — the layout is byte-for-byte what it was.
    expect(card).toContain("max(0.75rem,");
    expect(card).toContain("max(1.5rem,");
  });
});
