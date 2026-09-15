"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Frame, Image as ImageIcon, Loader2, MessageCircle, Palette, Type, X } from "lucide-react";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { useToast } from "@/components/ui/ToastProvider";
import { isNative } from "@/lib/native";
import { safeBack } from "@/lib/safe-back";
import { formatInr, PLANS, TRIAL_DAYS, type PlanId } from "@/lib/billing/plans";
import { subscribe } from "@/lib/billing/checkout";

const noop = () => () => {};

/** The two plans side by side, row by row. `verified` is whether the ₹99 plan has it; Premium has them all. */
const ROWS: { icon: React.ReactNode; name: string; sub: string; verified: boolean }[] = [
  { icon: <VerifiedStar className="h-[18px] w-[18px] text-verified" />, name: "Verified badge", sub: "The blue star", verified: true },
  { icon: <Type size={17} />, name: "Name styles", sub: "Fonts and glows", verified: false },
  { icon: <Frame size={17} />, name: "Avatar frames", sub: "On every post and chat", verified: false },
  { icon: <MessageCircle size={17} />, name: "Chat bubbles", sub: "Your look in every chat", verified: false },
  { icon: <Palette size={17} />, name: "Chat themes", sub: "Pond, Galaxy and more", verified: false },
  { icon: <ImageIcon size={17} />, name: "Profile banners", sub: "Premium banners", verified: false },
];

