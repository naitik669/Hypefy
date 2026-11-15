import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  PREPARE_PCT,
  START_PCT,
  STORE_PCT,
  creepCeiling,
  measurable,
  storedPercent,
  uploadLabel,
} from "@/lib/upload-progress";
import {
  MAX_SHOW_SECS,
  MAX_SHOT_SECS,
  clampTrim,
  defaultTrim,
  needsTrim,
} from "@/lib/shot-trim";
import { SHOW_VIDEO_MAX_MS } from "@/lib/show-media";

/**
 * The last of the five-phase pass: comments closed at compose time, a video
 * Show that picks which part plays, one honest upload surface, and the
 * dashboard's ARIA corrected.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** Comments stripped, so prose about a guarantee cannot pass for one. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const provider = code("src/components/upload/UploadProvider.tsx");
const composer = code("src/components/post/PostComposer.tsx");
const shotPreview = code("src/components/create/ShotPreview.tsx");
const createScreen = code("src/components/create/CreateScreen.tsx");
const publish = code("src/lib/show-publish.ts");
const tabs = code("src/components/creator/CreatorTabs.tsx");
const activity = code("src/components/profile/ActivityScreen.tsx");
const sheet = code("src/components/creator/ItemDetailSheet.tsx");
const m215 = read("supabase/migrations/0215_comments_off_before_it_goes_up.sql");
const m216 = read("supabase/migrations/0216_a_show_picks_which_part_plays.sql");

describe("comments can be closed before it goes up", () => {
  it("both composers offer it", () => {
    expect(composer).toContain("const [closeComments, setCloseComments] = useState(false);");
    expect(shotPreview).toContain("const [closeComments, setCloseComments] = useState(false);");
  });

  it("and it reaches the upload, not just the screen", () => {
    // A switch wired to nothing is worse than no switch: it reads as a
    // promise that the post was closed.
    expect(composer).toContain("commentsOff: closeComments,");
    expect(shotPreview).toContain("commentsOff: closeComments,");
  });

  it("applied through the definer function, because the column is read-only", () => {
    // posts.comments_off and shots.comments_off are SELECT-only for
    // authenticated on purpose — only set_comments_off may change them — so
    // putting it in the insert would be silently dropped or refused.
    expect(provider).toContain('setCommentsOff(supabase, "post", created.id, true)');
    expect(provider).toContain('setCommentsOff(supabase, "shot", createdShot.id, true)');
    expect(provider).not.toContain("comments_off: !!a.commentsOff,\n        hashtags");
  });

  it("and only when it was asked for", () => {
    // The column already defaults to open, so an unconditional call is a
    // wasted round trip on every post anybody makes.
    expect((provider.match(/if \(a\.commentsOff\) await setCommentsOff/g) ?? [])).toHaveLength(2);
  });

  it("a scheduled one carries the choice instead of applying it", () => {
    // Its row in posts does not exist yet, so there is nothing to call
    // set_comments_off against until pg_cron makes one.
    expect(provider).toContain("comments_off: !!a.commentsOff");
    expect(m215).toContain("alter table public.scheduled_posts");
    expect(m215).toContain("alter table public.scheduled_shots");
    expect(m215).toContain("add column if not exists comments_off boolean not null default false");
  });

  it("and the publishers carry it through to the real row", () => {
    // The quiet failure: the column is written, the publisher never selects
    // it, and a post scheduled with comments off comes up open.
    for (const fn of ["publish_due_scheduled_posts", "publish_due_scheduled_shots"]) {
      const at = m215.indexOf(`function public.${fn}`);
      expect(at, fn).toBeGreaterThan(-1);
      const body = m215.slice(at, m215.indexOf("$function$;", at));
      // Twice: once in the delete's returning list, once in the insert.
      expect((body.match(/comments_off/g) ?? []).length, fn).toBeGreaterThanOrEqual(3);
    }
  });

  it("and survives an upload that had to be resumed", () => {
    // keepPending is a hand-written mirror of the action, so a field added
    // to one and not the other is lost on resume — the post comes back up
    // with comments open and nothing says why.
    const pending = read("src/lib/pending-upload.ts");
    expect((pending.match(/commentsOff: boolean;/g) ?? [])).toHaveLength(2);
    // Two of each, counted separately because they are different shapes for
    // different destinations: the camelCase pair is what keepPending stores
    // for a resume, the snake_case pair is what the two scheduled tables get.
    expect((provider.match(/commentsOff: !!a\.commentsOff,/g) ?? [])).toHaveLength(2);
    expect((provider.match(/comments_off: !!a\.commentsOff,?/g) ?? [])).toHaveLength(2);
  });

  it("but not on a Show, which has no such column", () => {
    // A Show's comments are replies: a different table and a different
    // control, so a switch here would silently do nothing.
    expect(publish).not.toContain("comments_off");
  });
});

describe("a video Show picks which part plays", () => {
  it("the editor's limit matches what the viewer will actually play", () => {
    // The two disagreeing would mean choosing a window the viewer ignores,
    // which is worse than not offering the choice at all.
    expect(MAX_SHOW_SECS).toBe(SHOW_VIDEO_MAX_MS / 1000);
    expect(MAX_SHOW_SECS).toBeLessThan(MAX_SHOT_SECS);
  });

  it("and the limit is threaded through rather than hardcoded twice", () => {
    expect(defaultTrim(120, MAX_SHOW_SECS)).toEqual({ start: 0, end: 30 });
    expect(defaultTrim(120)).toEqual({ start: 0, end: 60 });
    expect(needsTrim(45, MAX_SHOW_SECS)).toBe(true);
    expect(needsTrim(45)).toBe(false);
  });

  it("a window longer than the limit is pulled back to it", () => {
    expect(clampTrim(0, 90, 120, MAX_SHOW_SECS)).toEqual({ start: 0, end: 30 });
    expect(clampTrim(10, 90, 120, MAX_SHOW_SECS)).toEqual({ start: 10, end: 40 });
    // And the Shot default is untouched by any of it.
    expect(clampTrim(0, 90, 120)).toEqual({ start: 0, end: 60 });
  });

  it("a video Show reaches the editor; a photo one still goes to arrange", () => {
    expect(createScreen).toContain(
      'if (captured && !captioning && (mode !== "show" || isVideoFile(captured))) {',
    );
    expect(createScreen).toContain(
      'if (captured && mode === "show" && !isVideoFile(captured) && arranged === null) {',
    );
  });

  it("and is given the Show's limit, not the Shot's", () => {
    expect(createScreen).toContain('maxSecs={mode === "show" ? MAX_SHOW_SECS : MAX_SHOT_SECS}');
  });

  it("the chosen window reaches the row", () => {
    expect(shotPreview).toContain("trim: edit?.trim ?? null,");
    expect(publish).toContain("trimToStore(d.trim, d.duration)");
  });

  it("and the still is taken at the frame it starts on", () => {
    // A picture of second 0 on a Show that begins at 0:40 is a picture of
    // something else.
    expect(publish).toContain("capturePoster(localUrl, d.trim?.start ?? null)");
  });

  it("a whole clip is stored as no bound, not as 0-to-duration", () => {
    // Null is what every Show before this already says, so the viewer has
    // one case to handle rather than two that mean the same thing.
    expect(m216).toContain("add column if not exists trim_start numeric(9,3)");
    expect(m216).not.toContain("not null default 0");
  });

  it("the columns are granted, which a new column on shows is not", () => {
    // Verified against production: without these the column is unwritable
    // and the trim is silently dropped. Same trap poster_url hit in 0213.
    expect(m216).toContain("grant select (trim_start, trim_end) on public.shows to anon, authenticated");
    expect(m216).toContain("grant insert (trim_start, trim_end) on public.shows to authenticated");
  });

  it("and an inverted window is refused by the database, not just by the UI", () => {
    expect(m216).toContain("shows_trim_range_valid");
    expect(m216).toContain("trim_end > trim_start");
  });

  it("the query asks for them, or every trimmed Show plays from the start", () => {
    const page = read("src/app/(app)/shows/[showId]/page.tsx");
    expect(page).toMatch(/trim_start, trim_end/);
  });
});

describe("upload progress is weighted by bytes", () => {
  const sizes = [200_000, 200_000, 200_000, 9_000_000];

  it("four files of wildly different size do not report by count", () => {
    // The old arithmetic: 10 + ((i + 1) / n) * 72. Three small photos out
    // of four reported three quarters done with nine tenths of the bytes
    // still to send, and then sat there.
    const byCount = PREPARE_PCT + STORE_PCT * (3 / 4);
    const byBytes = storedPercent(sizes, 3);
    expect(byBytes).toBeLessThan(byCount);
    expect(byBytes).toBeLessThan(PREPARE_PCT + STORE_PCT * 0.1);
  });

  it("nothing stored is the prepare share, everything stored is all of it", () => {
    expect(storedPercent(sizes, 0)).toBe(PREPARE_PCT);
    expect(storedPercent(sizes, 4)).toBe(PREPARE_PCT + STORE_PCT);
    expect(PREPARE_PCT + STORE_PCT).toBeLessThan(100);
  });

  it("and it never runs past the end, however many it is told are done", () => {
    expect(storedPercent(sizes, 99)).toBe(PREPARE_PCT + STORE_PCT);
    expect(storedPercent(sizes, -3)).toBe(PREPARE_PCT);
  });

  it("sizes that cannot be weighted fall back to counting, not to NaN", () => {
    // A Blob from a canvas, or a file read back from IndexedDB, can report
    // zero — and dividing by a total of nought is how a bar becomes NaN%.
    expect(measurable([0, 0])).toBe(false);
    expect(measurable([])).toBe(false);
    expect(measurable([0, 5])).toBe(true);
    const even = storedPercent([0, 0, 0, 0], 2);
    expect(Number.isFinite(even)).toBe(true);
    expect(even).toBe(PREPARE_PCT + STORE_PCT / 2);
  });

  it("the creep stops short of the next real milestone", () => {
    // It used to run to 90% whatever was happening, so a bar at 88% might
    // have had one byte left or eight megabytes.
    for (let done = 0; done < sizes.length; done++) {
      const ceiling = creepCeiling(sizes, done);
      expect(ceiling).toBeGreaterThan(storedPercent(sizes, done));
      expect(ceiling).toBeLessThan(storedPercent(sizes, done + 1));
    }
  });

  it("so a small file's creep covers little and a big one's covers a lot", () => {
    const small = creepCeiling(sizes, 0) - storedPercent(sizes, 0);
    const big = creepCeiling(sizes, 3) - storedPercent(sizes, 3);
    expect(big).toBeGreaterThan(small * 10);
  });

  it("and the provider uses it rather than keeping its own arithmetic", () => {
    expect(provider).toContain("storedPercent(sizes, i + 1)");
    expect(provider).toContain("startTrickle(creepCeiling(sizes, i))");
    expect(provider).not.toContain("a.files.length) * 72");
    expect(provider).not.toContain("p >= 90");
  });

  it("the bar does not start at zero while a 9MB photo is being hashed", () => {
    expect(START_PCT).toBeGreaterThan(0);
    expect(START_PCT).toBeLessThan(PREPARE_PCT);
    expect(provider).toContain("setProgress(START_PCT)");
  });

  it("and what it says names the right thing", () => {
    expect(uploadLabel("shot")).toContain("Shot");
    expect(uploadLabel("post")).toContain("post");
    expect(uploadLabel("post", true)).toContain("Scheduling");
  });
});

describe("the dashboard's tab strip is what it actually is", () => {
  it("navigation links, not an ARIA tab widget", () => {
    // role="tab" commits the author to arrow-key navigation, a roving
    // tabindex, and a tabpanel tied by aria-controls. None of that is here
    // and none of it can be: these are links that load a page. A screen
    // reader announced "tab, selected", the user pressed the arrows, and
    // nothing happened.
    for (const [name, src] of [
      ["creator", tabs],
      ["activity", activity],
    ] as const) {
      expect(src, name).not.toContain('role="tablist"');
      expect(src, name).not.toContain('role="tab"');
      expect(src, name).not.toContain("aria-selected");
      expect(src, name).toContain('aria-current={on ? "page" : undefined}');
      expect(src, name).toMatch(/<nav aria-label="/);
    }
  });

  it("and the strip still says which one is on", () => {
    // Dropping the ARIA without putting anything in its place would pass
    // every assertion above and leave the state unannounced.
    expect((tabs.match(/aria-current=/g) ?? [])).toHaveLength(1);
    expect((activity.match(/aria-current=/g) ?? [])).toHaveLength(1);
  });

  it("the sort chips stay aria-pressed, because they really are toggles", () => {
    const list = code("src/components/creator/ContentList.tsx");
    expect(list).toContain("aria-pressed={on}");
  });

  it("and the detail sheet reads its numbers as the pairs they are", () => {
    // Loose runs of text otherwise: "Views" and "2,087" with nothing
    // joining them.
    expect(sheet).toContain("<dl className=");
    expect(sheet).toContain("<dt className=");
    expect(sheet).toContain("<dd className=");
    // A bare <p> inside a <dl> is invalid markup.
    expect(sheet).not.toMatch(/<dl[\s\S]*?<p /);
  });
});
