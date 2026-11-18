import { View, StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Compass, Search, Library, ShoppingBag, Settings } from "lucide-react-native";
import { specFor, type LucideIconName } from "@/icon-map";
import { PHOSPHOR_PATHS, PHOSPHOR_VIEW_BOX } from "@/phosphor-paths";
import { palette } from "@/theme";

/**
 * The navigation's icons, drawn the way the web draws them.
 *
 * Two libraries, because the web uses two: Lucide for almost everything
 * (245 files) and Phosphor for the bottom bar (6). Rather than pick one and
 * approximate the other, both are reproduced exactly —
 * `lucide-react-native` is pinned to the same 1.17.0 as the web's
 * `lucide-react`, and the Phosphor shapes are that package's own path data.
 *
 * Phosphor's grid is 256 and Lucide's is 24, which is why the Phosphor
 * branch carries its own viewBox and the Lucide one does not.
 */

/**
 * Lucide has no dynamic lookup that survives bundling, so the components
 * used are listed. The union in icon-map keeps this map and that list from
 * drifting: a name there with no entry here will not compile.
 */
const LUCIDE: Record<LucideIconName, typeof Compass> = {
  Compass,
  Search,
  Library,
  ShoppingBag,
  Settings,
};

/** Matches the web's `strokeWidth={2.2}` on the top bar's compass. */
const LUCIDE_STROKE = 2.2;

export function DestinationIcon({
  href,
  focused,
  color,
  size,
}: {
  href: string;
  focused: boolean;
  color: string;
  size: number;
}) {
  const spec = specFor(href);

  if (spec.kind === "phosphor") {
    // The web's rule, verbatim: weight={active ? "fill" : "regular"}.
    const weight = focused ? "fill" : "regular";
    return (
      <Svg width={size} height={size} viewBox={PHOSPHOR_VIEW_BOX}>
        {PHOSPHOR_PATHS[spec.name][weight].map((d) => (
          <Path key={d} d={d} fill={color} />
        ))}
      </Svg>
    );
  }

  if (spec.kind === "lucide") {
    const Icon = LUCIDE[spec.name];
    return <Icon size={size} color={color} strokeWidth={LUCIDE_STROKE} />;
  }

  /*
   * The avatar slot. The web puts the viewer's own picture here, with a
   * ring when the tab is active. There is no profile data on native yet,
   * so this is a ring and nothing else — visibly a placeholder rather than
   * a generic person glyph, which would read as a finished choice.
   */
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        focused && styles.avatarActive,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderWidth: 2,
    backgroundColor: palette.surface,
  },
  avatarActive: { borderWidth: 2.5 },
});
