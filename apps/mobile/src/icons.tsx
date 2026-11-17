import Ionicons from "@expo/vector-icons/Ionicons";
import { iconFor } from "@/icon-map";

/**
 * The navigation's icons.
 *
 * `@hypefy/core/navigation` holds the destinations as data and deliberately
 * carries no icons — an icon is a React component, and core is imported by
 * both clients. Each client maps a destination to its own icon set; for
 * this one, that mapping is `icon-map.ts`, which is data and nothing else
 * so a test can read it.
 *
 * This file is the component half, and is all the call sites see.
 */
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
  return <Ionicons name={iconFor(href, focused)} color={color} size={size} />;
}
