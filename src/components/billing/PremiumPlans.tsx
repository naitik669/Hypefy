"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Palette, Sparkles, Type, Frame, Smartphone, MessageCircle } from "lucide-react";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { useToast } from "@/components/ui/ToastProvider";
import { isNative } from "@/lib/native";
import { formatInr, PLANS, PREMIUM_PERKS, TRIAL_DAYS, type PlanId } from "@/lib/billing/plans";
import { subscribe } from "@/lib/billing/checkout";

const PERK_ICONS = [VerifiedStar, Type, Frame, MessageCircle, Palette, Smartphone] as const;

const noop = () => () => {};

/**
 * The paywall, pitched as an invitation: Premium leads with a free month,
 * and "just the badge" sits below for anyone who only wants that.
 *
 * Inside the Android app nothing can be bought — Play only allows its own
 * billing for digital items — so the buttons give way to a plain note and
 * nothing points anywhere else to pay.
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
  const trial = premium.trial && trialEligible;

  async function start(plan: PlanId) {
    if (busy) return;
    setBusy(plan);
    const result = await subscribe(plan, plan === "premium" ? premium.name : verified.name);
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

  const buyable = configured && !native;

  return (
    <div className="flex flex-col gap-5 px-4 pb-12 pt-4">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(56,151,240,0.28),transparent_60%),radial-gradient(80%_60%_at_100%_100%,rgba(163,230,53,0.14),transparent_70%)] bg-elevated px-5 pb-6 pt-8 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center">
          <VerifiedStar className="h-20 w-20 text-verified drop-shadow-[0_0_24px_rgba(56,151,240,0.55)]" />
        </div>
        <h2 className="mt-4 text-2xl font-black tracking-tight">Hypefy Premium</h2>
        <p className="mx-auto mt-1.5 max-w-[30ch] text-sm text-muted">
          The badge, your own style, and chats that look like yours.
        </p>

        <p className="mt-4 text-sm">
          <span className="text-2xl font-black tabular-nums">{formatInr(premium.pricePaise)}</span>
          <span className="text-muted">/month</span>
        </p>

        {hasPremium ? (
          <Link
            href="/settings/subscription"
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 text-sm font-bold"
          >
            <Check size={16} /> You have Premium · Manage
          </Link>
        ) : buyable ? (
          <>
            <button
              type="button"
              onClick={() => start("premium")}
              disabled={!!busy}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-accent py-3.5 text-sm font-extrabold text-accent-ink transition active:scale-[0.98] disabled:opacity-60"
            >
              {busy === "premium" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {trial ? "Start your free month" : "Get Premium"}
            </button>
            <p className="mt-2.5 text-[11px] leading-snug text-faint">
              {trial
                ? `Free for ${TRIAL_DAYS === 30 ? "1 month" : `${TRIAL_DAYS} days`}, then ${formatInr(premium.pricePaise)}/month. Cancel anytime in Settings — no charge if you cancel before the month ends.`
                : `${formatInr(premium.pricePaise)}/month, renews monthly. Cancel anytime in Settings.`}
            </p>
          </>
        ) : (
          <p className="mt-5 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm text-muted">
            {native ? "Premium isn't available in the app yet." : "Premium is coming soon."}
          </p>
        )}
      </section>

      {/* What's included */}
      <section>
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">What you get</p>
        <ul className="overflow-hidden rounded-2xl border border-border bg-elevated divide-y divide-border/70">
          {PREMIUM_PERKS.map((perk, i) => {
            const Icon = PERK_ICONS[i];
            return (
              <li key={perk.title} className="flex items-center gap-3 px-3 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-surface">
                  {i === 0 ? (
                    <VerifiedStar className="h-5 w-5 text-verified" />
                  ) : (
                    <Icon size={18} className="text-foreground" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{perk.title}</span>
                  <span className="block text-xs text-muted">{perk.sub}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Just the badge */}
      {!hasPremium && (
        <section className="rounded-2xl border border-border bg-elevated p-4">
          <div className="flex items-center gap-3">
            <VerifiedStar className="h-9 w-9 shrink-0 text-verified" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">Just the badge</p>
              <p className="text-xs text-muted">
                <span className="tabular-nums">{formatInr(verified.pricePaise)}</span>/month · the blue star, nothing else
              </p>
            </div>
            {hasVerified ? (
              <span className="flex items-center gap-1 rounded-full bg-verified/15 px-2.5 py-1 text-xs font-bold text-verified">
                <Check size={12} /> Active
              </span>
            ) : buyable ? (
              <button
                type="button"
                onClick={() => start("verified")}
                disabled={!!busy}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 text-xs font-bold transition active:scale-95 disabled:opacity-60"
              >
                {busy === "verified" && <Loader2 size={13} className="animate-spin" />}
                Get Verified
              </button>
            ) : null}
          </div>
          {hasVerified && buyable && (
            <p className="mt-3 text-[11px] leading-snug text-faint">
              Moving up to Premium? Cancel Verified in Settings so you aren&apos;t charged for both.
            </p>
          )}
        </section>
      )}

      <Link
        href="/shop"
        className="flex items-center justify-between rounded-2xl border border-border bg-elevated px-4 py-3 text-sm"
      >
        <span>
          <span className="block font-bold">Shop</span>
          <span className="block text-xs text-muted">Decorations and chat themes to keep, Premium or not</span>
        </span>
        <span aria-hidden className="text-faint">›</span>
      </Link>
    </div>
  );
}
