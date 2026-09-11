/**
 * A squircle — the rounded square between a square and a circle
 * (|x|⁴·⁵ + |y|⁴·⁵ = 1), which reads as friendlier than a rounded rectangle
 * and more deliberate than a circle.
 *
 * border-radius cannot draw one (its corners are circular arcs, so the sides
 * go dead straight and then bend), so it is a polygon, in percent so it fits
 * any size.
 */
const N = 4.5;
const POINTS = Array.from({ length: 96 }, (_, i) => {
  const t = (i / 96) * Math.PI * 2;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const x = 50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / N);
  const y = 50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / N);
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
});

export const SQUIRCLE = `polygon(${POINTS.map(([x, y]) => `${x}% ${y}%`).join(", ")})`;
const SVG_POINTS = POINTS.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * One colour to pick, as a squircle. The chosen one grows a little and wears
 * a white ring just inside its edge — inside, so it follows the curve rather
 * than boxing it.
 */
export function SquircleSwatch({
  background,
  selected,
  label,
  onClick,
  size = 32,
  fill = false,
}: {
  background: string;
  selected: boolean;
  label: string;
  onClick: () => void;
  /** Its size; with `fill`, the most it grows to. */
  size?: number;
  /** As wide as its cell, up to `size` — for a row that must fit any width. */
  fill?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`relative shrink-0 transition-transform duration-200 active:scale-90 ${selected ? "scale-110" : ""}`}
      style={fill ? { width: "100%", maxWidth: size, aspectRatio: "1" } : { width: size, height: size }}
    >
      <span aria-hidden className="absolute inset-0" style={{ background, clipPath: SQUIRCLE }} />
      {/* A little light along the top, as if lit from above. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{ clipPath: SQUIRCLE, background: "linear-gradient(180deg, rgb(255 255 255 / 0.22), transparent 48%)" }}
      />
      {selected && (
        <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" style={{ clipPath: SQUIRCLE }}>
          <polygon points={SVG_POINTS} fill="none" stroke="white" strokeWidth={size < 30 ? 16 : 13} />
        </svg>
      )}
    </button>
  );
}
