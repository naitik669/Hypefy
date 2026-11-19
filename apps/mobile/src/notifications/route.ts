import { NOTIF_TARGET_KINDS, type NotifTarget } from "@hypefy/core/notif-target";

/**
 * Which places a notification can name that this app can actually open.
 *
 * The web answers every target with a path. This app has three of the
 * fifteen, plus Activity itself: a profile, a conversation, and a post’s
 * comments. There is no
 * post screen, no single-Shot route, no Shows, no Settings and no Library
 * here yet.
 *
 * **A row whose place this app lacks is NOT made tappable.** That is the
 * whole reason core answers with a place rather than a path: a path would
 * have to be matched against a list of patterns, and a pattern nobody added
 * yet becomes a row that looks tappable and silently does nothing — which is
 * exactly what the website's own notifHref comment was written about, and
 * what shipped there three times. Here it is a `null` the screen has to
 * handle, and the screen says where the thing is instead.
 *
 * Adding a screen means adding a case. The test holds this to every kind in
 * NOTIF_TARGET_KINDS, so a new place in core fails here until someone has
 * decided what the phone does with it — rather than defaulting to nowhere.
 */
export type MobileRoute =
  | { pathname: "/u/[username]"; params: { username: string } }
  | { pathname: "/messages/[id]"; params: { id: string } }
  | { pathname: "/post/[id]/comments"; params: { id: string } }
  | { pathname: "/notifications"; params?: undefined };

export function mobileRoute(t: NotifTarget): MobileRoute | null {
  switch (t.kind) {
    case "profile":
      return { pathname: "/u/[username]", params: { username: t.username } };
    case "conversation":
      return { pathname: "/messages/[id]", params: { id: t.id } };
    case "post-comment":
      // The comments screen is where a comment is. It cannot scroll to the
      // one comment the way the web's post page does — the thread opens at
      // the top — so the comment is found rather than landed on.
      return { pathname: "/post/[id]/comments", params: { id: t.postId } };
    case "activity":
      // Where a push lands when its subject has no screen here. This app has
      // Activity, so that fallback works on both clients.
      return { pathname: "/notifications" };

    // Reachable on the website, not here. Each is a screen this app has not
    // ported, not an oversight in the mapping:
    case "post": // no post screen — the feed is the only place a post renders
    case "shot": // the Shots tab is a pager; there is no route to one Shot
    case "show":
    case "show-answers":
    case "show-collab": // Shows are not ported at all
    case "calls": // calls are web-only by decision, not by omission
    case "diary":
    case "spotlight":
    case "library":
    case "security":
    case "subscription": // Settings is not ported
    case "none": // some notifications are just news
      return null;
  }
}

/**
 * What to say on a row that goes nowhere.
 *
 * Only where there IS somewhere and this app is not it. A notification that
 * genuinely has no destination — a milestone, a sign-in alert — should not
 * be told to go and look for one on the web.
 */
export function elsewhere(t: NotifTarget): boolean {
  return t.kind !== "none" && mobileRoute(t) === null;
}

/** This app has three of the fifteen places, plus Activity itself. */
export const REACHABLE = ["profile", "conversation", "post-comment", "activity"] as const;

/** Every kind core can produce, for the exhaustiveness test. */
export const TARGET_KINDS = NOTIF_TARGET_KINDS;
