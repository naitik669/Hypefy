import Svg, { Path } from "react-native-svg";

/**
 * Hypefy's own icons, the ones that are not Lucide or Phosphor.
 *
 * The web hand-draws these in `src/components/ui/`, so there is no package
 * to install — the geometry is the path data below, copied verbatim from
 * those components. `tests/mobile-glyphs.test.ts` asserts the web source
 * still contains each `d` string exactly, so a reshape on the site fails
 * the phone's test rather than quietly leaving two different stars.
 *
 * Copied by hand rather than generated, unlike the Phosphor set: there are
 * four path strings in total and they live in files this repo owns, where
 * the Phosphor data is 6 paths across a third-party package that gets
 * upgraded. A generator there is worth its weight; here it would be more
 * machinery than the job.
 *
 * All three are drawn on 24x24, like Lucide and unlike Phosphor's 256.
 */

const BOX = "0 0 24 24";

/**
 * The star. The web's default `fill` is "none" and `stroke` is
 * currentColor; the onboarding card uses it filled, as `fill-hype
 * text-hype`, which is both set to the same colour.
 */
export function HypeIcon({
  size = 24,
  color,
  fill = "none",
  strokeWidth = 2,
}: {
  size?: number;
  color: string;
  fill?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={BOX}>
      <Path
        d="M12 2.4 L14.94 7.96 L21.13 9.03 L16.76 13.55 L17.64 19.77 L12 17 L6.36 19.77 L7.24 13.55 L2.87 9.03 L9.06 7.96 Z"
        fill={fill}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** The speech bubble. Stroked, never filled, in the web's usages. */
export function CommentIcon({
  size = 24,
  color,
  fill = "none",
  strokeWidth = 2,
}: {
  size?: number;
  color: string;
  fill?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={BOX}>
      <Path
        d="M8.2 4 H15.8 A5.2 5.2 0 0 1 21 9.2 V12.3 A5.2 5.2 0 0 1 15.8 17.5 H11 L6.6 21 L7.6 17.5 H8.2 A5.2 5.2 0 0 1 3 12.3 V9.2 A5.2 5.2 0 0 1 8.2 4 Z"
        fill={fill}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * The share arrow.
 *
 * `ShareIcon.tsx` exports four glyphs that share one wrapper — Share, Send,
 * ShareNodes and Flip. This is the first, the two paths the wrapper draws
 * for `ShareIcon` itself. The web's stroke for the regular weight is 2.
 */
export function ShareIcon({
  size = 21,
  color,
  strokeWidth = 2,
}: {
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={BOX} fill="none">
      <Path
        d="M13.5 3.5 21 10.5l-7.5 7"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M21 10.5H11c-4.5 0-8 3.6-8 8.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
