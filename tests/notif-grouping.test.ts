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

it("counts people by account, not by the name they show", () => {
    // Two different people, both called Sam, neither with a username yet.
    const sam = (id: string, account: string): Notif => ({
      ...follow(id, account, "2026-09-17T10:00:00Z"),
      actor: { display_name: "Sam", username: null, avatar_hue: 1, avatar_url: null },
    });
    const groups = groupNotifs([sam("1", "account-a"), sam("2", "account-b")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].actorCount).toBe(2);
    // And the same person twice is still one person.
    expect(groupNotifs([sam("1", "account-a"), sam("2", "account-a")])[0].actorCount).toBe(1);
  });

  it("keeps every comment and mention as its own row, with its own words", () => {
    const said = (id: string, type: string, who: string, body: string): Notif => ({
      id, type, target_type: "post", target_id: "p1", actor_id: who, body, is_read: false,
      created_at: "2026-09-17T10:00:00Z",
      actor: { display_name: who, username: who, avatar_hue: 1, avatar_url: null },
    });
    const groups = groupNotifs([
      said("1", "comment_post", "aman", "commented: where is this?"),
      said("2", "comment_post", "leo", "commented: take me next time"),
      said("3", "mention_post", "zoe", "mentioned you"),
      said("4", "mention_post", "ira", "mentioned you"),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.body)).toEqual([
      "commented: where is this?", "commented: take me next time", "mentioned you", "mentioned you",
    ]);
    // Hypes on the same post still fold together.
    const hypes = groupNotifs([
      said("5", "hype_post", "aman", "hyped your post"),
      said("6", "hype_post", "leo", "hyped your post"),
    ]);
    expect(hypes).toHaveLength(1);
    expect(hypes[0].actorCount).toBe(2);
  });
});
