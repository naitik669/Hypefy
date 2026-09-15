import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SubscriptionList } from "@/components/billing/SubscriptionList";
import { isLive } from "@/lib/billing/plans";

export const metadata = { title: "Subscription" };

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: subs } = user
    ? await supabase
        .from("subscriptions")
        .select("id, plan, status, provider, trial_ends_at, current_period_end, cancel_at_period_end")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const live = (subs ?? []).filter((s) => isLive(s.status));

  return (
    <>
      <PageHeader title="Subscription" showBack />
      <div className="flex flex-col gap-5 px-4 pb-10 pt-3">
        {live.length ? (
          <SubscriptionList subs={live} />
        ) : (
          <div className="rounded-2xl border border-border bg-elevated px-4 py-6 text-center">
            <p className="text-sm font-bold">No plan yet</p>
            <p className="mt-1 text-xs text-muted">Premium starts with a 7-day free trial.</p>
            <Link
              href="/premium"
              className="mt-4 inline-flex rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink"
            >
              See Premium
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
