import Link from "next/link";
import { HypefyMark } from "@/components/HypefyMark";
import { HypeMascot } from "@/components/mascot/HypeMascot";

type IconType = React.ComponentType<{ size?: number; className?: string }>;

/** Friendly empty state with optional icon, mascot, and CTA. */
export function EmptyState({
  icon: Icon,
  title,
  text,
  ctaLabel,
  ctaHref,
  mascot = false,
}: {
  icon?: IconType;
  title: string;
  text: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Show the animated Hypefy mascot instead of the icon tile. */
  mascot?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-24 text-center">
      {mascot ? (
        <HypeMascot mood="friendly" size="md" animated />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface text-muted">
          {Icon ? (
            <Icon size={28} />
          ) : (
            <HypefyMark spin className="h-8 w-8 text-accent" />
          )}
        </div>
      )}
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="max-w-xs text-sm text-muted">{text}</p>
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
