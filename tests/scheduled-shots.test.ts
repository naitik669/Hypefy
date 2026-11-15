import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { scheduleState } from "@/lib/post-compose";

/**
 * A Shot can be set to go up later.
 *
 * Posts have had this since 0017 and Shots never did, which is the wrong
 * way round if anything: a Shot is the thing people film in the evening
 * and want out when somebody is awake.
 *
 * The part worth repeating from 0017: the media is uploaded NOW and only
 * the row waits. A phone that is off at the scheduled minute cannot send
 * fifty megabytes, so deferring the file would mean a scheduled Shot that
 * silently never happened.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const m = read("supabase/migrations/0211_scheduled_shots.sql");
const up = read("src/components/upload/UploadProvider.tsx");
const preview = read("src/components/create/ShotPreview.tsx");
const list = read("src/components/post/ScheduledList.tsx");
const page = read("src/app/(app)/create/scheduled/page.tsx");

describe("the row waits, not the file", () => {
  it("the table holds URLs, not a clip", () => {
    expect(m).toContain("media_url     text not null");
    expect(m).toContain("poster_url    text");
  });

  it("and the upload sends the media before deferring anything", () => {
    // Inside uploadShot specifically. Searching the whole file found the
    // POST path's scheduled branch, which sits earlier and proved nothing
    // about this one.
    const fn = up.slice(up.indexOf("const uploadShot = useCallback"));
    const upload = fn.indexOf('.from("shot-media")');
    const branch = fn.indexOf("if (a.scheduledAt) {");
    expect(upload).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(upload);
  });

  it("writing to its own table rather than shots", () => {
    expect(up).toContain('supabase.from("scheduled_shots").insert(');
  });
});

describe("nothing is dropped on the way across", () => {
  it("the audience survives, which is the third time this could have gone wrong", () => {
    // 0035 had to add aspect_ratio in both places, 0209 media, and 0210
    // gave Shots an audience an hour before this. A scheduled Shot that
    // lost it would publish to everybody.
    expect(m).toContain("audience      text not null default 'everyone'");
    const fn = m.slice(m.indexOf("function public.publish_due_scheduled_shots"));
    const returning = fn.slice(fn.indexOf("returning"), fn.indexOf("), ins as ("));
    expect(returning).toContain("audience");
    const insert = fn.slice(fn.indexOf("insert into public.shots"));
    expect(insert.slice(0, 400)).toContain("audience");
  });

  it("and the trim and track come too", () => {
    for (const col of ["trim_start", "trim_end", "track", "duration_secs"]) {
      expect(m, col).toContain(col);
    }
    expect(up).toContain("...trimToStore(a.trim, a.duration),");
  });

  it("an unknown audience cannot be parked in the table either", () => {
    expect(m).toContain("check (audience in ('everyone', 'hypers'))");
  });
});

describe("publishing", () => {
  it("moves the row rather than copying and marking it", () => {
    // One statement: there is no state where a Shot is published and its
    // scheduled row still looks due, and no way to publish it twice.
    const fn = m.slice(m.indexOf("function public.publish_due_scheduled_shots"));
    expect(fn).toContain("delete from public.scheduled_shots");
    expect(fn).toContain("returning");
    expect(fn).not.toContain("update public.scheduled_shots");
  });

  it("is cron-only", () => {
    expect(m).toContain(
      "revoke all on function public.publish_due_scheduled_shots() from public, anon, authenticated",
    );
  });

  it("and the job is declared in the migration", () => {
    expect(m).toMatch(/^\s*select cron\.schedule\(/m);
    expect(m).toMatch(/^\s*'publish-scheduled-shots',/m);
  });

  it("with ops_readiness taught to expect it", () => {
    // A job nobody expects is a job nobody notices has stopped — the same
    // point 0200 made about the stats job.
    const fn = m.slice(m.indexOf("function public.ops_readiness"));
    expect(fn).toContain("'publish-scheduled-shots'");
    // And the ones that were already expected are still expected.
    for (const job of ["publish-scheduled-posts", "prune-retention", "reap-expired-shows"]) {
      expect(fn, job).toContain(`'${job}'`);
    }
  });
});

describe("you can only touch your own", () => {
  it("read, insert and delete are all gated on it", () => {
    for (const verb of ["own read", "own insert", "own delete"]) {
      expect(m, verb).toContain(`"scheduled_shots: ${verb}"`);
    }
    expect((m.match(/\(select auth\.uid\(\)\) = user_id/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("and there is no update, so it can be cancelled but not edited", () => {
    // Editing would mean re-uploading media against a row whose old
    // objects nothing would clean up. Delete and make another.
    expect(m).not.toContain("for update");
    expect(m).toContain("grant select, insert, delete on public.scheduled_shots to authenticated");
  });
});

describe("the composer", () => {
  it("offers a time", () => {
    expect(preview).toContain("<SchedulePicker");
    expect(preview).toContain("scheduledAt: scheduleAt,");
  });

  it("checks it has not passed at the moment you press, not only when you picked", () => {
    // A composer left open for ten minutes carries a stale time, and a
    // Shot scheduled for the past publishes on the next minute with no
    // warning at all.
    expect(preview).toContain("scheduleState(scheduleAt)");
    expect(preview).toContain('when === "passed"');
  });

  it("and the margin is real rather than zero", () => {
    // The constant is module-private, so this checks the behaviour it
    // causes: a time a few seconds out is not far enough ahead to count.
    expect(scheduleState(new Date(Date.now() + 5_000).toISOString())).toBe("passed");
    expect(scheduleState(new Date(Date.now() + 60_000).toISOString())).toBe("ok");
    expect(scheduleState(new Date(Date.now() - 1000).toISOString())).toBe("passed");
    expect(scheduleState(null)).toBe("none");
  });

  it("and says it will schedule rather than post", () => {
    expect(preview).toContain('scheduleAt ? "Schedule" : "Post Shot"');
  });
});

describe("you can see and cancel it", () => {
  it("the list loads both kinds", () => {
    // A scheduled Shot you could not see here is one you could not cancel.
    expect(page).toContain('.from("scheduled_shots")');
    expect(page).toContain('.from("scheduled_posts")');
  });

  it("merged by when they go up, not grouped by kind", () => {
    expect(page).toContain("a.scheduledAt.localeCompare(b.scheduledAt)");
  });

  it("and cancelling deletes from the right table", () => {
    // Deleting a Shot's id from scheduled_posts succeeds and removes
    // nothing, so it would publish anyway after the list said otherwise.
    expect(list).toContain('post.kind === "shot" ? "scheduled_shots" : "scheduled_posts"');
  });
});
