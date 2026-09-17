import { describe, it, expect } from "vitest";
import {
  kindOn,
  levelOf,
  levelValue,
  needsYou,
  pauseEnd,
  pausedUntil,
  sectionOf,
  spotlightDecision,
} from "@/lib/activity-prefs";
import { notifHref, shownNotifs, type Notif } from "@/app/(app)/notifications/page";

const n = (over: Partial<Notif>): Notif => ({
  id: Math.random().toString(36).slice(2),
  type: "hype_post",
  target_type: "post",
  target_id: "t1",
  actor_id: "a1",
  body: null,
  is_read: true,
  created_at: "2026-09-17T10:00:00Z",
  actor: { display_name: "Riya", username: "riya", avatar_hue: 200, avatar_url: null },
  ...over,
});

/** The Tune sheet, as the Activity screen reads it. */
describe("activity preferences", () => {
  it("reads levels the way the server stores them", () => {
    expect(levelOf({}, "hypes")).toBe("all");
    expect(levelOf({ hypes: false }, "hypes")).toBe("off");
    expect(levelOf({ hypes: "highlights" }, "hypes")).toBe("highlights");
    expect(levelValue("all")).toBeNull();
    expect(levelValue("off")).toBe(false);
  });

  it("keeps each new kind's default until it is chosen", () => {
    expect(kindOn({}, "milestones")).toBe(true);
    expect(kindOn({}, "shows_posted")).toBe(false);
    expect(kindOn({ milestones: false }, "milestones")).toBe(false);
    expect(spotlightDecision({})).toBe("ask");
    expect(spotlightDecision({ spotlight_pages: true })).toBe("yes");
  });

  it("ends a break when it should", () => {
    const now = new Date(2026, 8, 17, 22, 30);
    expect(pauseEnd("hour", now).getHours()).toBe(23);
    const tomorrow = pauseEnd("tomorrow", now);
    expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([18, 8]);
    expect(pausedUntil({ paused_until: new Date(2026, 8, 17, 21).toISOString() }, now)).toBeNull();
    expect(pausedUntil({ paused_until: tomorrow.toISOString() }, now)).toEqual(tomorrow);
  });

  it("files rows under Today, This week and Earlier", () => {
    const now = new Date(2026, 8, 17, 12);
    expect(sectionOf(new Date(2026, 8, 17, 1).toISOString(), now)).toBe("today");
    expect(sectionOf(new Date(2026, 8, 14).toISOString(), now)).toBe("week");
    expect(sectionOf(new Date(2026, 7, 1).toISOString(), now)).toBe("earlier");
  });

  it("puts what asks for an answer under Needs you", () => {
    expect(needsYou("follow_request", true)).toBe(true);
    expect(needsYou("comment_reply", false)).toBe(true);
    expect(needsYou("comment_reply", true)).toBe(false);
    expect(needsYou("hype_post", false)).toBe(false);
  });
});

describe("what Activity shows", () => {
  it("hides a kind switched off, and muted people, but never their messages", () => {
    const list = [
      n({ type: "hype_post" }),
      n({ type: "follow", actor_id: "m" }),
      n({ type: "new_message", target_type: "conversation", actor_id: "m" }),
    ];
    const shown = shownNotifs(list, { hypes: false, muted: ["m"] });
    expect(shown.map((x) => x.type)).toEqual(["new_message"]);
  });

  it("holds Spotlight pages back until someone says Interested", () => {
    const list = [n({ type: "spotlight_page", target_type: "profile", target_id: "u1" })];
    expect(shownNotifs(list, {})).toHaveLength(0);
    expect(shownNotifs(list, { spotlight_pages: false })).toHaveLength(0);
    expect(shownNotifs(list, { spotlight_pages: true })).toHaveLength(1);
  });

  it("opens Spotlight on that friend's page", () => {
    expect(notifHref(n({ type: "spotlight_page", target_type: "profile", target_id: "u1" }))).toBe(
      "/messages/spotlight?page=u1",
    );
  });
});
