import { nameStyle } from "@/lib/cosmetics";

/**
 * A person's name, in the font and glow they chose — or plain, if they chose
 * none or no longer have Premium. Inherits size and weight from where it
 * sits, so it drops into any existing name slot.
 */
export function DisplayName({
  name,
  profile,
  className = "",
}: {
  name: string;
  profile: { name_font?: string | null; name_glow?: string | null; is_premium?: boolean | null } | null | undefined;
  className?: string;
}) {
  const style = profile ? nameStyle(profile) : undefined;
  return (
    <span className={className} style={style}>
      {name}
    </span>
  );
}
