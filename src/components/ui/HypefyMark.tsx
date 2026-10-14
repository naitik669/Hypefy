import { MARK_BOX, MARK_DOT, MARK_LETTER } from "@/lib/hypefy-mark";

/**
 * The Hypefy mark: the blocky H and its lime full stop.
 *
 * A plain `<svg>` with no hooks, so it renders in server components and
 * inside the QR badge alike. `tone` picks which way round it sits — "light"
 * for the letter in white on something dark, "ink" for the letter in near
 * black on something light, which is what the badge in the middle of a QR
 * code needs.
 */
export function HypefyMark({
  size = 24,
  tone = "light",
  dot = "var(--color-accent)",
  className = "",
}: {
  size?: number;
  tone?: "light" | "ink";
  /** The full stop's colour. Lime unless the surface is already lime. */
  dot?: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}
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
