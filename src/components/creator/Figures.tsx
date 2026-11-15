import { formatCount } from "@/lib/format";
import { Sparkline } from "@/components/charts/Sparkline";

/**
 * The two shapes every tab on the dashboard is built from.
 *
 * Extracted from the page when the second tab needed them, rather than
 * copied — two headings with slightly different letter-spacing is how a
 * dashboard starts looking like three screens instead of one.
 */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="px-1 pb-2 text-xs font-bold uppercase tracking-widest text-faint">
      {children}
    </h2>
  );
}

export function Figure({
  icon,
  label,
  value,
  spark,
  foot,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  spark?: number[];
  foot?: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface px-4 pb-2 pt-3">
      <span className="flex items-center gap-1.5 text-muted">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </span>
      <span className="mt-0.5 text-2xl font-black tabular-nums">{formatCount(value)}</span>
      {foot && <span className="text-[11px] text-faint">{foot}</span>}
      {spark && spark.length > 1 ? (
        <Sparkline values={spark} className="mt-1" />
      ) : (
        <span className="h-7" />
      )}
    </div>
  );
}
