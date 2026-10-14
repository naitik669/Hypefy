import { MARK_BOX, MARK_DOT, MARK_LETTER, MARK_LOCKUP } from "@/lib/hypefy-mark";

/**
 * The Hypefy mark: the blocky H and its lime full stop.
 *
 * A plain `<svg>` with no hooks, so it renders in server components and
 * inside the QR badge alike.
 *
 * `fit` decides what the given size measures. "box" is the square the mark
 * is designed in, with margin above and below — right when it sits in a row
 * beside text at a matching cap height. "ink" crops to the lockup itself, so
 * the mark fills the space it is given; that is what a badge or a watermark
 * wants, and getting it wrong is why the mark used to look small and
 * off-centre in the middle of the code.
 */
export function HypefyMark({
  size = 24,
  fit = "box",
  tone = "light",
  dot = "var(--color-accent)",
  className = "",
}: {
  /** The width. With fit="box" it is also the height. */
  size?: number;
  fit?: "box" | "ink";
  tone?: "light" | "ink";
  /** The full stop's colour. Lime unless the surface is already lime. */
  dot?: string;
  className?: string;
}) {
  const ink = fit === "ink";
  return (
    <svg
      width={size}
      height={ink ? (size * MARK_LOCKUP.h) / MARK_LOCKUP.w : size}
      viewBox={ink ? `0 ${MARK_LOCKUP.y} ${MARK_LOCKUP.w} ${MARK_LOCKUP.h}` : `0 0 ${MARK_BOX} ${MARK_BOX}`}
      className={className}
      role="img"
      aria-label="Hypefy"
    >
      {MARK_LETTER.map((r) => (
        <rect
          key={`${r.x}-${r.y}`}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={tone === "ink" ? "#0a0a0a" : "#ffffff"}
        />
      ))}
      <rect x={MARK_DOT.x} y={MARK_DOT.y} width={MARK_DOT.w} height={MARK_DOT.h} fill={dot} />
    </svg>
  );
}

/**
 * The wordmark, as it is set everywhere else in the app: the name, then the
 * full stop in the accent. Here so the card's foot and the app's headers
 * cannot drift apart.
 */
export function HypefyWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      Hypefy<span className="text-accent">.</span>
    </span>
  );
}
