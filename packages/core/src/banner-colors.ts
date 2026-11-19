import { BANNERS, DEFAULT_BANNER_ID } from "./profile";

/**
 * A banner's colours, pulled out of its CSS gradient.
 *
 * The banners are declared once, as CSS, in `profile.ts` — and CSS
 * gradients do not exist in React Native. The three obvious options were
 * all worse than this one:
 *
 *  - **Retype the colours for the phone.** Two lists of six, drifting the
 *    first time a banner is tweaked, and nothing would notice.
 *  - **Add a native-colours field to BANNERS.** Same drift, one file
 *    closer: the CSS and the field could disagree and both look right.
 *  - **A general CSS gradient parser.** Far more machinery than six
 *    strings deserve, and it would fail quietly on anything unexpected.
 *
 * So this reads the colours OUT of the CSS the web already renders, and
 * `tests/banner-colors.test.ts` asserts every entry in BANNERS parses. A
 * seventh banner in a shape this does not understand fails that test
 * rather than rendering as a black rectangle on the phone.
 *
 * What it extracts is deliberately modest: the solid base colour, and the
 * one tinted overlay if there is one. The phone draws those as a two-stop
 * gradient. It is not the same picture as the web's — a radial wash at
 * 25% -20% is not a linear fade — and that is recorded rather than
 * pretended at.
 */

export type BannerColors = {
  /** The flat colour underneath everything. */
  readonly base: string;
  /** The tint laid over it, if the gradient has one. */
  readonly accent: string | null;
};

/** `rgba(163,230,53,0.40)` or `#0d0d0d`, as written in the CSS. */
const COLOR = /#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/gi;

/**
 * The colours of one gradient string.
 *
 * The base is the LAST colour in the declaration, because CSS paints
 * layers back to front: a `..., #0d0d0d` tail is the ground, and in a
 * `linear-gradient(135deg, a, b, c)` the last stop is what the far end
 * settles to. The accent is the first colour, which is the tint or the
 * near end.
 *
 * Returns null when there is no colour at all, so a caller can fall back
 * rather than render transparent.
 */
export function parseBannerGradient(css: string): BannerColors | null {
  const found = css.match(COLOR);
  if (!found || found.length === 0) return null;
  const base = found[found.length - 1];
  const accent = found.length > 1 ? found[0] : null;
  return { base, accent };
}

/**
 * A banner id's colours, falling back to the default banner's.
 *
 * The same fallback `bannerGradient` uses, for the same reason: a stored
 * id from a removed banner must still render something.
 */
export function bannerColors(id?: string | null): BannerColors {
  const banner = BANNERS.find((b) => b.id === id);
  const fallback = BANNERS.find((b) => b.id === DEFAULT_BANNER_ID);
  const parsed = banner ? parseBannerGradient(banner.gradient) : null;
  if (parsed) return parsed;
  const base = fallback ? parseBannerGradient(fallback.gradient) : null;
  // The default banner is asserted to parse, so this last resort is only
  // reachable if BANNERS itself is empty.
  return base ?? { base: "#0d0d0d", accent: null };
}
