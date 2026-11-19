/**
 * Where a notification goes, as a place rather than as a path.
 *
 * The web returned a URL string from this logic, which worked while there was
 * one client. It cannot work for two: the phone has a post's COMMENTS but no
 * post screen, no single-Shot route, no Shows, no Settings. Handing it
 * `/p/<id>` leaves it matching strings to guess what it was given, and a
 * destination it does not recognise becomes a row that looks tappable and
 * does nothing — which is the exact defect the web's own notifHref comment
 * was written about.
 *
 * So the shared answer is a PLACE. Each client maps the places it has to its
 * own routes, and — this is the point — a place it does not have is a
 * decidable fact rather than a failed string match. The phone says so on the
 * row instead of pretending.
 */

export type NotifTarget =
  | { kind: "profile"; username: string }
  | { kind: "post"; id: string }
  /** A comment on a post: the post, opened at that comment. */
  | { kind: "post-comment"; postId: string; commentId: string }
  | { kind: "shot"; id: string }
  | { kind: "show"; id: string }
  /** Somebody answered a question sticker; the answers, not the Show. */
  | { kind: "show-answers"; id: string }
  | { kind: "show-collab"; id: string }
  | { kind: "conversation"; id: string }
  | { kind: "calls" }
  | { kind: "diary" }
  | { kind: "spotlight"; page: string | null }
  | { kind: "library" }
  | { kind: "security" }
  | { kind: "subscription" }
  /** Activity itself — where a push lands when its subject has no screen. */
  | { kind: "activity" }
  /** Nowhere to go. Not a failure: some notifications are just news. */
  | { kind: "none" };

/** Every kind, so a client can be held to handling all of them. */
export const NOTIF_TARGET_KINDS = [
  "profile",
  "post",
  "post-comment",
  "shot",
  "show",
  "show-answers",
  "show-collab",
  "conversation",
  "calls",
  "diary",
  "spotlight",
  "library",
  "security",
  "subscription",
  "activity",
  "none",
] as const;

/** The shape this reads. Both clients' row types satisfy it. */
export type TargetableNotif = {
  type: string;
  target_type: string | null;
  target_id: string | null;
  actor?: { username: string | null } | null;
  /** Resolved separately: a comment is not somewhere you can go. */
  parent?: { kind: "post" | "shot"; id: string } | null;
};

export function notifTarget(n: TargetableNotif): NotifTarget {
  // About the account itself, not about a person or a thing.
  if (n.type === "security_alert") return { kind: "security" };
  if (n.type === "playlist_invite") return { kind: "library" };
  if (n.type === "trial_reminder") return { kind: "subscription" };

  // A reaction to your Diary opens the Diary, where yours is — not the
  // profile it used to live on as a status bubble, which is switched off.
  if (n.type === "note_reaction") return { kind: "diary" };

  if (n.type === "spotlight_page") return { kind: "spotlight", page: n.target_id ?? null };

  if (
    n.type === "follow" ||
    n.type === "referral_joined" ||
    n.type === "follow_request" ||
    n.type === "follow_accepted"
  ) {
    return n.actor?.username ? { kind: "profile", username: n.actor.username } : { kind: "none" };
  }

  // The conversation is the point of a call notification; the log is not.
  if (n.type === "incoming_call" || n.type === "missed_call") {
    return n.target_id ? { kind: "conversation", id: n.target_id } : { kind: "calls" };
  }

  if (n.target_type === "post" && n.target_id) return { kind: "post", id: n.target_id };
  if (n.target_type === "shot" && n.target_id) return { kind: "shot", id: n.target_id };
  // Before the plain `show` branch: landing on the Show itself is landing on
  // the one screen that cannot show you the answer.
  if (n.type === "show_answer" && n.target_id) return { kind: "show-answers", id: n.target_id };
  if (n.target_type === "show" && n.target_id) return { kind: "show", id: n.target_id };
  if (n.target_type === "show_collab" && n.target_id) return { kind: "show-collab", id: n.target_id };
  if (n.target_type === "conversation" && n.target_id) return { kind: "conversation", id: n.target_id };
  if (n.target_type === "comment" && n.parent && n.target_id) {
    return n.parent.kind === "post"
      ? { kind: "post-comment", postId: n.parent.id, commentId: n.target_id }
      : { kind: "shot", id: n.parent.id };
  }
  return { kind: "none" };
}

