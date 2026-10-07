/**
 * What sits under a message to say how far it has got.
 *
 * In a one-to-one chat it is words under your newest message: "Sending…",
 * "Sent", "Seen now", "Seen 4m ago". In a group it is faces: each member's
 * picture under the last message they have read, moving down as they read.
 *
 * Pure. The chat hands in what it knows; this decides what to show.
 */

/** As many faces as fit under one message before the rest become "+N". */
export const FACES_SHOWN = 4;

type Msg = { id: string; sender_id: string; created_at: string; kind?: string; _status?: string | null };
type Reader = { userId: string; lastReadAt: string | null; hideReadReceipts: boolean };

/** "Seen now", "Seen 4m ago", "Seen 3h ago", "Seen 5 Oct". */
export function seenLabel(readAt: string, now: number): string {
  const at = new Date(readAt).getTime();
  if (Number.isNaN(at)) return "Seen";
  const mins = Math.floor(Math.max(0, now - at) / 60_000);
  if (mins < 1) return "Seen now";
  if (mins < 60) return `Seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Seen ${hours}h ago`;
  return `Seen ${new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/**
 * Where each reader has read to: the id of the last message at or before
 * their read time, and who is there. Messages in thread order (oldest
 * first). Someone hiding their read receipts is nowhere; so is someone who
 * has read nothing here. A message still on its way cannot have been read.
 */
export function readMarkers(messages: Msg[], readers: Reader[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const settled = messages.filter((m) => m.kind !== "system" && m._status !== "pending" && m._status !== "failed");
  for (const r of readers) {
    if (r.hideReadReceipts || !r.lastReadAt) continue;
    let at: Msg | null = null;
    for (const m of settled) {
      if (m.created_at <= r.lastReadAt) at = m;
      else break;
    }
    // Their own message is not something they "read to".
    if (!at) continue;
    out.set(at.id, [...(out.get(at.id) ?? []), r.userId]);
  }
  return out;
}

/** My newest message, the one the words go under. Null when I have sent nothing. */
export function lastMine(messages: Msg[], me: string): Msg | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_id === me && m.kind !== "system") return m;
  }
  return null;
}

export type Receipt =
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "seen"; label: string }
  | null;

/**
 * The words under my newest message.
 *
 * `faces` says readers' pictures are already under it (a group), in which
 * case being seen needs no words. A failed message has its own line (tap to
 * retry) and gets nothing here.
 */
export function receiptFor(
  message: Msg | null,
  readers: Reader[],
  opts: { isGroup: boolean; faces: boolean; now: number },
): Receipt {
  if (!message || message._status === "failed") return null;
  if (message._status === "pending") return { kind: "sending" };
  const counted = readers.filter((r) => !r.hideReadReceipts && r.lastReadAt && message.created_at <= r.lastReadAt);
  if (opts.isGroup) return opts.faces ? null : { kind: "sent" };
  if (counted.length === 0) return { kind: "sent" };
  // One-to-one: when they read it.
  const latest = counted.map((r) => r.lastReadAt as string).sort()[counted.length - 1];
  return { kind: "seen", label: seenLabel(latest, opts.now) };
}
