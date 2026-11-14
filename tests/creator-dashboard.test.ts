import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RECENT_DAYS, bestRecent, dayLabel, type StatItem } from "@/lib/creator-overview";

/**
 * Phase 3: the dashboard.
 *
 * /profile/insights is a list of what each post did; this answers "how is
 * it going" in the first screen. Opt-in, and the switch lives on the page
 * it unlocks — a toggle in settings that reveals a screen elsewhere is two
 * steps and no account of what the second one is for.
 *
 * The judgements live in lib/creator-overview rather than inline in the
 * server component, for the reason creator-insights.ts exists: a decision
 * written in JSX can only be checked by matching the file as text, and a
 * text test cannot tell a live branch from a dead one.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/**
 * The file with its comments taken out.
 *
 * Three assertions below failed first time because the prose explaining a
 * decision contains the very word the test asserts absent — the migration
 * says "there is no badge", the sparkline says "no aria-label of its own".
 * Matching the whole file matches the explanation as readily as the code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*(--|\/\/).*$/gm, "");

/** Prose with its line wrapping flattened, for matching copy inside JSX. */
const prose = (p: string) => read(p).replace(/\s+/g, " ");

const page = read("src/app/(app)/creator/page.tsx");
const intro = read("src/components/creator/CreatorModeIntro.tsx");
const m207 = read("supabase/migrations/0207_creator_mode.sql");

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 10, 14);
const ago = (d: number) => new Date(now - d * DAY).toISOString();

function item(p: Partial<StatItem> & { id: string }): StatItem {
  return {
    kind: "post",
    caption: null,
    cover: null,
    created_at: ago(1),
    views: 0,
    reach: 0,
    ...p,
  };
}

describe("the thing doing best lately", () => {
  it("is ranked by people reached, not by views", () => {
    // Forty people seeing it three times each beats six people seeing it
    // ninety times, which is the whole reason reach exists as a number.
    const wide = item({ id: "wide", views: 120, reach: 40 });
    const repeat = item({ id: "repeat", views: 900, reach: 6 });
    expect(bestRecent([repeat, wide], now)?.id).toBe("wide");
  });

  it("ignores anything older than the window", () => {
    // The all-time winner is the same row every time you open the screen,
    // which stops being information after the second look.
    const old = item({ id: "old", reach: 999, created_at: ago(RECENT_DAYS + 5) });
    const fresh = item({ id: "fresh", reach: 2, created_at: ago(2) });
    expect(bestRecent([old, fresh], now)?.id).toBe("fresh");
  });

  it("and never picks something nobody saw", () => {
    // "Doing best" about a post with no reach is worse than showing nothing.
    expect(bestRecent([item({ id: "a" }), item({ id: "b" })], now)).toBe(null);
    expect(bestRecent([], now)).toBe(null);
  });

  it("breaks a tie on views, then on being newer", () => {
    const older = item({ id: "older", reach: 5, views: 10, created_at: ago(9) });
    const newer = item({ id: "newer", reach: 5, views: 10, created_at: ago(1) });
    expect(bestRecent([older, newer], now)?.id).toBe("newer");

    const seen = item({ id: "seen", reach: 5, views: 50, created_at: ago(9) });
    expect(bestRecent([seen, newer], now)?.id).toBe("seen");
  });

  it("survives a row with a rotten date", () => {
    const bad = item({ id: "bad", reach: 99, created_at: "not a date" });
    const ok = item({ id: "ok", reach: 1 });
    expect(bestRecent([bad, ok], now)?.id).toBe("ok");
  });
});

describe("axis labels", () => {
  it("are numeric, because a month name does not fit thirty of them", () => {
    expect(dayLabel("2026-11-14")).toBe("14/11");
    expect(dayLabel("2026-01-02")).toBe("2/1");
  });

  it("and a bad day is blank rather than Invalid Date", () => {
    expect(dayLabel("nonsense")).toBe("");
  });
});

