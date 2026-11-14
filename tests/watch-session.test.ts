import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  COMPLETE_AT,
  MAX_TICK_SEC,
  REPLAY_BACK_SEC,
  advanceWatch,
  completionOf,
  startWatch,
  watchedToEnd,
  worthRecording,
} from "@/lib/watch-session";

/**
 * How much of a Shot somebody watched.
 *
 * shot_views answered "did they see it that day" and nothing more. For
 * short video that is the least interesting question: whether people watch
 * eight seconds of a nine-second clip or bail at two is what tells an
 * author what to make next, and nothing in the app could answer it.
 *
 * The arithmetic is pure so it can be tested without a video element, a
 * browser or a clock, and it runs on the player's currentTime rather than
 * wall-clock — a paused or buffering video keeps the wall running and
 * stops the playhead, and what is wanted is footage watched.
 */

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

/** Play straight through from 0 at the rate timeupdate actually fires. */
function playThrough(toSec: number, step = 0.25) {
  let s = startWatch();
  for (let t = 0; t <= toSec + 1e-9; t += step) s = advanceWatch(s, t);
  return s;
}

describe("counting footage, not seconds endured", () => {
  it("adds up ordinary playback", () => {
    const s = playThrough(4);
    expect(Math.round(s.watchedMs)).toBe(4000);
    expect(s.furthestSec).toBeCloseTo(4, 5);
  });

  it("ignores a seek forward, which nobody watched", () => {
    let s = startWatch();
    s = advanceWatch(s, 0);
    s = advanceWatch(s, 0.25);
    s = advanceWatch(s, 30); // dragged the scrubber
    // The quarter second before the drag counts; the jump does not.
    expect(Math.round(s.watchedMs)).toBe(250);
    // But they did reach 30s, so completion knows about it.
    expect(s.furthestSec).toBe(30);
  });

  it("and does not count a stall or a backgrounded tab as watching", () => {
    let s = startWatch();
    s = advanceWatch(s, 0);
    // A gap larger than a tick: the picture was not moving for the viewer.
    s = advanceWatch(s, MAX_TICK_SEC + 0.5);
    expect(s.watchedMs).toBe(0);
  });

  it("counts a loop back to the start as a replay", () => {
    let s = startWatch();
    s = advanceWatch(s, 8);
    s = advanceWatch(s, 0); // trimmed Shots loop by resetting currentTime
    expect(s.replays).toBe(1);
    expect(s.furthestSec).toBe(8);
  });

  it("but not a nudge backwards", () => {
    // A fixed 100ms, not REPLAY_BACK_SEC/2. Deriving the input from the
    // constant under test made this move with it: shrinking the threshold
    // to 0.0001 shrank the nudge too and the test still passed.
    let s = startWatch();
    s = advanceWatch(s, 5);
    s = advanceWatch(s, 4.9);
    expect(s.replays).toBe(0);
  });

  it("and the threshold stays in a range where that holds", () => {
    // Below ~0.3s a normal seek-back jitter would register as a replay;
    // above ~2s a genuine loop on a short clip would not.
    expect(REPLAY_BACK_SEC).toBeGreaterThan(0.3);
    expect(REPLAY_BACK_SEC).toBeLessThan(2);
  });

  it("and survives a player handing it nonsense", () => {
    let s = startWatch();
    s = advanceWatch(s, NaN);
    s = advanceWatch(s, -3);
    expect(s.watchedMs).toBe(0);
    expect(s.lastSec).toBe(null);
  });
});

describe("how far through they got", () => {
  it("is measured from the furthest point, not from time watched", () => {
    // Watching the first half twice is not watching all of it...
    let s = startWatch();
    for (const t of [0, 0.25, 0.5, 0, 0.25, 0.5]) s = advanceWatch(s, t);
    expect(completionOf(s, 10)).toBeCloseTo(0.05, 5);

    // ...and skipping to the end is not watching it either, but they did
    // reach the end, which is what completion is about.
    let j = startWatch();
    j = advanceWatch(j, 0);
    j = advanceWatch(j, 10);
    expect(completionOf(j, 10)).toBe(1);
    expect(j.watchedMs).toBe(0);
  });

  it("says nothing when the duration is unknown", () => {
    // A ratio against an unknown denominator is worse than no ratio.
    const s = playThrough(4);
    expect(completionOf(s, 0)).toBe(0);
    expect(completionOf(s, NaN)).toBe(0);
  });

  it("never exceeds one, however long they linger", () => {
    const s = playThrough(20);
    expect(completionOf(s, 10)).toBe(1);
  });

  it("counts the end as reached without demanding the last frame", () => {
    const s = playThrough(9.6, 0.4); // 96% of a ten-second clip
    expect(watchedToEnd(s, 10)).toBe(true);
    expect(COMPLETE_AT).toBeLessThan(1);
    const bailed = playThrough(5);
    expect(watchedToEnd(bailed, 10)).toBe(false);
  });
});

