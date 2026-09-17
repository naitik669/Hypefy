import { describe, it, expect } from "vitest";
import { groupNotifs, type Notif } from "@/app/(app)/notifications/page";

const follow = (id: string, who: string, at: string): Notif => ({
  id,
  type: "follow",
  target_type: "profile",
  target_id: "me",
  actor_id: who,
  body: "followed you",
  is_read: true,
  created_at: at,
  actor: { display_name: who, username: who, avatar_hue: 1, avatar_url: null },
});

/**
 * Rows that share a type and target collapse into "Aman and 4 others", but
 * only within a day of the newest one. Every follow has the same target, so
 * without that a follow today counted everyone who had ever followed you.
 */
describe("notification grouping", () => {
  it("groups follows from the same day", () => {
    const groups = groupNotifs([
      follow("1", "aman", "2026-09-17T10:00:00Z"),
      follow("2", "leo", "2026-09-17T08:00:00Z"),
      follow("3", "zoe", "2026-09-16T12:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].actorCount).toBe(3);
  });

  it("leaves last month's follows out of today's row", () => {
    const groups = groupNotifs([
      follow("1", "aman", "2026-09-17T10:00:00Z"),
      ...["a", "b", "c", "d", "e"].map((w, i) => follow(`old${i}`, w, `2026-08-1${i}T10:00:00Z`)),
    ]);
    expect(groups[0].actorCount).toBe(1);
    expect(groups[0].actors[0].username).toBe("aman");
    // The old ones are still there, as rows of their own further down.
    expect(groups.slice(1).reduce((sum, g) => sum + g.actorCount, 0)).toBe(5);
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });
});
