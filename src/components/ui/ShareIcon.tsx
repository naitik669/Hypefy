/**
 * The share and send glyphs, in one place.
 *
 * They were one icon — Phosphor's tilted paper plane — for both, and it read
 * as chunky and pointed: a heavy outline with sharp tips. Now they are two,
 * because they are two different things:
 *
 *  - ShareIcon: a curved "pass it on" arrow. Passing a post, a Shot or a
 *    profile along to someone else — the feed and Shots rows, invite,
 *    Forward.
 *  - SendIcon: a rounded up-arrow. Sending your own words or media — the
 *    message bar, comments, replies, posting.
 *
 * Both are plain paths with round caps and joins, so they render in server
 * components too (the post preview, the intro mockups) and sit with the
 * lucide icons around them at the same stroke.
 *
 * `weight` keeps the old names so callers did not have to change: `bold` is
 * the feed's 2.2 stroke, `fill` the heavier one for inside a lime button,
 * `regular` everything else.
 */
const STROKE = { regular: 2, bold: 2.2, fill: 2.6 } as const;

type Props = {
  size?: number;
  weight?: keyof typeof STROKE;
  className?: string;
};

function Glyph({ size = 21, weight = "regular", className = "", children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE[weight]}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Pass it on: a curved arrow bending round to the right. */
export function ShareIcon(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M13.5 3.5 21 10.5l-7.5 7" />
      <path d="M21 10.5H11c-4.5 0-8 3.6-8 8.5" />
    </Glyph>
  );
}

/** Send: a rounded arrow straight up. */
export function SendIcon(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M12 20V4.5" />
      <path d="m5 11.5 7-7 7 7" />
    </Glyph>
  );
}

/**
 * Share, as a node graph: three points joined by two lines.
 *
 * The profile card uses this rather than the curved arrow above. The card
 * is a machined plate of straight edges and a blocky letterform, and a
 * drawn-by-hand curve sat oddly on it; three dots and two lines is the
 * oldest and most widely read share symbol there is, and it is built from
 * the same geometry as everything around it.
 */
export function ShareNodesIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      <circle cx="17.5" cy="5.5" r="2.6" />
      <circle cx="6.5" cy="12" r="2.6" />
      <circle cx="17.5" cy="18.5" r="2.6" />
      <path d="m8.75 10.7 6.5-3.9" />
      <path d="m8.75 13.3 6.5 3.9" />
    </svg>
  );
}

/**
 * Turn the card over: the card, with the turn drawn right around it.
 *
 * Of the glyphs tried, the only one that reads as "this object rotates" at
 * 18px without a second look. A page-corner curl read as a file icon, and
 * the card drawn edge-on mid-turn was too clever to be understood small.
 */
export function FlipIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect x="7.6" y="7.6" width="8.8" height="8.8" rx="1.8" />
      <path d="M12 2.7a9.3 9.3 0 0 1 9.3 9.3" />
      <path d="M12 21.3A9.3 9.3 0 0 1 2.7 12" />
      <path d="m18.1 1.9 3.6 2.4-2.4 3.6" />
      <path d="m5.9 22.1-3.6-2.4 2.4-3.6" />
    </svg>
  );
}
