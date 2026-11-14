/**
 * Saying what actually went wrong with an upload.
 *
 * Both catch blocks in UploadProvider were bare, so a 413 from a file over
 * the bucket's ceiling, a dropped socket on a train, and a row-level
 * security refusal all produced the same "Couldn't share your post". That
 * is three different problems with three different things to do about
 * them, and the one message tells you to do none of them.
 *
 * Deliberately conservative: anything not recognised keeps the generic
 * wording. A confident wrong diagnosis is worse than an honest shrug,
 * because it sends somebody off to fix something that is not broken.
 */

export type UploadKind = "post" | "Shot";

/**
 * Thrown to unwind an upload somebody asked to stop.
 *
 * An error rather than a flag checked at every step, because the upload is
 * a straight line of awaits and unwinding is what an exception is for. The
 * catch that already cleans up storage then handles cancelling for free —
 * the files go, the row is never written — and only the reporting differs,
 * since a cancelled upload is not a failed one and must not leave a banner
 * offering to retry something the person just stopped.
 *
 * What this does NOT do is abort the request already in flight. The storage
 * client takes no AbortSignal on upload in this version — it has one for
 * download and not for this — so a chunk already on its way finishes, and
 * its object is removed immediately afterwards. The post never exists
 * either way, which is what cancelling means here.
 */
export class UploadCancelled extends Error {
  constructor() {
    super("Upload cancelled");
    this.name = "UploadCancelled";
  }
}

export function isCancelled(err: unknown): boolean {
  return err instanceof UploadCancelled;
}

/** Pull a message out of whatever was thrown. */
function textOf(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const e = err as { message?: unknown; error?: unknown; statusCode?: unknown };
    const parts = [e.message, e.error, e.statusCode]
      .filter((p) => typeof p === "string" || typeof p === "number")
      .map(String);
    return parts.join(" ");
  }
  return "";
}

/**
 * What to tell somebody whose upload failed.
 *
 * `kind` only shapes the noun, so the same mapping serves both paths and
 * cannot drift between them.
 */
export function uploadFailureMessage(err: unknown, kind: UploadKind = "post"): string {
  const t = textOf(err).toLowerCase();
  const thing = kind === "Shot" ? "your Shot" : "your post";

  // Over the bucket ceiling. Worth its own message because it is the one
  // failure the person can actually act on, and the action is obvious once
  // they know: use a smaller file.
  if (
    t.includes("413") ||
    t.includes("payload too large") ||
    t.includes("maximum allowed size") ||
    t.includes("entity too large")
  ) {
    return "That file is too large to upload. Try a smaller one.";
  }

  // The connection, not the content. "Failed to fetch" is what a browser
  // says when the request never arrived at all.
  if (
    t.includes("failed to fetch") ||
    t.includes("networkerror") ||
    t.includes("network error") ||
    t.includes("load failed") ||
    t.includes("err_internet_disconnected") ||
    t.includes("timeout") ||
    t.includes("timed out")
  ) {
    return "Couldn't reach Hypefy. Check your connection and try again.";
  }

  // A permission problem is never the person's to fix, so it says so
  // rather than implying they should change the file.
  if (
    t.includes("row-level security") ||
    t.includes("row level security") ||
    t.includes("42501") ||
    t.includes("permission denied") ||
    t.includes("not authorized") ||
    t.includes("unauthorized")
  ) {
    return `Couldn't share ${thing} — that wasn't allowed. Try signing out and back in.`;
  }

  // The file itself was refused by the bucket's mime list.
  if (t.includes("mime type") || t.includes("invalid_mime") || t.includes("not supported")) {
    return "That file type isn't supported.";
  }

  // Signed out mid-upload.
  if (t.includes("jwt") || t.includes("401")) {
    return "You've been signed out. Sign in and try again.";
  }

  return `Couldn't share ${thing}`;
}

/**
 * Whether trying the same thing again could plausibly work.
 *
 * A retry button on a file that is too big, or of a type the bucket does
 * not take, offers a second identical failure. Offering it only where it
 * might help is the difference between a control and a taunt.
 */
export function worthRetrying(err: unknown): boolean {
  const t = textOf(err).toLowerCase();
  const hopeless =
    t.includes("413") ||
    t.includes("payload too large") ||
    t.includes("maximum allowed size") ||
    t.includes("entity too large") ||
    t.includes("mime type") ||
    t.includes("invalid_mime");
  return !hopeless;
}
