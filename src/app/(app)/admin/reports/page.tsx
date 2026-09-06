import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportsQueue, type ReportRow } from "@/components/admin/ReportsQueue";
import { one } from "@/lib/supabase/typed";

/** Owner-only moderation queue. Everyone else gets a 404, not a hint. */
export const dynamic = "force-dynamic";

/** Which table holds each reportable content type, and its author column. */
const SOURCE: Record<string, { table: string; author: string }> = {
  post: { table: "posts", author: "user_id" },
  shot: { table: "shots", author: "user_id" },
  show: { table: "shows", author: "user_id" },
  comment: { table: "comments", author: "user_id" },
  message: { table: "messages", author: "sender_id" },
};

export default async function AdminReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Fail closed: a failed lookup must not fall through into the queue.
  const { data: me, error: meErr } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (meErr || !(me as any)?.is_admin) notFound();

  const [{ data: content }, { data: messages }] = await Promise.all([
    supabase
      .from("reports")
      .select("id, target_type, target_id, reason, details, status, created_at, reporter:profiles!reports_reporter_id_fkey(username, display_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("message_reports")
      .select("id, message_id, conversation_id, reason, details, status, created_at, reporter:profiles!message_reports_reporter_id_fkey(username, display_name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  // Resolve usernames for profile-target reports so "View target" links to a
  // real /u/<username> route instead of /u/<uuid> (which 404s).
  const profileTargetIds = [
    ...new Set((content ?? []).filter((r: any) => r.target_type === "profile").map((r: any) => r.target_id as string)),
  ];
  const usernameById = new Map<string, string>();
  if (profileTargetIds.length > 0) {
    const { data: targets } = await supabase
      .from("profiles").select("id, username").in("id", profileTargetIds);
    (targets ?? []).forEach((p: any) => { if (p.username) usernameById.set(p.id, p.username); });
  }

  /**
   * Look up each reported item's author and whether it is already removed.
   *
   * Without the author there is nobody to suspend, which is the difference
   * between a queue that can act on a repeat offender and one that can only
   * keep deleting their output. Batched per table rather than per report —
   * a hundred reports must not be a hundred round trips.
   *
   * Admins can see removed rows (the policies in 0055 allow it), so the
   * "already removed" state is readable here.
   */
  const authorById = new Map<string, string>();       // target id -> author id
  const removedIds = new Set<string>();
  const commentParent = new Map<string, string>();    // comment id -> post id

  const byType = new Map<string, string[]>();
  for (const r of (content ?? []) as any[]) {
    if (!SOURCE[r.target_type]) continue;
    const list = byType.get(r.target_type) ?? [];
    list.push(r.target_id);
    byType.set(r.target_type, list);
  }
  const messageIds = (messages ?? []).map((r: any) => r.message_id as string);
  if (messageIds.length > 0) byType.set("message", [...(byType.get("message") ?? []), ...messageIds]);

  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      const src = SOURCE[type];
      if (!src || ids.length === 0) return;
      const cols =
        type === "comment"
          ? `id, ${src.author}, removed_at, post_id`
          : `id, ${src.author}, removed_at`;
      // The table name is dynamic, which the generated relation union cannot
      // express; SOURCE is a closed map so the value is always a real table.
      const { data } = await (supabase.from as (t: string) => any)(src.table)
        .select(cols)
        .in("id", [...new Set(ids)]);
      for (const row of (data ?? []) as any[]) {
        if (row[src.author]) authorById.set(row.id, row[src.author]);
        if (row.removed_at) removedIds.add(row.id);
        if (type === "comment" && row.post_id) commentParent.set(row.id, row.post_id);
      }
    }),
  );

  // A profile report's "author" is the reported account itself.
  for (const r of (content ?? []) as any[]) {
    if (r.target_type === "profile") authorById.set(r.target_id, r.target_id);
  }

  // One lookup for every author involved: their handle, and whether they are
  // already suspended, so the button reads Suspend or Unsuspend correctly.
  const authorIds = [...new Set([...authorById.values()])];
  const authorMeta = new Map<string, { username: string | null; suspended: boolean }>();
  if (authorIds.length > 0) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, suspended_at, suspended_until")
      .in("id", authorIds);
    const now = Date.now();
    for (const p of (data ?? []) as any[]) {
      authorMeta.set(p.id, {
        username: p.username ?? null,
        suspended:
          !!p.suspended_at &&
          (!p.suspended_until || new Date(p.suspended_until).getTime() > now),
      });
    }
  }

  const decorate = (targetId: string) => {
    const authorId = authorById.get(targetId) ?? null;
    const meta = authorId ? authorMeta.get(authorId) : undefined;
    return {
      authorId,
      authorUsername: meta?.username ?? null,
      authorSuspended: meta?.suspended ?? false,
      removed: removedIds.has(targetId),
    };
  };

  const rows: ReportRow[] = [
    ...(content ?? []).map((r: any) => ({
      id: r.id,
      table: "reports" as const,
      targetType: r.target_type as string,
      targetId: r.target_id as string,
      targetUsername: r.target_type === "profile" ? usernameById.get(r.target_id) ?? null : null,
      commentPostId: r.target_type === "comment" ? commentParent.get(r.target_id) ?? null : null,
      reason: r.reason,
      details: r.details,
      status: r.status,
      at: r.created_at,
      reporter: one(r.reporter)?.username ?? one(r.reporter)?.display_name ?? "unknown",
      ...decorate(r.target_id),
    })),
    ...(messages ?? []).map((r: any) => ({
      id: r.id,
      table: "message_reports" as const,
      targetType: "message",
      targetId: r.message_id as string,
      conversationId: r.conversation_id as string,
      reason: r.reason,
      details: r.details,
      status: r.status,
      at: r.created_at,
      reporter: one(r.reporter)?.username ?? one(r.reporter)?.display_name ?? "unknown",
      ...decorate(r.message_id),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <>
      <PageHeader title="Reports queue" showBack />
      <ReportsQueue rows={rows} />
    </>
  );
}
