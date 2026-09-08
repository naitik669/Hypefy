import Link from "next/link";
import { ChevronRight } from "lucide-react";

type IconType = React.ComponentType<{ size?: number; className?: string }>;

/**
 * A titled group of settings rows.
 *
 * The hub used to be four runs of bare rows separated only by a small
 * uppercase label, so a section ended where the next one's heading happened to
 * begin — nothing drew the boundary, and the screen read as one long
 * undifferentiated list. A card gives each group an edge, which is the whole
 * job: you can see where "General" stops without reading anything.
 */
export function SettingsCard({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      {title && (
        <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">
          {title}
        </p>
      )}
      {/* divide-y rather than a border on each row: the last row must not
          carry a rule against the card's own edge. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-elevated divide-y divide-border/70">
        {children}
      </div>
    </section>
  );
}

/**
 * One row inside a card. `href` makes it a link; `onClick` makes it a button;
 * neither makes it a plain block, which is how the account switcher and the
 * invite row sit inside a card without pretending to be tappable.
 */
export function SettingsRow({
  href,
  label,
  sub,
  icon: Icon,
  tone = "default",
  trailing,
}: {
  href: string;
  label: string;
  sub?: string;
  icon: IconType;
  /** "warn" tints the glyph for rows that lead somewhere consequential. */
  tone?: "default" | "warn";
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-3.5 transition-colors active:bg-white/[0.05] hover:bg-white/[0.03]"
    >
      {/* Squircle, matching the avatars and the create fan, rather than the
          circle this used to use — circles are for people in this app. */}
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${
          tone === "warn"
            ? "bg-danger/15 text-danger"
            : "bg-surface text-foreground"
        }`}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{label}</p>
        {sub && (
          <p className="truncate text-xs leading-snug text-muted">{sub}</p>
        )}
      </div>
      {trailing}
      <ChevronRight size={17} className="shrink-0 text-faint" />
    </Link>
  );
}
