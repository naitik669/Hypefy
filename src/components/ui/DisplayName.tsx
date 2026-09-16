import type { CSSProperties } from "react";
import { nameStyle } from "@/lib/cosmetics";

/**
 * A person's name, in the font and glow they chose — or plain, if they chose
 * none or no longer have Premium. Inherits size and weight from where it
 * sits, so it drops into any existing name slot.
 *
 * A glow spreads past the letters, and a name is usually truncated, which
 * clips at the edge of its box: the glow was cut off in a hard rectangle.
 * A glowing name gets room inside its own box (padding, cancelled by equal
 * negative margins so nothing moves). Anything that truncates a name should
 * truncate this element, not a box around it, or that box clips it instead.
 */

/** How far the glow reaches past the letters, as room inside the box. */
export const GLOW_ROOM = { padding: "max(0.6em, 12px) max(0.7em, 14px)", margin: "min(-0.6em, -12px) min(-0.7em, -14px)" } as const;

/** A name style with room for its glow, for names drawn without this component. */
export function withGlowRoom(style: CSSProperties | undefined): CSSProperties | undefined {
  return style?.textShadow ? { ...style, ...GLOW_ROOM } : style;
}
export function DisplayName({
  name,
  profile,
  className = "",
}: {
  name: string;
  profile: { name_font?: string | null; name_glow?: string | null; is_premium?: boolean | null } | null | undefined;
  className?: string;
}) {
  const base = profile ? nameStyle(profile) : undefined;
  const style = withGlowRoom(base);
  return (
    <span className={className} style={style} data-name-glow={base?.textShadow ? "" : undefined}>
      {name}
    </span>
  );
}
