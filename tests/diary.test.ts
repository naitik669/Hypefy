import { describe, it, expect, beforeEach } from "vitest";
import {
  toDiaryEntries,
  timeLeft,
  unseen,
  markSeen,
  loadSeen,
} from "@/lib/diary";

const row = (over: Partial<Record<string, unknown>> = {}) => ({
  user_id: "u1",
  text: "🎧 song on repeat",
  audience: "mutual",
  created_at: "2026-09-10T00:00:00Z",
  is_self: false,
  display_name: "Aman",
  username: "aman",
  avatar_hue: 120,
  avatar_url: null,
  track: null,
  ...over,
});

describe("toDiaryEntries", () => {
  it("maps a get_notes row", () => {
    const [e] = toDiaryEntries([row()] as never);
    expect(e).toMatchObject({ userId: "u1", name: "Aman", hue: 120, isSelf: false });
  });

  it("falls back to the username, then to a placeholder, for a name", () => {
    expect(toDiaryEntries([row({ display_name: null })] as never)[0].name).toBe("aman");
    expect(
      toDiaryEntries([row({ display_name: null, username: null })] as never)[0].name
    ).toBe("Someone");
  });

  it("keeps a real track and drops anything that is not one", () => {
    // set_note refuses a track without id, title and preview, so a row
    // missing one did not come from this app and must not render a player.
    const good = { id: "t", title: "Song", preview: "https://x/p.mp3", artist: "A" };
    expect(toDiaryEntries([row({ track: good })] as never)[0].track).toEqual(good);
    expect(toDiaryEntries([row({ track: { id: "t" } })] as never)[0].track).toBeNull();
    expect(toDiaryEntries([row({ track: "nope" })] as never)[0].track).toBeNull();
  });

  it("treats an unknown audience as mutual, the wider of the two", () => {
    expect(toDiaryEntries([row({ audience: "odd" })] as never)[0].audience).toBe("mutual");
    expect(toDiaryEntries([row({ audience: "close" })] as never)[0].audience).toBe("close");
  });

  it("copes with no rows at all", () => {
    expect(toDiaryEntries(null)).toEqual([]);
  });
});

describe("timeLeft", () => {
  const at = "2026-09-10T00:00:00Z";
  const t0 = new Date(at).getTime();

  it("counts down in hours", () => {
    expect(timeLeft(at, t0)).toBe("24h left");
    expect(timeLeft(at, t0 + 6 * 3_600_000)).toBe("18h left");
  });

  it("switches to minutes in the last hour", () => {
    expect(timeLeft(at, t0 + 23.5 * 3_600_000)).toBe("30m left");
  });

  it("never says 0m", () => {
    expect(timeLeft(at, t0 + 24 * 3_600_000 - 5_000)).toBe("1m left");
  });

  it("says ending once the day is up, rather than a negative number", () => {
    expect(timeLeft(at, t0 + 25 * 3_600_000)).toBe("ending");
  });
});

describe("page type and burn line", () => {
  it("steps the type down as the note gets longer", async () => {
    const { noteSize } = await import("@/components/diary/DiaryPage");
    const sizes = ["HDB", "gym then chai", "who's up for chai at 5 ☕", "x".repeat(40), "y".repeat(58)]
      .map((t) => noteSize(t).size);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeLessThan(sizes[i - 1]);
  });

  it("counts an emoji as one character, not two", async () => {
    const { noteSize } = await import("@/components/diary/DiaryPage");
    // "☕☕☕☕☕☕" is six characters to a reader and twelve UTF-16 units.
    expect(noteSize("☕☕☕☕☕☕").size).toBe(noteSize("abcdef").size);
  });

  it("measures what is left of the day, clamped to 0..1", async () => {
    const { lifeLeft } = await import("@/components/diary/DiaryPage");
    const at = "2026-09-10T00:00:00Z";
    const t0 = new Date(at).getTime();
    expect(lifeLeft(at, t0)).toBe(1);
    expect(lifeLeft(at, t0 + 12 * 3_600_000)).toBeCloseTo(0.5);
    expect(lifeLeft(at, t0 + 30 * 3_600_000)).toBe(0);
    expect(lifeLeft(at, t0 - 3_600_000)).toBe(1);
  });
});

