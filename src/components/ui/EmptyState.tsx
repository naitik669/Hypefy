import Link from "next/link";
import { HypefyMark } from "@/components/HypefyMark";
import { HypeMascot } from "@/components/mascot/HypeMascot";

type IconType = React.ComponentType<{ size?: number; className?: string }>;

/**
 * The one empty state for every blank surface. Full variant for whole
 * screens, compact for inside sheets/sections; `mascot` swaps the icon
 * chip for the floating Hypefy mascot when a blank page deserves some
 * personality.
 */
export function EmptyState({
  icon: Icon,
  title,
  text,
  ctaLabel,
  ctaHref,
  variant = "full",
  mascot = false,
}: {
  icon?: IconType;
  title: string;
  text: string;
  ctaLabel?: string;
  ctaHref?: string;
  variant?: "full" | "compact";
  mascot?: boolean;
}) {
  const compact = variant === "compact";
  return (
    <div
      className={`animate-rise flex flex-col items-center justify-center text-center ${
        compact ? "gap-2 px-6 py-10" : "gap-3 px-8 py-24"
      }`}
    >
      {mascot ? (
        <HypeMascot animated size={compact ? "sm" : "md"} />
      ) : (
        <div
          className={`flex items-center justify-center rounded-2xl bg-surface text-muted ${
            compact ? "h-12 w-12" : "h-16 w-16"
          }`}
        >
          {Icon ? (
            <Icon size={compact ? 22 : 28} />
          ) : (
            <HypefyMark spin className={compact ? "h-6 w-6 text-accent" : "h-8 w-8 text-accent"} />
          )}
        </div>
      )}
      <h2 className={compact ? "text-sm font-bold" : "text-lg font-bold"}>{title}</h2>
      <p className={`max-w-xs text-muted ${compact ? "text-xs" : "text-sm"}`}>{text}</p>
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="mt-2 rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink transition-transform active:scale-95"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  );
}
