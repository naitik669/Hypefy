/**
 * The share / send glyph, in one place.
 *
 * Every surface that shares or sends used lucide's `Send` — an upright,
 * hollow, symmetrical dart that reads as a generic "submit" arrow and dates
 * the whole app. This is a tilted plane with a folded wing: the silhouette
 * people already read as "send this on" in every messaging app they use, and
 * it sits properly next to the Phosphor icons in the tab bar (it is Phosphor's
 * PaperPlaneTilt geometry, MIT, inlined).
 *
 * Inlined rather than imported from the package for one reason: this renders
 * in server components too (the post preview, the intro mockups), and the
 * package's icons are client-only. A plain path has no such constraint.
 *
 * Weights match the icons it stands beside — `bold` next to the feed's 2.2
 * strokes, `fill` for a solid button, `regular` everywhere else.
 */
const PATHS = {
  regular:
    "M227.32,28.68a16,16,0,0,0-15.66-4.08l-.15,0L19.57,82.84a16,16,0,0,0-2.49,29.8L102,154l41.3,84.87A15.86,15.86,0,0,0,157.74,248q.69,0,1.38-.06a15.88,15.88,0,0,0,14-11.51l58.2-191.94c0-.05,0-.1,0-.15A16,16,0,0,0,227.32,28.68ZM157.83,231.85l-.05.14,0-.07-40.06-82.3,48-48a8,8,0,0,0-11.31-11.31l-48,48L24.08,98.25l-.07,0,.14,0L216,40Z",
  bold: "M230.14,25.86a20,20,0,0,0-19.57-5.11l-.22.07L18.44,79a20,20,0,0,0-3.06,37.25L99,157l40.71,83.65a19.81,19.81,0,0,0,18,11.38c.57,0,1.15,0,1.73-.07A19.82,19.82,0,0,0,177,237.56L235.18,45.65a1.42,1.42,0,0,0,.07-.22A20,20,0,0,0,230.14,25.86ZM156.91,221.07l-34.37-70.64,46-45.95a12,12,0,0,0-17-17l-46,46L34.93,99.09,210,46Z",
  fill: "M231.4,44.34s0,.1,0,.15l-58.2,191.94a15.88,15.88,0,0,1-14,11.51q-.69.06-1.38.06a15.86,15.86,0,0,1-14.42-9.15L107,164.15a4,4,0,0,1,.77-4.58l57.92-57.92a8,8,0,0,0-11.31-11.31L96.43,148.26a4,4,0,0,1-4.58.77L17.08,112.64a16,16,0,0,1,2.49-29.8l191.94-58.2.15,0A16,16,0,0,1,231.4,44.34Z",
};

export function Plane({
  size = 21,
  weight = "regular",
  className = "",
}: {
  size?: number;
  weight?: keyof typeof PATHS;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      className={className}
      aria-hidden
      focusable="false"
    >
      <path d={PATHS[weight]} />
    </svg>
  );
}
