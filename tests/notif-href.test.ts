import { describe, it, expect } from "vitest";
import { notifHref, type Notif } from "@/app/(app)/notifications/page";

const n = (over: Partial<Notif>): Notif => ({
  id: "n1",
  type: "hype_post",
  target_type: "post",
  target_id: "t1",
  actor_id: "a1",
  body: null,
  is_read: false,
  created_at: "2026-09-05T00:00:00Z",
  actor: { display_name: "Aman", username: "aman", avatar_hue: 200, avatar_url: null },
  ...over,
});

/**
 * Every row is a full-width Link with hover styling, so "#" is not a no-op a
 * reader can detect — it looks tappable and does nothing. These are the exact
 * (type, target_type) pairs that exist in the production table.
 */
describe("notifHref — every combination that exists in production", () => {
  const cases: [string, Partial<Notif>, string][] = [
    ["hype_post → the post", { type: "hype_post", target_type: "post" }, "/p/t1"],
    ["follow → their profile", { type: "follow", target_type: "profile" }, "/u/aman"],
    ["hype_shot → the Shot", { type: "hype_shot", target_type: "shot" }, "/shots/t1"],
    ["comment_post → the post", { type: "comment_post", target_type: "post" }, "/p/t1"],
    ["comment_post on a Shot", { type: "comment_post", target_type: "shot" }, "/shots/t1"],
    ["comment_shot → the Shot", { type: "comment_shot", target_type: "shot" }, "/shots/t1"],
    ["comment_reply → the post", { type: "comment_reply", target_type: "post" }, "/p/t1"],
    ["new_message → the thread", { type: "new_message", target_type: "conversation" }, "/messages/t1"],
    ["dm_post_shared → the thread", { type: "dm_post_shared", target_type: "conversation" }, "/messages/t1"],
  ];
  for (const [name, over, expected] of cases) {
    it(name, () => expect(notifHref(n(over))).toBe(expected));
  }

  it("hyped-your-Show goes to the Show, not nowhere", () => {
    // Six of these exist and every one was a dead tap: there was no `show`
    // branch at all, despite the thumbnail already being fetched for it.
    expect(notifHref(n({ type: "hype_shot", target_type: "show" }))).toBe("/shows/t1");
  });

  it("hyped-your-comment goes to the comment, not just the post", () => {
    // A comment is not a route, so these returned "#". The parent is resolved
    // alongside the thumbnails, and ?comment= makes the post page open the
    // thread on the right row rather than leaving you to find it.
    expect(
      notifHref(n({ type: "hype_comment", target_type: "comment", parent: { kind: "post", id: "p9" } })),
    ).toBe("/p/p9?comment=t1");
    expect(
      notifHref(n({ type: "hype_comment", target_type: "comment", parent: { kind: "shot", id: "s9" } })),
    ).toBe("/shots/s9");
  });

  it("a call opens the conversation, not the call log", () => {
    // The conversation id was already sitting in target_id.
    expect(notifHref(n({ type: "incoming_call", target_type: "conversation" }))).toBe("/messages/t1");
    expect(notifHref(n({ type: "missed_call", target_type: "conversation" }))).toBe("/messages/t1");
  });

  it("falls back to the call log only when there is no conversation", () => {
    expect(notifHref(n({ type: "missed_call", target_id: null }))).toBe("/calls");
  });

  it("a reaction to your status opens YOUR profile", () => {
    // It used to open the reactor's profile, where your status is not.
    expect(notifHref(n({ type: "note_reaction", target_type: "profile" }))).toBe("/profile");
  });

  it("still refuses to invent a link for a follow with no username", () => {
    expect(notifHref(n({ type: "follow", actor: null }))).toBe("#");
  });

  it("a comment whose parent could not be resolved does not pretend", () => {
    expect(notifHref(n({ type: "hype_comment", target_type: "comment", parent: null }))).toBe("#");
  });
});