/**
 * The website's path for a place.
 *
 * "#" for nowhere is the web's own answer and is kept: every row there is a
 * full-width Link, and an href that is absent renders differently.
 */
export function webHref(t: NotifTarget): string {
  switch (t.kind) {
    case "profile":
      return `/u/${t.username}`;
    case "post":
      return `/p/${t.id}`;
    case "post-comment":
      // The comment itself, not just the post it is on: the post page opens
      // the thread and scrolls to it.
      return `/p/${t.postId}?comment=${t.commentId}`;
    case "shot":
      return `/shots/${t.id}`;
    case "show":
      return `/shows/${t.id}`;
    case "show-answers":
      return `/shows/${t.id}/answers`;
    case "show-collab":
      return `/shows/collab/${t.id}`;
    case "conversation":
      return `/messages/${t.id}`;
    case "calls":
      return "/calls";
    case "diary":
      return "/messages/diary";
    case "spotlight":
      return t.page ? `/messages/spotlight?page=${t.page}` : "/messages/spotlight";
    case "library":
      return "/library";
    case "security":
      return "/settings/security";
    case "subscription":
      return "/settings/subscription";
    case "activity":
      return "/notifications";
    case "none":
      return "#";
  }
}

/**
 * A website path back to the place it names.
 *
 * Needed because a push notification tapped from the OS tray carries only
 * what the server put in it, and the server has sent `data.url` as a website
 * path since long before there was a second client (src/lib/fcm.ts). Rather
 * than change the sender and leave every already-queued notification
 * unreadable, the receiver reads what is actually sent.
 *
 * **String parsing is only safe here because it is held to the producer.**
 * The round-trip test walks every kind in NOTIF_TARGET_KINDS and requires
 * `parseWebHref(webHref(t))` to equal `t`, so a new place added to webHref
 * fails until this understands it. Without that it would be the usual
 * pattern-matching that silently stops covering new cases — which is the
 * defect the whole module exists to avoid.
 */
export function parseWebHref(href: string): NotifTarget {
  const [path, query] = href.split("?", 2);
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "u" && parts[1]) return { kind: "profile", username: decodeURIComponent(parts[1]) };

  if (parts[0] === "p" && parts[1]) {
    const comment = new URLSearchParams(query ?? "").get("comment");
    return comment
      ? { kind: "post-comment", postId: parts[1], commentId: comment }
      : { kind: "post", id: parts[1] };
  }

  if (parts[0] === "shots" && parts[1]) return { kind: "shot", id: parts[1] };

  if (parts[0] === "shows" && parts[1]) {
    if (parts[1] === "collab" && parts[2]) return { kind: "show-collab", id: parts[2] };
    if (parts[2] === "answers") return { kind: "show-answers", id: parts[1] };
    return { kind: "show", id: parts[1] };
  }

  if (parts[0] === "messages" && parts[1]) {
    if (parts[1] === "diary") return { kind: "diary" };
    if (parts[1] === "spotlight") {
      return { kind: "spotlight", page: new URLSearchParams(query ?? "").get("page") };
    }
    return { kind: "conversation", id: parts[1] };
  }
  if (parts[0] === "notifications") return { kind: "activity" };
  if (parts[0] === "calls") return { kind: "calls" };
  if (parts[0] === "library") return { kind: "library" };
  if (parts[0] === "settings" && parts[1] === "security") return { kind: "security" };
  if (parts[0] === "settings" && parts[1] === "subscription") return { kind: "subscription" };

  return { kind: "none" };
}

/**
 * Where a PUSH notification lands.
 *
 * The same place, except that nowhere is not an option: somebody has just
 * tapped a notification, and an app that opens on whatever it happened to
 * be showing reads as the tap having missed. Activity is where every
 * notification is listed, so it is the honest fallback — and it is the
 * fallback the server already used, kept rather than invented.
 */
export function pushTarget(n: TargetableNotif): NotifTarget {
  const t = notifTarget(n);
  return t.kind === "none" ? { kind: "activity" } : t;
}
