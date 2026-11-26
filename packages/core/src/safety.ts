/**
 * Reporting and blocking, as one set of rules for both clients.
 *
 * The web had these inline in five components; the phone needs the same
 * writes, and Play's user-generated-content policy is the reason it needs
 * them at all. Two copies of "what counts as already reported" would be two
 * answers to the one question a moderation queue depends on, so the writes
 * live here and both clients call them.
 *
 * Every function takes the client as an argument, so the tests drive them
 * with a fake rather than reading their source.
 */

/** The reasons offered, in the order the web has always offered them. */
export const REPORT_REASONS = [
  "Spam",
  "Harassment or bullying",
  "Hate or abuse",
  "Scam or fraud",
  "Nudity or sexual content",
  "Violence or dangerous acts",
  "Misinformation",
  "Other",
] as const;

/** Must stay in sync with the reports.target_type check constraint. */
export type ReportTarget =
  | "post"
  | "shot"
  | "show"
  | "comment"
  | "message"
  | "profile"
  | "conversation";

/** How each target is named in the sheet's title and copy. */
export const REPORT_LABELS: Record<ReportTarget, string> = {
  post: "post",
  shot: "Shot",
  show: "Show",
  comment: "comment",
  message: "message",
  profile: "account",
  conversation: "group",
};

/** Details are optional; past this length the rest is cut, not refused. */
export const MAX_REPORT_DETAILS = 1000;

/** The confirmation every block goes through, worded once. */
export const BLOCK_COPY = {
  title: (username?: string | null) =>
    `Block ${username ? `@${username}` : "this user"}`,
  body: "They won't be able to message or call you, and their posts vanish from your feeds. They aren't notified.",
  confirm: "Block",
  done: (username?: string | null) => `Blocked ${username ? `@${username}` : "user"}`,
  failed: "Couldn't block, try again",
  unblocked: "Unblocked",
  unblockFailed: "Couldn't unblock, try again",
} as const;

/** The narrow slice of a Supabase client these functions use. */
type Result = { data?: unknown; error: { code?: string; message?: string } | null };
type Filter = PromiseLike<Result> & {
  eq(column: string, value: unknown): Filter;
  maybeSingle(): PromiseLike<Result>;
};
export type SafetyClient = {
  from(table: string): {
    insert(row: Record<string, unknown>): PromiseLike<Result>;
    select(columns: string): Filter;
    delete(): Filter;
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result>;
};

export type SafetyOutcome = { ok: true } | { ok: false; error: string };

/**
 * Files a report. One per person per target, enforced by a unique index —
 * so a second report of the same thing comes back as 23505, and that is
 * success: the report the person wanted to exist does exist.
 */
export async function submitReport(
  supabase: SafetyClient,
  input: {
    reporterId: string;
    targetType: ReportTarget;
    targetId: string;
    reason: string;
    details?: string | null;
  },
): Promise<SafetyOutcome> {
  if (!input.reporterId) return { ok: false, error: "Sign in to report." };
  if (!input.targetId) return { ok: false, error: "Nothing to report." };
  if (!input.reason.trim()) return { ok: false, error: "Pick a reason." };
  const details = (input.details ?? "").trim().slice(0, MAX_REPORT_DETAILS);
  const { error } = await supabase.from("reports").insert({
    reporter_id: input.reporterId,
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details: details || null,
    status: "open",
  });
  if (error && error.code !== "23505") {
    return { ok: false, error: error.message || "Couldn't send the report." };
  }
  return { ok: true };
}

/**
 * Reports one message through the `report_message` RPC.
 *
 * The RPC already treats a repeat report as success (on conflict do
 * nothing), so an error here is a real refusal: not a member of the chat, a
 * message that has gone, no session. The chat used to word every error as
 * "Report already sent", which told someone whose report was refused that it
 * had gone through. The swallowed-failure shape: a refusal that looks like a
 * duplicate.
 */
export async function reportMessage(
  supabase: SafetyClient,
  input: { messageId: string; reason: string },
): Promise<SafetyOutcome> {
  if (!input.messageId) return { ok: false, error: "Nothing to report." };
  if (!input.reason.trim()) return { ok: false, error: "Pick a reason." };
  const { error } = await supabase.rpc("report_message", {
    p_message_id: input.messageId,
    p_reason: input.reason,
  });
  return error ? { ok: false, error: "Couldn't send the report. Try again." } : { ok: true };
}

/**
 * Blocks someone through the `block_user` RPC, which is idempotent and
 * refuses a self-block on the server. Refused here too, so the client never
 * shows "Blocked" for a block that was never written.
 */
export async function blockUser(
  supabase: SafetyClient,
  viewerId: string,
  targetId: string,
): Promise<SafetyOutcome> {
  if (!targetId || targetId === viewerId) return { ok: false, error: BLOCK_COPY.failed };
  const { error } = await supabase.rpc("block_user", { p_blocked: targetId });
  return error ? { ok: false, error: BLOCK_COPY.failed } : { ok: true };
}

/** Removes the viewer's own block on someone. RLS allows only your own rows. */
export async function unblockUser(
  supabase: SafetyClient,
  viewerId: string,
  targetId: string,
): Promise<SafetyOutcome> {
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", viewerId)
    .eq("blocked_id", targetId);
  return error ? { ok: false, error: BLOCK_COPY.unblockFailed } : { ok: true };
}

/** Whether the viewer has blocked this person. A failed read says no. */
export async function isBlockedByMe(
  supabase: SafetyClient,
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", viewerId)
    .eq("blocked_id", targetId)
    .maybeSingle();
  return !error && !!data;
}
