import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportsQueue, type ReportRow } from "@/components/admin/ReportsQueue";

/** Owner-only moderation queue. Everyone else gets a 404, not a hint. */
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

  const one = (p: any) => (Array.isArray(p) ? p[0] : p) ?? null;

  // Resolve usernames for profile-target reports so "View target" links to a
  // real /u/<username> route instead of /u/<uuid> (which 404s).
  const profileTargetIds = [
    ...new Set((content ?? []).filter((r: any) => r.target_type === "profile").map((r: any) => r.target_id as string)),
  ];
  const usernameById = new Map<string, string>();
  if (profileTargetIds.length > 0) {
    const { data: targets } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", profileTargetIds);
    (targets ?? []).forEach((p: any) => { if (p.username) usernameById.set(p.id, p.username); });
  }

  const rows: ReportRow[] = [
    ...(content ?? []).map((r: any) => ({
      id: r.id,
      table: "reports" as const,
      targetType: r.target_type as string,
      targetId: r.target_id as string,
      targetUsername: r.target_type === "profile" ? usernameById.get(r.target_id) ?? null : null,
      reason: r.reason,
      details: r.details,
      status: r.status,
      at: r.created_at,
      reporter: one(r.reporter)?.username ?? one(r.reporter)?.display_name ?? "unknown",
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
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <>
      <PageHeader title="Reports queue" showBack />
      <ReportsQueue rows={rows} />
    </>
  );
}
