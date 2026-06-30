"use client";

import { presenceLabel } from "@/lib/presence";

/**
 * Presence indicator badge: green dot (online), yellow half-moon (idle),
 * or nothing (offline / activity hidden). Placed absolutely over an avatar.
 * size="md" for inbox (52px avatar), size="sm" for chat header (36px avatar).
 */
export function PresenceDot({
  lastSeenAt,
  size = "md",
}: {
  lastSeenAt: string | null | undefined;
  size?: "sm" | "md";
}) {
  const pres = presenceLabel(lastSeenAt);
  if (!pres || pres.status === "offline") return null;

  const dim = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const pos = size === "sm" ? "-bottom-0.5 -right-0.5" : "-bottom-0.5 -right-0.5";
  const border = "border-2 border-background";

  if (pres.status === "online") {
    return (
      <span
        className={`absolute ${pos} ${dim} rounded-full ${border} bg-green-500`}
      />
    );
  }

  // Idle: yellow circle with a crescent cutout (half-moon like Discord)
  const px = size === "sm" ? 12 : 14;
  return (
    <span className={`absolute ${pos} flex ${dim} items-center justify-center rounded-full ${border} bg-yellow-400`}>
      <svg
        width={px}
        height={px}
        viewBox="0 0 14 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        {/* Crescent: full circle minus an offset circle cutout */}
        <circle cx="7" cy="7" r="7" fill="#FACC15" />
        <circle cx="9.5" cy="4.5" r="5.5" fill="var(--color-background, #0a0a0a)" />
      </svg>
    </span>
  );
}
