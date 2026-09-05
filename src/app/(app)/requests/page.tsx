import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequestsView, type RequestRow } from "@/components/profile/RequestsView";

/**
 * Follow requests, both directions.
 *
 * A private account's requests lived only in the notification list — and the
 * notification is the kind of thing you clear. Once cleared, the row stayed in
 * follow_requests forever with nothing in the app able to approve or decline
 * it, which from the requester's side is indistinguishable from being ignored.
 */
export const dynamic = "force-dynamic";

function toRows(
  data: Record<string, unknown>[] | null,
  key: "requester" | "target"
): RequestRow[] {
  return (data ?? []).flatMap((r) => {
    const raw = r[key] as Record<string, unknown> | Record<string, unknown>[] | null;
    const p = Array.isArray(raw) ? raw[0] : raw;
    if (!p) return [];
    return [
      {
        id: p.id as string,
        name: (p.display_name as string) ?? (p.username as string) ?? "User",
        username: (p.username as string) ?? null,
        hue: (p.avatar_hue as number) ?? 280,
        avatarUrl: (p.avatar_url as string) ?? null,
        at: r.created_at as string,
      },
    ];
  });
}

const COLS = "id, display_name, username, avatar_hue, avatar_url";

export default async function RequestsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const [incomingRes, sentRes] = await Promise.all([
    supabase
      .from("follow_requests")
      .select(`created_at, requester:profiles!follow_requests_requester_id_fkey(${COLS})`)
      .eq("target_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("follow_requests")
      .select(`created_at, target:profiles!follow_requests_target_id_fkey(${COLS})`)
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <>
      <PageHeader title="Follow requests" showBack />
      <RequestsView
        incoming={toRows(incomingRes.data as Record<string, unknown>[] | null, "requester")}
        sent={toRows(sentRes.data as Record<string, unknown>[] | null, "target")}
      />
    </>
  );
}
