import { levelOf, spotlightDecision, type ActivityPrefs, type LevelKey } from "./activity-prefs";
import { notifTarget, type NotifTarget, type TargetableNotif } from "./notif-target";

/**
 * What Activity shows, and how several notifications become one row.
 *
 * Shared because both clients would otherwise answer the same questions
 * differently and neither would look wrong. "Aman and 4 others hyped your
 * post" on one client beside five separate rows on the other is not a
 * difference anybody can report, and the counting rules below each exist
 * because getting them wrong was once shipped.
 */

/** The fields these rules read. Each client's own row type satisfies it. */
export type GroupableNotif = TargetableNotif & {
  id: string;
  actor_id: string | null;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export type NotifGroup<T extends { avatar_hue?: number | null } = NotifActor> = {
  key: string;
  type: string;
  ids: string[];
  actors: T[];
  /** Distinct actors — may exceed `actors.length`, which caps the stack. */
  actorCount: number;
  body: string;
  isRead: boolean;
  latestAt: string;
  /** The still beside the row: a post's picture, a Shot's cover. */
  thumb: NotifThumb | null;
  /** Where tapping goes, as a place. Each client renders its own route. */
  target: NotifTarget;
  /** Actor id of the first notification — for actionable types. */
  actorId: string | null;
};

/** A still, and only a still — see each client's thumbnail resolver. */
export type NotifThumb = { url: string };

export type NotifActor = {
  display_name: string | null;
  username: string | null;
  avatar_hue: number | null;
  avatar_url: string | null;
};

/** Kept when muting someone: not "activity", and not something to miss. */
export const MUTE_EXEMPT = new Set([
  "new_message",
  "dm_post_shared",
  "incoming_call",
  "missed_call",
  "follow_request",
  "security_alert",
]);

/** Which Tune level a notification answers to, as the server decides it. */
export function levelKeyOf(type: string): LevelKey | null {
  // A rehype is not a hype: it has its own level (0113).
  if (type === "repost") return "rehypes";
  if (type.startsWith("hype_")) return "hypes";
  if (type.startsWith("comment_")) return "comments";
  if (type.startsWith("mention_")) return "mentions";
  if (type === "follow" || type === "follow_accepted") return "follows";
  if (type === "dm_post_shared") return "shares";
  return null;
}

/**
 * What Activity shows, given the Tune sheet. The server already keeps new
 * rows out; this hides the ones that arrived before a change, so switching
 * something off takes effect on screen at once. Spotlight pages wait for an
 * answer: until then the newest one is only the example the question uses.
 */
export function shownNotifs<T extends { type: string; actor_id: string | null }>(
  list: T[],
  prefs: ActivityPrefs,
): T[] {
  const muted = new Set(prefs.muted ?? []);
  const spotlight = spotlightDecision(prefs);
  return list.filter((n) => {
    if (n.actor_id && muted.has(n.actor_id) && !MUTE_EXEMPT.has(n.type)) return false;
    if (n.type === "spotlight_page" && spotlight !== "yes") return false;
    if (n.type === "milestone" && prefs.milestones === false) return false;
    if (n.type === "show_posted" && prefs.shows_posted === false) return false;
    if (n.type === "back_after" && prefs.back_after === false) return false;
    const key = levelKeyOf(n.type);
    return !key || levelOf(prefs, key) !== "off";
  });
}

/**
 * Types where bundling several rows into one loses information the reader
 * needs in order to act — never collapse these.
 */
export const NEVER_GROUP = new Set([
  "incoming_call",
  "new_message",
  "dm_post_shared",
  "follow_request",
  // Every sign-in is its own event. Collapsing two into "1 other" hides the
  // one you didn't make, which is the entire point of the alert.
  "security_alert",
  "trial_reminder",
  // "Passed 100" and "passed 500" are two pieces of news.
  "milestone",
]);

/**
 * Comments, replies and mentions each carry words someone wrote to you.
 * Folded into "Aman and 2 others commented", two of the three comments were
 * never shown — on the one kind of notification that is marked as needing an
 * answer. Each stays a row of its own.
 */
export function saysSomething(type: string): boolean {
  return type.startsWith("comment_") || type.startsWith("mention_");
}

/**
 * A group only spans this long from its newest item. Follows all share one
 * target (you), so without a window a follow today was summed with every
 * follow ever: "Aman and 5 others followed you", the five from a month ago.
 */
export const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Collapse consecutive notifications sharing the same (type, target) into one
 * row. Input must already be sorted newest first; group order follows
 * first-seen (= most recent) order.
 */
export function groupNotifs<
  T extends GroupableNotif & { actor?: A | null; thumb?: NotifThumb | null },
  A extends NotifActor = NotifActor,
>(list: T[]): NotifGroup<A>[] {
  const order: string[] = [];
  /** The open group for each kind of notification: the newest one. */
  const byKey = new Map<string, NotifGroup<A> & { seenActorIds: Set<string> }>();
  const groups = new Map<string, NotifGroup<A> & { seenActorIds: Set<string> }>();

  for (const n of list) {
    const groupable = !NEVER_GROUP.has(n.type) && !saysSomething(n.type) && n.target_id;
    const kind = groupable ? `${n.type}|${n.target_type}|${n.target_id}` : `solo-${n.id}`;

    let g = byKey.get(kind);
    const at = new Date(n.created_at).getTime();
    if (g && new Date(g.latestAt).getTime() - at > GROUP_WINDOW_MS) g = undefined;
    if (!g) {
      const key = order.includes(kind) ? `${kind}#${n.id}` : kind;
      g = {
        key,
        type: n.type,
        ids: [],
        actors: [],
        actorCount: 0,
        body: n.body ?? "interacted with your content",
        isRead: true,
        latestAt: n.created_at,
        thumb: n.thumb ?? null,
        target: notifTarget(n),
        actorId: n.actor_id ?? null,
        seenActorIds: new Set(),
      };
      byKey.set(kind, g);
      order.push(key);
      groups.set(key, g);
    }

    g.ids.push(n.id);
    if (!n.is_read) g.isRead = false;
    if (!g.thumb && n.thumb) g.thumb = n.thumb;

    // By account. This used to be by username, then by display name: two
    // different people who share a display name and have no username yet
    // were counted as one, and "and 2 others" came up one short.
    const actorId = n.actor_id ?? n.actor?.username ?? `anon-${n.id}`;
    if (!g.seenActorIds.has(actorId)) {
      g.seenActorIds.add(actorId);
      g.actorCount += 1;
      if (g.actors.length < 3 && n.actor) g.actors.push(n.actor);
    }
  }

  return order.map((k) => {
    const { seenActorIds: _drop, ...g } = groups.get(k)!;
    return g as NotifGroup<A>;
  });
}

/** "Aman", "Aman and Leo", or "Aman and 4 others" */
export function actorSummary(g: {
  actors: { display_name: string | null; username: string | null }[];
  actorCount: number;
}): string {
  const names = g.actors.map((a) => a.display_name ?? a.username ?? "Someone");
  if (g.actorCount <= 1) return names[0] ?? "Someone";
  if (g.actorCount === 2) return `${names[0]} and ${names[1] ?? "1 other"}`;
  return `${names[0]} and ${g.actorCount - 1} others`;
}

/** Nobody did these: they are about your account or your own work. */
export function hasNoActor(type: string): boolean {
  return type === "security_alert" || type === "trial_reminder" || type === "milestone";
}
