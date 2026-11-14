/**
 * How long a clip is, read from the file itself.
 *
 * The composer needs this at pick time: it is the only moment the file is
 * in front of a decoder before the upload commits to it, and refusing a
 * two-minute video after it has gone up a phone uplink is the worst
 * possible moment to find out.
 *
 * Resolves rather than rejects. A null means "we could not read it", which
 * every caller treats as let it through — the same call video-poster.ts
 * already makes about a poster it cannot capture, and for the same reason:
 * refusing somebody's post over a decoder quirk is a far worse outcome
 * than letting an unusual file past a length check.
 */

/** How long to wait for metadata before giving up. */
export const METADATA_TIMEOUT_MS = 6000;

export async function clipSeconds(
  objectUrl: string,
  timeoutMs = METADATA_TIMEOUT_MS,
): Promise<number | null> {
  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const done = (secs: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      // Detach the source so the decoder lets go of the file.
      video.removeAttribute("src");
      video.load();
      resolve(secs);
    };

    const timer = setTimeout(() => done(null), timeoutMs);

    video.onloadedmetadata = () => {
      const d = video.duration;
      // A stream with no known length reports Infinity, which is not a
      // duration and must not be compared against a limit.
      done(Number.isFinite(d) && d > 0 ? d : null);
    };
    video.onerror = () => done(null);

    video.preload = "metadata";
    video.muted = true;
    video.src = objectUrl;
  });
}