describe("what is worth a round trip", () => {
  it("not a reel the thumb flicked past", () => {
    // These would be most of the rows and none of the information.
    expect(worthRecording(playThrough(0.5))).toBe(false);
  });

  it("but anything that counted as a view", () => {
    // The floor matches WATCH_MS in lib/watched, so a Shot counted as
    // viewed is a Shot whose watch time is recorded; the two tables cannot
    // disagree about what happened.
    const watched = read("src/lib/watched.ts");
    expect(watched).toContain("WATCH_MS = 1200");
    // Built to land exactly on the threshold. playThrough(1.2, 0.25) stops
    // at 1.0s because the step does not divide 1.2, which is how this test
    // failed first time round — the helper, not the code.
    let s = startWatch();
    for (const t of [0, 0.6, 1.2]) s = advanceWatch(s, t);
    expect(Math.round(s.watchedMs)).toBe(1200);
    expect(worthRecording(s)).toBe(true);
  });
});

describe("the player and the server", () => {
  const reels = read("src/components/shots/ReelsFeed.tsx");

  it("folds the playhead in on timeupdate", () => {
    expect(reels).toContain("advanceWatch(watch.current, v.currentTime - from)");
  });

  it("measures against the trimmed window, not the file", () => {
    // The author chose nine seconds out of a minute, so watching those
    // nine is watching all of it.
    expect(reels).toContain("watchWindow.current = to - from");
  });

  it("sends once, on the way out, rather than per tick", () => {
    // timeupdate fires ~4x a second; this component already runs a story
    // clock, a video and a song.
    expect(reels).toContain('supabase.rpc("record_shot_watch"');
    expect(reels).toContain("flushWatch()");
  });

  it("and survives the app being backgrounded", () => {
    // The common way a session ends on a phone, and it fires no unmount.
    expect(reels).toContain('addEventListener("visibilitychange", onHide)');
    expect(reels).toContain('addEventListener("pagehide", onHide)');
  });
});

describe("the table and the function", () => {
  const m = read("supabase/migrations/0202_shot_watch_time.sql");

  it("the client never writes the table directly", () => {
    // A browser upsert would need a select policy for the row it reads
    // back, which is the trap that broke avatar uploads (0196).
    expect(m).toContain("revoke all on public.shot_watch_stats from authenticated");
    expect(m).toContain("grant select on public.shot_watch_stats to authenticated");
    expect(m).not.toMatch(/grant insert[^;]*shot_watch_stats/);
    expect(m).not.toMatch(/grant update[^;]*shot_watch_stats/);
  });

  it("watching your own Shot is not watch time", () => {
    // An author checking their own reel would otherwise be most of it.
    expect(m).toContain("s.user_id <> v_me");
  });

  it("every number from the browser is clamped", () => {
    // watched_ms is computed by the client, so it is a number the client
    // can be wrong about.
    for (const v of ["v_dur", "v_watched", "v_completion", "v_replays"]) {
      expect(m, v).toMatch(new RegExp(`${v}\\s*:?=\\s*least\\(greatest\\(`));
    }
  });

  it("and the author's view is counts, not names", () => {
    const summary = m.slice(m.indexOf("function public.shot_watch_summary"));
    expect(summary).toContain("s.user_id = (select auth.uid())");
    expect(summary).not.toContain("profiles");
  });

  it("the rows are pruned like every other impression table", () => {
    const prune = read("supabase/migrations/0203_watch_stats_are_pruned_too.sql");
    expect(prune).toContain("delete from public.shot_watch_stats");
    expect(prune).toContain("keep_days constant int := 180");
  });
});
