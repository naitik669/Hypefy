import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The hype mark is the app's own star, not lucide's.
 *
 * Hype is what Hypefy is named around, and a stock five-point rating star
 * was carrying it — the one borrowed shape in a row where the comment
 * bubble, the share arrow and the rehype arrows had all already been drawn
 * here. Same five points, fatter body, round joins.
 *
 * The swap is wide on purpose: the mark appears on the action row, in the
 * burst and break animations, on counts, badges, meters and the mock feed in
 * onboarding. A half-swap would show two different stars in one viewport.
 *
 * What it must NOT touch is the other star. `fill-accent` on a star means
 * close friends — the diary's audience, a Show's audience — and the GIF
 * picker's means favourites. Those are different ideas that happen to share
 * a shape.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const icon = read("src/components/ui/HypeIcon.tsx");

/** Every .tsx under src, so a new file cannot quietly reach for lucide's Star. */
function tsxFiles(dir = "src"): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("the mark itself", () => {
  it("is five points, drawn here", () => {
    // Ten vertices: five out, five in.
    const d = icon.match(/d="([^"]+)"/)?.[1] ?? "";
    expect((d.match(/L/g) ?? []).length).toBe(9);
    expect(d.startsWith("M12 2.4")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("with a fat waist, so it still reads at 9px", () => {
    // The inner radius is a little over half the outer. lucide's is thinner,
    // and a thin-wristed star fills into a blob at the sizes a Show chip and
    // a badge use.
    const d = icon.match(/d="([^"]+)"/)?.[1] ?? "";
    const pts = [...d.matchAll(/([\d.]+) ([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    const r = pts.map(([x, y]) => Math.hypot(x - 12, y - 12));
    const outer = Math.max(...r);
    const inner = Math.min(...r);
    expect(inner / outer).toBeGreaterThan(0.5);
    expect(inner / outer).toBeLessThan(0.62);
  });

  it("and round joins, like every other corner in the app", () => {
    expect(icon).toContain('strokeLinejoin="round"');
  });

  it("its props mirror lucide's, so call sites read the same", () => {
    for (const prop of ["size", "strokeWidth", "className", "fill", "stroke", "style"]) {
      expect(icon, prop).toContain(`${prop}?:`);
    }
  });
});

describe("where it replaced lucide's", () => {
  it("and the only files still importing lucide's are the ones that mean something else", () => {
    /*
     * Not "nobody imports Star any more" — that was the assertion I wrote
     * first and it was wrong. Twelve files keep it legitimately, and the
     * word "Hype" in a label does not settle it: "Hype buddies" is the
     * close-friends feature, which has its own HyperStar and its own
     * meaning. The hype ACTION gets the new mark; the relationship does
     * not.
     */
    const allowed = new Set([
      // Close friends, by any of its names.
      "src/components/diary/AudiencePicker.tsx",
      "src/components/diary/DiaryEditor.tsx",
      "src/components/diary/DiaryStories.tsx",
      "src/components/diary/FriendDiaryCard.tsx",
      "src/components/diary/PastPageView.tsx",
      "src/components/diary/YourDiaryCard.tsx",
      "src/components/feed/PostActionsSheet.tsx",
      "src/components/profile/CircleList.tsx",
      "src/components/profile/HyperFavoriteButton.tsx",
      "src/components/shows/ShowAudienceBar.tsx",
      "src/components/ui/MutualHyperBadge.tsx",
      // "Hype buddies — Your closest people": the same relationship again.
      "src/app/(app)/settings/page.tsx",
      // Saving a GIF, which is not hype at all.
      "src/components/messages/GifPicker.tsx",
    ]);
    const offenders = tsxFiles()
      .map((f) => f.split("\\").join("/"))
      .filter((f) => /import \{[^}]*\bStar\b[^}]*\} from "lucide-react"/.test(read(f)))
      .filter((f) => !allowed.has(f));
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("the glossary's own entry for Hype uses it, since that is what it defines", () => {
    expect(read("src/app/(app)/help/page.tsx")).toContain("icon: HypeIcon,");
  });

  it("and so does the Hypes tab in your activity", () => {
    expect(read("src/components/profile/ActivityScreen.tsx")).toContain('{ id: "hypes", label: "Hypes", Icon: HypeIcon }');
  });

  it("the action row, the burst and the break all use it", () => {
    for (const f of [
      "src/components/feed/FeedCard.tsx",
      "src/components/feed/HypeParticles.tsx",
      "src/components/feed/HypeBreak.tsx",
      "src/components/shots/ReelsFeed.tsx",
      "src/components/ui/HypeMeter.tsx",
    ]) {
      expect(read(f), f).toContain("<HypeIcon");
    }
  });

  it("including the animations, so the shape does not change mid-burst", () => {
    // The break plays a star snapping in two. A lucide star cracking into a
    // soft star would be visible.
    expect(read("src/components/feed/HypeBreak.tsx")).not.toContain("lucide-react");
    expect(read("src/components/feed/HypeParticles.tsx")).not.toContain("lucide-react");
  });
});

describe("what it left alone", () => {
  it("the close-friends star is a different idea and keeps its own shape", () => {
    // fill-accent on a star means close friends, not hype.
    for (const f of [
      "src/components/diary/DiaryEditor.tsx",
      "src/components/diary/DiaryStories.tsx",
      "src/components/diary/YourDiaryCard.tsx",
    ]) {
      const s = read(f);
      expect(s, f).toContain("<Star");
      expect(s, f).toContain("fill-accent");
    }
  });

  it("and the GIF picker's star is favourites, not hype", () => {
    const s = read("src/components/messages/GifPicker.tsx");
    expect(s).toContain("<Star");
    expect(s).toContain("favourites");
  });

  it("the mutual-Hypers badge keeps lucide's, because Hypers is a relationship", () => {
    // I swapped this one first and it was wrong. It sits beside HyperStar
    // and means "you two added each other", not "somebody hyped this".
    const s = read("src/components/ui/MutualHyperBadge.tsx");
    expect(s).toContain("<Star");
    expect(s).not.toContain("HypeIcon");
  });
});