/**
 * The paywall: what Free has next to what Premium adds, then one card that
 * starts the trial. The reminder it mentions is real — remind_trials_ending()
 * (migration 0080) sends it two days before a trial ends.
 *
 * Inside the Android app nothing can be bought (Play only allows its own
 * billing for digital items), so the card says so instead.
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
  const [busy, setBusy] = useState<PlanId | null>(null);

  const premium = PLANS.premium;
  const verified = PLANS.verified;

  async function start(plan: PlanId) {
    if (busy) return;
    if (!configured) {
      toast("Payments are coming soon", "plain");
      return;
    }
    setBusy(plan);
    const result = await subscribe(plan, PLANS[plan].name);
    setBusy(null);
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

  return (
    <div className="relative isolate mx-auto min-h-[calc(100dvh-84px)] w-full max-w-[480px] overflow-hidden">
      {/* Black, a green glow through the middle, black again */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(70% 38% at 70% 46%, rgba(163,230,53,0.28), transparent 70%), radial-gradient(90% 45% at 25% 58%, rgba(21,128,61,0.45), transparent 72%), linear-gradient(180deg, #0a0a0a 0%, #0a0a0a 16%, #0c1f10 48%, #0a0a0a 86%)",
        }}
      />

      <div className="flex min-h-[calc(100dvh-84px)] flex-col px-5 pb-4 pt-[calc(0.5rem+var(--sat))]">
        {/* Close and wordmark */}
        <div className="relative flex h-10 items-center justify-center">
          <button
            type="button"
            onClick={() => safeBack(router)}
            aria-label="Close"
            className="absolute left-0 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-foreground transition active:scale-95"
          >
            <X size={20} />
          </button>
          <span className="text-[22px] font-extrabold tracking-tight">
            Hypefy<span className="text-accent">.</span>
          </span>
        </div>

        {/* Heading */}
        <div className="mt-4 text-center [@media(max-height:760px)]:mt-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            {hasPremium ? "You're in" : trialEligible ? `${TRIAL_DAYS} days free` : "Hypefy Premium"}
          </p>
          <h1 className="mt-1.5 text-[28px] font-extrabold leading-none tracking-tight">Go Premium</h1>
          <p className="mt-1.5 text-[14px] text-muted">Look like no one else.</p>
        </div>

        {/* Free vs Premium */}
        <div className="mt-5 [@media(max-height:760px)]:mt-3">
          <div className="flex items-center gap-3 px-1 pb-1">
            <span className="flex-1 text-[12px] text-muted">What you get</span>
            <span className="flex w-16 flex-col items-center leading-tight">
              <span className="text-[11px] text-muted">Badge</span>
              <span className="text-[14px] font-extrabold tabular-nums">{formatInr(verified.pricePaise)}</span>
            </span>
            <span className="flex w-[76px] flex-col items-center rounded-2xl bg-accent/15 py-1 leading-tight">
              <span className="text-[11px] font-semibold text-accent">Premium</span>
              <span className="text-[14px] font-extrabold tabular-nums text-accent">{formatInr(premium.pricePaise)}</span>
            </span>
          </div>
          <ul className="flex flex-col">
            {ROWS.map((r) => (
              <li key={r.name} className="flex items-center gap-3 px-1 py-[7px] [@media(max-height:760px)]:py-[5px]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-foreground">
                  {r.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight">{r.name}</span>
                  <span className="block truncate text-[12px] text-muted [@media(max-height:760px)]:hidden">{r.sub}</span>
                </span>
                <span className="flex w-16 justify-center">
                  {r.verified ? <Yes /> : <No />}
                </span>
                <span className="flex w-[76px] justify-center">
                  <Yes />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-h-3 flex-1" />

        {/* The card that starts it */}
        {hasPremium ? (
          <Link
            href="/settings/subscription"
            className="flex items-center justify-between rounded-3xl border border-accent/40 bg-black/70 px-5 py-4 transition active:scale-[0.99]"
          >
            <span>
              <span className="block text-[18px] font-extrabold">You’re Premium</span>
              <span className="block text-[13px] text-muted">Manage your plan</span>
            </span>
            <span className="rounded-full bg-accent/15 px-3 py-1 text-[12px] font-bold text-accent">Active</span>
          </Link>
        ) : native ? (
          <p className="rounded-3xl bg-black/70 px-5 py-5 text-center text-sm text-muted">
            Premium isn’t available in the app yet.
          </p>
        ) : (
          <button
            type="button"
            onClick={() => start("premium")}
            disabled={!!busy}
            className="flex items-center gap-3 rounded-3xl bg-accent px-5 py-3 text-left text-accent-ink transition active:scale-[0.99] disabled:opacity-70"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[18px] font-extrabold leading-tight">
                {busy === "premium" && <Loader2 size={18} className="animate-spin" />}
                {trialEligible ? `Start ${TRIAL_DAYS}-day free trial` : "Get Premium"}
              </span>
              <span className="mt-0.5 block text-[13px] font-medium text-accent-ink/70">
                {trialEligible
                  ? `₹0 today, then ${formatInr(premium.pricePaise)}/month`
                  : `${formatInr(premium.pricePaise)}/month`}
              </span>
            </span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/85 text-accent">
              <ArrowRight size={18} strokeWidth={2.5} />
            </span>
          </button>
        )}

        {!hasPremium && !native && (
          <p className="mt-2 text-center text-[12px] text-muted [text-wrap:balance]">
            {trialEligible ? "We’ll remind you 2 days before it ends. " : ""}Cancel anytime ·{" "}
            <Link href="/terms#paid" className="underline underline-offset-2">
              Terms
            </Link>
          </p>
        )}

        {!hasPremium && (
          hasVerified ? (
            <p className="mt-3 flex h-11 items-center justify-center gap-1.5 text-[14px] font-semibold text-muted">
              <VerifiedStar className="h-4 w-4 text-verified" /> Verified · Active
            </p>
          ) : native ? null : (
            <button
              type="button"
              onClick={() => start("verified")}
              disabled={!!busy}
              className="mt-3 flex h-11 items-center justify-center gap-2 rounded-full bg-white/[0.07] text-[14px] font-semibold transition active:scale-[0.98] disabled:opacity-60"
            >
              {busy === "verified" && <Loader2 size={15} className="animate-spin" />}
              Just the badge · {formatInr(verified.pricePaise)}/month
            </button>
          )
        )}

        {(hasPremium || native) && (
          <p className="mt-3 text-center text-[11px] text-faint">
            <Link href="/terms#paid" className="underline-offset-2 hover:underline">
              Terms
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

function Yes() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-ink" aria-label="Included">
      <Check size={14} strokeWidth={3} />
    </span>
  );
}

function No() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-faint" aria-label="Not included">
      <X size={12} strokeWidth={2.5} />
    </span>
  );
}
