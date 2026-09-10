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
