import s from "./empty.module.css";

/** Seconds from mount at which each beat arrives. */
export type SceneTiming = { head?: number; sub?: number; cta?: number };

const DEFAULT_TIMING = { head: 1, sub: 1.35, cta: 1.7 };

/** Lime squircle button, for actions that make something. */
export const ctaClass =
  "inline-flex items-center justify-center gap-1.5 rounded-[14px] bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-ink transition-transform active:scale-95";
/** Dark squircle button, for actions that only move you around. */
export const ghostCtaClass =
  "inline-flex items-center justify-center gap-1.5 rounded-[14px] bg-elevated px-5 py-2.5 text-sm font-extrabold text-foreground transition-transform active:scale-95";

const delay = (seconds: number) => ({ ["--d" as string]: `${seconds}s` }) as React.CSSProperties;

/**
 * An illustrated empty state: an animated grey object, then a headline, a
 * line and a button, each arriving in turn (see empty.module.css).
 *
 * `cta` is rendered as given and animated in; pass `animateCta={false}` for
 * a button that should simply be there from the start and sit still, like
 * Search's Clear search.
 */
export function EmptyScene({
  art,
  title,
  mark = ".",
  text,
  cta,
  animateCta = true,
  children,
  timing,
  className = "px-6 py-14",
}: {
  art: React.ReactNode;
  title: string;
  /** The lime punctuation after the headline; "" for none. */
  mark?: string;
  text: React.ReactNode;
  cta?: React.ReactNode;
  animateCta?: boolean;
  /** Anything after the button, e.g. suggestions that pop in on their own. */
  children?: React.ReactNode;
  timing?: SceneTiming;
  className?: string;
}) {
  const t = { ...DEFAULT_TIMING, ...timing };
  return (
    <div className={`${s.scene} ${className}`}>
      {art}
      <h2 className={`${s.head} mt-1.5 text-[21px] font-extrabold leading-tight tracking-[-0.02em]`} style={delay(t.head)}>
        {title}
        {mark && <span className="text-accent">{mark}</span>}
      </h2>
      <p className={`${s.sub} max-w-[240px] text-[13px] leading-snug text-muted`} style={delay(t.sub)}>
        {text}
      </p>
      {cta && (
        <div className={`${animateCta ? s.cta : ""} mt-1.5 rounded-[14px]`} style={animateCta ? delay(t.cta) : undefined}>
          {cta}
        </div>
      )}
      {children}
    </div>
  );
}

/** The same delayed entrance for extra lines, like "For inspiration, explore more". */
export function SceneLine({ at, children, className = "" }: { at: number; children: React.ReactNode; className?: string }) {
  return (
    <p className={`${s.sub} ${className}`} style={delay(at)}>
      {children}
    </p>
  );
}

/** Pops a piece in at `at` seconds, like a suggestion card. */
export function ScenePop({ at, children, className = "" }: { at: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${s.pop} ${className}`} style={delay(at)}>
      {children}
    </div>
  );
}
