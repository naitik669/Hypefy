/**
 * What a call needs before it can start, on the caller's side: the servers to
 * connect through, and words for when the camera or microphone will not open.
 */

const STUN_ONLY: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

/** Reused for this long: comfortably inside the hour a minted login lasts. */
const KEEP_MS = 30 * 60 * 1000;

let kept: { config: RTCConfiguration; at: number } | null = null;

/** For tests. */
export function forgetRtcConfig() {
  kept = null;
}

/**
 * The servers to connect through, from /api/calls/ice.
 *
 * Never throws and never blocks a call: if the answer cannot be had, the
 * call goes ahead without a relay, which is what it did before there was one.
 */
export async function getRtcConfig(now = Date.now()): Promise<RTCConfiguration> {
  if (kept && now - kept.at < KEEP_MS) return kept.config;
  // Past its time: a login that may have expired is not offered to a new peer.
  kept = null;
  try {
    const res = await fetch("/api/calls/ice", { cache: "no-store" });
    if (!res.ok) return STUN_ONLY;
    const json = (await res.json()) as { iceServers?: RTCIceServer[] };
    if (!Array.isArray(json.iceServers) || json.iceServers.length === 0) return STUN_ONLY;
    kept = { config: { iceServers: json.iceServers }, at: now };
    return kept.config;
  } catch {
    return STUN_ONLY;
  }
}

/**
 * The servers last fetched, for the moment a peer is made. Always something
 * usable: before the first answer, or after a failed one, the public finder.
 */
export function currentRtcConfig(): RTCConfiguration {
  return kept?.config ?? STUN_ONLY;
}

/**
 * Why a call could not start, in words.
 *
 * Every failure used to be reported as a missing permission: a phone with no
 * camera, a microphone another app was holding, and a dropped connection all
 * told the person to go and grant something they had already granted.
 */
export function callStartError(err: unknown, doing: "call" | "answer"): string {
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Allow the camera and microphone to ${doing}.`;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera or microphone was found on this device.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera or microphone is in use by another app.";
  }
  return doing === "call" ? "Couldn't start the call. Try again." : "Couldn't answer the call. Try again.";
}
