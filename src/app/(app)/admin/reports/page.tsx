import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportsQueue, type ReportRow } from "@/components/admin/ReportsQueue";

/** Owner-only moderation queue. Everyone else gets a 404, not a hint. */
export default async function AdminReportsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!(me as any)?.is_admin) notFound();

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

  const rows: ReportRow[] = [
    ...(content ?? []).map((r: any) => ({
      id: r.id,
      table: "reports" as const,
      targetType: r.target_type as string,
      targetId: r.target_id as string,
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
