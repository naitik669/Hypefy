"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { PLANS, formatInr, type PlanId } from "@/lib/billing/plans";

export type SubRow = {
  id: string;
  plan: string;
  status: string;
  provider: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/** One line saying where this plan stands and what happens next. */
export function planStatusLine(s: SubRow, now = Date.now()): string {
  const plan = PLANS[s.plan as PlanId];
  const end = day(s.current_period_end);
  if (s.provider === "manual") return "Granted by Hypefy";
  if (s.status === "past_due") return "Payment failed — we'll retry. Update your payment method if it keeps failing.";
  const inTrial = s.status === "trialing" && s.trial_ends_at && new Date(s.trial_ends_at).getTime() > now;
  if (s.cancel_at_period_end) return `Cancelled · yours until ${end}`;
  if (inTrial) return `Free trial until ${day(s.trial_ends_at)}, then ${formatInr(plan.pricePaise)}/month`;
  return `${formatInr(plan.pricePaise)}/month · renews ${end}`;
}

export function SubscriptionList({ subs }: { subs: SubRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<SubRow | null>(null);

  async function cancel(s: SubRow) {
    const res = await fetch("/api/billing/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id }),
    });
    const json = await res.json().catch(() => ({}));
    setConfirm(null);
    if (res.ok) {
      toast("Cancelled — you keep it until the end of the period", "success");
      router.refresh();
    } else {
      toast(json.error ?? "Couldn't cancel", "error");
    }
  }

  return (
    <>
      <ul className="overflow-hidden rounded-2xl border border-border bg-elevated divide-y divide-border/70">
        {subs.map((s) => {
          const plan = PLANS[s.plan as PlanId];
          const cancellable = s.provider === "razorpay" && !s.cancel_at_period_end;
          return (
            <li key={s.id} className="flex items-start gap-3 px-3 py-3.5">
              <VerifiedStar className="mt-0.5 h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{plan?.name ?? s.plan}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted">{planStatusLine(s)}</p>
              </div>
              {cancellable && (
                <button
                  type="button"
                  onClick={() => setConfirm(s)}
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-danger"
                >
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={!!confirm}
        title={`Cancel ${confirm ? PLANS[confirm.plan as PlanId]?.name ?? "" : ""}?`}
        body={
          confirm?.status === "trialing"
            ? "You won't be charged. Everything stays on until your free trial ends."
            : "It won't renew. Everything stays on until the end of the period you've paid for."
        }
        confirmLabel="Cancel plan"
        cancelLabel="Keep it"
        onConfirm={() => (confirm ? cancel(confirm) : undefined)}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
