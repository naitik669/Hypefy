import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { PremiumPlans } from "@/components/billing/PremiumPlans";
import { razorpayEnv } from "@/lib/billing/razorpay";
import { isLive } from "@/lib/billing/plans";

export const metadata = { title: "Hypefy Premium" };

export default async function PremiumPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: subs }, { data: eligible }] = user
    ? await Promise.all([
        supabase.from("subscriptions").select("plan, status").eq("user_id", user.id),
        supabase.rpc("trial_eligible", { p_uid: user.id }),
      ])
    : [{ data: [] }, { data: false }];

  const live = (subs ?? []).filter((s) => isLive(s.status));

  return (
    <>
      <PageHeader title="Premium" showBack />
      <PremiumPlans
        configured={!!razorpayEnv()}
        trialEligible={eligible === true}
        hasPremium={live.some((s) => s.plan === "premium")}
        hasVerified={live.some((s) => s.plan === "verified")}
      />
    </>
  );
}
