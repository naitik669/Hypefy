import { REPORT_LABELS, type ReportTarget } from "@hypefy/core/safety";

/**
 * What the safety menu offers, decided without React so the tests run it.
 *
 * The rows and their words are the website's: the post menu's "Block
 * @name" and "Report", the profile sheet's subtitles, the Shot menu's
 * "Report Shot". Only the safety rows are ported. Follow, Hype buddies,
 * share, mute and "not interested" sit beside them on the web and are
 * separate writes, left for later rather than half-built here.
 */

export type SafetyRow = {
  key: "report" | "block" | "unblock";
  label: string;
  sub: string;
  danger: boolean;
};

export type SafetyTarget = {
  type: ReportTarget;
  /** The reported thing's id: the post, comment, Shot, or the profile's user id. */
  id: string;
  /** Whose it is. Blocking acts on this person. */
  authorId: string;
  username?: string | null;
};

const at = (username?: string | null) => (username ? ` @${username}` : "");

/**
 * The rows for a target, or none at all when it is the viewer's own.
 *
 * Nothing for your own content, as on the web, where the owner gets an
 * owner's menu instead. Owner actions are not ported, so on the phone your
 * own post simply has no menu.
 *
 * Comments offer Report only, as the web's held-comment actions do. Block
 * lives on posts, Shots and profiles.
 */
export function safetyRows(
  target: SafetyTarget,
  viewerId: string | null,
  blocked = false,
): SafetyRow[] {
  if (!viewerId || !target.id || target.authorId === viewerId) return [];
  const rows: SafetyRow[] = [];
  const canBlock = target.type !== "comment" && !!target.authorId;

  if (canBlock && target.type === "profile" && blocked) {
    rows.push({
      key: "unblock",
      label: `Unblock${at(target.username)}`,
      sub: "They can find and message you again",
      danger: false,
    });
  } else if (canBlock && target.type === "profile") {
    rows.push({
      key: "block",
      label: `Block${at(target.username)}`,
      sub: "Their posts disappear and they can't message or call you",
      danger: true,
    });
  }

  rows.push({
    key: "report",
    label: target.type === "profile" ? `Report${at(target.username)}` : `Report ${REPORT_LABELS[target.type]}`,
    sub: target.type === "profile" ? "They won't know it came from you" : "Tell us what's wrong with this",
    danger: true,
  });

  if (canBlock && target.type !== "profile") {
    rows.push({
      key: "block",
      label: `Block @${target.username || "user"}`,
      sub: "You stop seeing each other",
      danger: true,
    });
  }
  return rows;
}
