/**
 * Pulling still frames out of a video the browser already has.
 *
 * Lifted out of ShotCoverPicker so the trimmer's filmstrip and the cover
 * picker's rail share one routine rather than each keeping a copy of the
 * careful bits — and the bits are careful:
 *
 * Extraction is sequential on purpose. A single video element seeked one
 * frame at a time is slower than firing several in parallel, but parallel
 * seeks on one element trample each other and several browsers simply drop
 * all but the last. One element per frame would decode the clip once per
 * frame on a phone.
 *
 * Every wait is bounded. A seek that never lands, or a clip the browser
 * cannot read at all, must give up rather than hang the strip forever.
 */

export type Frame = { time: number; url: string };

/** Thumbnails are small; no reason to decode them at full width. */
const STRIP_WIDTH = 160;
/** Frames a caller gets when it does not say. Matches the cover rail. */
const DEFAULT_FRAMES = 6;
/** How long to wait for the clip's metadata before giving up. */
const METADATA_MS = 8000;
/** How long to wait for any one seek. */
const SEEK_MS = 4000;

/**
 * Evenly spaced times across a clip, kept off both ends.
 *
 * The first frame of a phone recording is usually black or a blur, and the
 * last is usually the hand coming back.
 */
export function frameTimes(duration: number, count = DEFAULT_FRAMES): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || count <= 0) return [0];
  const step = duration / count;
  return Array.from({ length: count }, (_, i) =>
    Math.min(duration - 0.01, Math.max(0, step * i + step / 2)),
  );
}

/**
 * Decode `count` frames, handing each one over as it lands.
 *
 * Reported one at a time rather than returned as a list, so a strip fills in
 * as it decodes instead of sitting empty until the last frame is ready.
 */
export async function extractStrip(
  src: string,
  count: number,
  onFrame: (frame: Frame) => void,
  signal: { cancelled: boolean } = { cancelled: false },
): Promise<void> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;

  const ready = await new Promise<boolean>((resolve) => {
    const bail = setTimeout(() => resolve(false), METADATA_MS);
    video.onerror = () => {
      clearTimeout(bail);
      resolve(false);
    };
    video.onloadedmetadata = () => {
      clearTimeout(bail);
      resolve(true);
    };
  });
  if (!ready || signal.cancelled) return;

  const scale = Math.min(1, STRIP_WIDTH / (video.videoWidth || STRIP_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || STRIP_WIDTH) * scale);
  canvas.height = Math.round((video.videoHeight || STRIP_WIDTH) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const time of frameTimes(video.duration, count)) {
    if (signal.cancelled) return;
    const seeked = await new Promise<boolean>((resolve) => {
      const bail = setTimeout(() => resolve(false), SEEK_MS);
      video.onseeked = () => {
        clearTimeout(bail);
        resolve(true);
      };
      video.currentTime = time;
    });
    if (!seeked || signal.cancelled) continue;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onFrame({ time, url: canvas.toDataURL("image/jpeg", 0.7) });
  }
}
