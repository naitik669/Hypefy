/**
 * Presence status derived from a last-seen timestamp.
 *
 * online  — seen within 90s  (green dot)
 * idle    — seen 90s–5min ago (yellow half-moon; tab went to background, heartbeat stopped)
 * offline — seen 5min+ ago   (no indicator, "Active Xm/h/d ago")
 */
export type PresenceStatus = "online" | "idle" | "offline";

export function presenceLabel(
  lastSeenAt: string | null | undefined,
): { status: PresenceStatus; online: boolean; text: string } | null {
  if (!lastSeenAt) return null;
  const secs = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 1000);
  if (secs < 90)   return { status: "online",  online: true,  text: "Active now" };
  if (secs < 300)  return { status: "idle",    online: false, text: "Idle" };
  if (secs < 3600) return { status: "offline", online: false, text: `Active ${Math.floor(secs / 60)}m ago` };
  if (secs < 86400) return { status: "offline", online: false, text: `Active ${Math.floor(secs / 3600)}h ago` };
  return { status: "offline", online: false, text: `Active ${Math.floor(secs / 86400)}d ago` };
}