describe("unseen", () => {
  const a = { userId: "a", createdAt: "1", isSelf: false };
  const b = { userId: "b", createdAt: "1", isSelf: false };
  const me = { userId: "me", createdAt: "1", isSelf: true };

  it("counts other people's diaries you have not looked at", () => {
    expect(unseen([a, b], {})).toHaveLength(2);
    expect(unseen([a, b], { a: "1" })).toEqual([b]);
  });

  it("never counts your own", () => {
    expect(unseen([me], {})).toEqual([]);
  });

  it("counts a rewritten diary as new again", () => {
    // The same person keeps their id but gets a new created_at — the reason
    // the map stores the timestamp and not just a flag.
    expect(unseen([{ ...a, createdAt: "2" }], { a: "1" })).toHaveLength(1);
  });
});

describe("markSeen / loadSeen", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips, and forgets people who no longer have a diary", () => {
    localStorage.setItem("hypefy:diary:seen", JSON.stringify({ gone: "x" }));
    markSeen([{ userId: "a", createdAt: "1" }]);
    expect(loadSeen()).toEqual({ a: "1" });
  });

  it("reads corrupt storage as nothing seen", () => {
    localStorage.setItem("hypefy:diary:seen", "{not json");
    expect(loadSeen()).toEqual({});
  });
});

describe("reactions to your Diary", () => {
  it("maps reactor profiles, newest first", async () => {
    const { toReactions } = await import("@/lib/diary");
    const rs = toReactions([
      { emoji: "😂", created_at: "2026-09-10T01:00:00Z", reactor_id: "a", profiles: { display_name: "Aman", username: "aman", avatar_hue: 10, avatar_url: null } },
      { emoji: "❤️", created_at: "2026-09-10T03:00:00Z", reactor_id: "b", profiles: [{ display_name: null, username: "riya", avatar_hue: null, avatar_url: null }] },
    ] as never);
    expect(rs.map((r) => r.userId)).toEqual(["b", "a"]);
    expect(rs[0]).toMatchObject({ name: "riya", hue: 280, emoji: "❤️" });
  });

  it("summarises by emoji, most used first", async () => {
    const { reactionSummary } = await import("@/lib/diary");
    const r = (emoji: string) => ({ emoji }) as never;
    expect(reactionSummary([r("❤️"), r("😂"), r("❤️"), r("❤️")])).toEqual([
      { emoji: "❤️", count: 3 },
      { emoji: "😂", count: 1 },
    ]);
  });
});

describe("archive", () => {
  it("maps rows and keeps only known endings", async () => {
    const { toArchive } = await import("@/lib/diary");
    const [a, b] = toArchive([
      { text: "x", audience: "close", track: null, written_at: "2026-09-09T00:00:00Z", ended_how: "taken_down" },
      { text: "y", audience: "odd", track: { id: "t" }, written_at: "2026-09-08T00:00:00Z", ended_how: "???" },
    ]);
    expect(a).toMatchObject({ audience: "close", endedHow: "taken_down" });
    // An unknown ending is read as the ordinary one, and a malformed track dropped.
    expect(b).toMatchObject({ audience: "mutual", endedHow: "expired", track: null });
  });
});

describe("stories", () => {
  it("play unseen first, then newest, and never include your own", async () => {
    const { storyOrder } = await import("@/lib/diary");
    const e = (userId: string, createdAt: string, isSelf = false) => ({ userId, createdAt, isSelf });
    const order = storyOrder(
      [e("me", "9", true), e("old", "1"), e("new-seen", "8"), e("fresh", "2")],
      new Set(["fresh"])
    ).map((x) => x.userId);
    expect(order).toEqual(["fresh", "new-seen", "old"]);
  });

  it("step forward, and end after the last", async () => {
    const { stepStory } = await import("@/lib/diary");
    expect(stepStory(0, 3, 1)).toBe(1);
    expect(stepStory(2, 3, 1)).toBeNull();
  });

  it("stay on the first when going back from it, rather than closing", async () => {
    const { stepStory } = await import("@/lib/diary");
    expect(stepStory(0, 3, -1)).toBe(0);
    expect(stepStory(2, 3, -1)).toBe(1);
  });

  it("have nowhere to go with nothing to show", async () => {
    const { stepStory } = await import("@/lib/diary");
    expect(stepStory(0, 0, 1)).toBeNull();
  });
});