describe("creator mode", () => {
  it("is off until somebody turns it on", () => {
    expect(m207).toContain("creator_mode boolean not null default false");
  });

  it("is writable, which a new column on profiles is not by default", () => {
    // profiles grants per column, so a new one is invisible and unwritable
    // until it is named. Same trap the 0195 header describes for posts.media.
    expect(m207).toContain("update (creator_mode) on public.profiles to authenticated");
    // And emphatically NOT select. profiles grants per column with a
    // "viewable by everyone" policy, so a select grant here would make
    // "who has creator tools on" readable about anybody. 0207 did that
    // for about ten minutes; 0208 revoked it and moved the read into
    // my_private_profile.
    const sql207 = code("supabase/migrations/0207_creator_mode.sql");
    expect(sql207).not.toMatch(/grant select (creator_mode)/);
    expect(read("supabase/migrations/0208_creator_mode_is_nobody_elses_business.sql"))
      .toContain("revoke select (creator_mode) on public.profiles from anon, authenticated");
  });

  it("changes nothing anybody else can see", () => {
    // No badge, no category, no label. A creator account that announces
    // itself is a much larger decision and does not get made by accident
    // on the way to shipping charts.
    // Against the executable SQL, not the comment above it, which says
    // "there is no badge, no category, no label" and so contains the word.
    const sql = code("supabase/migrations/0207_creator_mode.sql").toLowerCase();
    for (const word of ["badge", "verified", "is_creator_public"]) {
      expect(sql, word).not.toContain(word);
    }
    // And it really does add only the one column.
    expect(sql).toContain("add column if not exists creator_mode");
    expect(sql.match(/add column/g) ?? []).toHaveLength(1);
  });

  it("and the dashboard is gated on it", () => {
    // Read through my_private_profile, not off the table — see 0208.
    expect(page).toContain("mine?.creatorMode");
    expect(page).toContain("getPrivateProfile(supabase)");
    expect(page).toContain("<CreatorModeIntro />");
  });

  it("with the switch on the page it unlocks", () => {
    expect(intro).toContain("setCreatorMode(true)");
  });

  it("saying plainly that three of the four numbers start from empty", () => {
    // A dashboard that opens on four confident zeroes reads as broken
    // rather than as new.
    // Flattened: the sentence wraps across lines in the JSX, so matching
    // the raw file fails on the newline and indentation in the middle.
    expect(prose("src/components/creator/CreatorModeIntro.tsx")).toMatch(
      /only started being recorded recently/i,
    );
  });

  it("and that turning it on tells nobody", () => {
    const flat = prose("src/components/creator/CreatorModeIntro.tsx");
    expect(flat).toMatch(/nothing changes on your profile/i);
    expect(flat).toMatch(/never who/i);
  });
});

describe("the dashboard draws from the real aggregates", () => {
  it("not from a count the client could widen", () => {
    expect(page).toContain('supabase.rpc("creator_totals")');
    expect(page).toContain('supabase.rpc("profile_view_stats"');
    expect(page).toContain('supabase.rpc("creator_item_stats"');
  });

  it("and uses the chart kit rather than a dependency", () => {
    // package.json ships no charting library and this did not add one.
    const pkg = read("package.json");
    for (const lib of ["recharts", "chart.js", "victory", "nivo", "apexcharts"]) {
      expect(pkg, lib).not.toContain(`"${lib}"`);
    }
    expect(page).toContain("<BarChart");
    expect(page).toContain("<Donut");
    expect(page).toContain("<Sparkline");
  });

  it("every chart that carries meaning has a text equivalent", () => {
    // An SVG of rectangles says nothing at all to a screen reader.
    const bar = read("src/components/charts/BarChart.tsx");
    const donut = read("src/components/charts/Donut.tsx");
    expect(bar).toContain('role="img"');
    expect(bar).toContain("aria-label={summary}");
    expect(donut).toContain('role="img"');
    expect(donut).toContain("aria-label={summary}");
  });

  it("and the one that does not is hidden rather than left unlabelled", () => {
    // A sparkline sits under a figure the card already states in text;
    // "a line that goes up a bit" read out between the two adds nothing.
    const spark = read("src/components/charts/Sparkline.tsx");
    expect(spark).toContain("aria-hidden");
    // The attribute, not the word: the comment above it explains that the
    // sparkline carries no aria-label, and so contains "aria-label".
    expect(code("src/components/charts/Sparkline.tsx")).not.toContain("aria-label=");
  });
});
