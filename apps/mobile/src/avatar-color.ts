/**
 * The gradient-avatar's two colours, as hex.
 *
 * Separate from avatar.tsx, and not for tidiness: that file imports
 * react-native, which cannot be loaded in a Node test, so maths left inside
 * it could only ever be checked by reading the source as text. Here it can
 * be called, and a wrong conversion fails rather than looks right.
 *
 * The web's Avatar fills the squircle with
 * `linear-gradient(140deg, hsl(h 75% 52%), hsl(h+50 70% 38%))`. Those four
 * numbers and the +50 are the web's; everything else is arithmetic.
 */

/** The web's first stop: saturation and lightness. */
export const STOP_FROM = { s: 75, l: 52 } as const;
/** The web's second stop, at a hue 50 further round. */
export const STOP_TO = { s: 70, l: 38, hueShift: 50 } as const;

/**
 * `hsl(h s% l%)` as `#rrggbb`.
 *
 * react-native-svg hands colour strings to the platform renderer, and
 * `hsl(...)` support there is not something to rely on — so the conversion
 * happens here rather than in a renderer that may silently paint black.
 */
export function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const rgb =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = lig - c / 2;
  const byte = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(rgb[0])}${byte(rgb[1])}${byte(rgb[2])}`;
}

/** The two stops the web interpolates between, for one hue. */
export function avatarStops(hue: number): readonly [string, string] {
  return [
    hslToHex(hue, STOP_FROM.s, STOP_FROM.l),
    hslToHex((hue + STOP_TO.hueShift) % 360, STOP_TO.s, STOP_TO.l),
  ];
}
