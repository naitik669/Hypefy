"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2, LockOpen, Palette, Sparkles, Type, X } from "lucide-react";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { useToast } from "@/components/ui/ToastProvider";
import { PremiumHero } from "@/components/billing/PremiumHero";
import { isNative } from "@/lib/native";
import { safeBack } from "@/lib/safe-back";
import { formatInr, PLANS, TRIAL_DAYS, type PlanId } from "@/lib/billing/plans";
import { subscribe } from "@/lib/billing/checkout";

const noop = () => () => {};

/**
 * The paywall. It leads with exactly how the free trial works — what unlocks
 * today, when you'll be reminded, when money happens — because a subscription
 * that explains itself doesn't feel like a trap. Then two plans and one button.
 *
 * The Day 5 reminder is real: remind_trials_ending() (0080) sends it.
 * Inside the Android app nothing can be bought (Play only allows its own
 * billing for digital items), so the button gives way to a plain note.
 */
export function PremiumPlans({
  configured,
  trialEligible,
  hasPremium,
  hasVerified,
}: {
  configured: boolean;
  trialEligible: boolean;
  hasPremium: boolean;
  hasVerified: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const native = useSyncExternalStore(noop, isNative, () => false);
  const [plan, setPlan] = useState<PlanId>("premium");
  const [busy, setBusy] = useState(false);

  const premium = PLANS.premium;
  const verified = PLANS.verified;
  const trial = trialEligible && plan === "premium";
  const reminderDay = TRIAL_DAYS - 2;

  async function start() {
    if (busy) return;
    if (!configured) {
      toast("Payments are coming soon", "plain");
      return;
    }
    setBusy(true);
    const result = await subscribe(plan, PLANS[plan].name);
    setBusy(false);
    if (result.ok) {
      toast(plan === "premium" ? "Welcome to Premium" : "You're verified", "success");
      router.push("/settings/subscription");
      router.refresh();
    } else if (result.reason === "not_configured") {
      toast("Payments are coming soon", "plain");
    } else if (result.reason === "failed") {
      toast(result.message ?? "Something went wrong", "error");
    }
  }

  const title = hasPremium
    ? "You’re Premium"
    : trial
      ? `How your ${TRIAL_DAYS}-day free trial works`
      : plan === "premium"
        ? "Hypefy Premium"
        : "Just the badge";

  return (
    <div className="relative mx-auto flex min-h-[calc(100dvh-84px)] w-full max-w-[480px] flex-col pb-8">
      <div className="relative">
        <PremiumHero />
        <button
          type="button"
          onClick={() => safeBack(router)}
          aria-label="Close"
          className="absolute left-4 top-[calc(0.75rem+var(--sat))] flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition active:scale-95"
        >
          <X size={20} />
        </button>
      </div>

      <div className="-mt-2 flex flex-1 flex-col px-6">
        <h1 className="text-center text-[26px] font-extrabold leading-[1.15] tracking-tight [text-wrap:balance]">{title}</h1>

        {hasPremium ? (
          <p className="mt-2 text-center text-sm text-muted">Your badge, frames, bubbles and themes are on.</p>
        ) : trial ? (
          <ol className="mx-auto mt-7 flex w-full max-w-[320px] flex-col">
            <Step state="done" icon={<Check size={14} strokeWidth={3} />} title="Account ready" sub="You’re all set." />
            <Step state="now" icon={<LockOpen size={14} strokeWidth={2.5} />} title="Today: everything unlocks" sub="Badge, frames, bubbles and themes." />
            <Step icon={<Bell size={13} strokeWidth={2.5} />} title={`Day ${reminderDay}: a reminder`} sub="We’ll let you know before it ends." />
            <Step last icon={<Sparkles size={13} strokeWidth={2.5} />} title={`Day ${TRIAL_DAYS}: trial ends`} sub={`${formatInr(premium.pricePaise)}/month after. Cancel anytime before.`} />
          </ol>
        ) : plan === "premium" ? (
          <ul className="mx-auto mt-7 flex w-full max-w-[320px] flex-col gap-4">
            <Perk icon={<VerifiedStar className="h-4 w-4 text-verified" />} text="The blue badge" />
            <Perk icon={<Type size={15} />} text="Name styles and frames" />
            <Perk icon={<Palette size={15} />} text="Bubbles and chat themes" />
          </ul>
        ) : (
          <div className="mx-auto mt-7 flex w-full max-w-[320px] items-center gap-3">
            <VerifiedStar className="h-10 w-10 shrink-0 text-verified" />
            <p className="text-sm text-muted">The blue star next to your name, everywhere on Hypefy.</p>
          </div>
        )}

        <div className="flex-1" />

        {hasPremium ? (
          <Link
            href="/settings/subscription"
            className="mt-8 flex h-14 items-center justify-center rounded-full bg-surface text-[15px] font-bold transition active:scale-[0.98]"
          >
            Manage your plan
          </Link>
        ) : (
          <>
            <div className="mt-8 flex flex-col gap-3" role="radiogroup" aria-label="Plan">
              <PlanCard
                selected={plan === "premium"}
                onSelect={() => setPlan("premium")}
                badge="Most popular"
                name="Premium"
                note={trialEligible ? `${TRIAL_DAYS} days free` : "Everything"}
                price={formatInr(premium.pricePaise)}
              />
              <PlanCard
                selected={plan === "verified"}
                onSelect={() => setPlan("verified")}
                name="Just the badge"
                note={hasVerified ? "Active" : "Verified"}
                price={formatInr(verified.pricePaise)}
                disabled={hasVerified}
              />
            </div>

            {native ? (
              <p className="mt-5 rounded-full bg-surface py-4 text-center text-sm text-muted">Premium isn’t available in the app yet.</p>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={busy || (plan === "verified" && hasVerified)}
                className="mt-5 flex h-14 items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-extrabold text-accent-ink transition active:scale-[0.98] disabled:opacity-50"
              >
                {busy && <Loader2 size={18} className="animate-spin" />}
                {trial ? "Start free trial" : plan === "premium" ? "Get Premium" : "Get Verified"}
              </button>
            )}

            <p className="mt-3 text-center text-xs text-muted">
              {trial
                ? `₹0 today · then ${formatInr(premium.pricePaise)}/month · cancel anytime`
                : `${formatInr(PLANS[plan].pricePaise)}/month · cancel anytime`}
            </p>
            <p className="mt-1 text-center text-[11px] text-faint">
              <Link href="/terms#paid" className="underline-offset-2 hover:underline">
                Terms
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  sub,
  state = "later",
  last = false,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  state?: "done" | "now" | "later";
  last?: boolean;
}) {
  const dot =
    state === "done"
      ? "bg-accent text-accent-ink"
      : state === "now"
        ? "bg-accent/15 text-accent ring-4 ring-accent/10"
        : "bg-surface text-muted";
  return (
    <li className="flex gap-4">
      <div className="flex flex-col items-center">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${dot}`}>{icon}</span>
        {!last && <span className={`w-0.5 flex-1 ${state === "done" ? "bg-accent/60" : "bg-border"}`} />}
      </div>
      <div className={last ? "pt-1" : "pb-5 pt-1"}>
        <p className={`text-[15px] font-bold leading-tight ${state === "done" ? "text-muted line-through decoration-2" : ""}`}>{title}</p>
        <p className="mt-1 text-[13px] leading-snug text-muted">{sub}</p>
      </div>
    </li>
  );
}

function Perk({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3 text-[15px] font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-foreground">{icon}</span>
      {text}
    </li>
  );
}

function PlanCard({
  selected,
  onSelect,
  name,
  note,
  price,
  badge,
  disabled = false,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  note: string;
  price: string;
  badge?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`relative flex items-center gap-3 rounded-3xl border-2 px-5 py-4 text-left transition active:scale-[0.99] disabled:opacity-60 ${
        selected ? "border-accent bg-accent/[0.06]" : "border-border bg-surface"
      }`}
    >
      {badge && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-accent-ink">
          {badge}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold">{name}</span>
        <span className={`block text-[13px] ${selected ? "text-accent" : "text-muted"}`}>{note}</span>
      </span>
      <span className="text-right">
        <span className="text-[17px] font-extrabold tabular-nums">{price}</span>
        <span className="text-[13px] text-muted">/mo</span>
      </span>
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-accent bg-accent text-accent-ink" : "border-faint"
        }`}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
    </button>
  );
}
