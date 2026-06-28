/**
 * Presence label from a last-seen timestamp. "online" when seen within 90s;
 * otherwise a short "Active Nm/Nh/Nd ago". Returns null when unknown.
 */
export function presenceLabel(
  lastSeenAt: string | null | undefined,
): { online: boolean; text: string } | null {
  if (!lastSeenAt) return null;
  const secs = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (secs < 90) return { online: true, text: "Active now" };
  if (secs < 3600) return { online: false, text: `Active ${Math.floor(secs / 60)}m ago` };
  if (secs < 86400) return { online: false, text: `Active ${Math.floor(secs / 3600)}h ago` };
  return { online: false, text: `Active ${Math.floor(secs / 86400)}d ago` };
}
