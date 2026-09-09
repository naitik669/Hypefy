/**
 * Shot media constants and poster-frame capture.
 *
 * Extracted from ShotComposer so the new camera-first creator and the old
 * composer agree on the limits instead of drifting apart.
 */

/**
 * Matches the shot-media bucket ceiling exactly.
 *
 * This used to be 60 while the bucket allowed 50, so a 55 MB clip passed
 * client validation and then failed at upload with a raw Supabase error.
 */
export const MAX_SHOT_MB = 50;

/**
 * The show-media bucket is half the size of shot-media, and this file is used
 * by both paths.
 *
 * ShotPreview applied MAX_SHOT_MB to Shows as well, so a 40 MB Show passed
 * client validation and was then rejected by a 25 MB bucket — the same drift
 * the comment above describes, repeated one level down.
 */
export const MAX_SHOW_MB = 25;

/**
 * Mirrors the bucket's allowed MIME list.
 *
 * video/ogg was in here and is NOT in the bucket, so an ogg clip passed the
 * client and was rejected server-side. Nothing in the app produces ogg —
 * useVideoRecorder only ever emits webm or mp4 — so the entry went rather than
 * the bucket widening.
 */
export const ALLOWED_SHOT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

const POSTER_WIDTH = 720;

/**
 * Grab a still from a video for use as its poster.
 *
 * `at` is a chosen cover time in seconds. Without one it falls back to ~0.5s
 * rather than 0, because the first frame of a phone recording is very often
 * black — and half a second in is very often a hand reaching for the screen,
 * which is why the cover picker exists.
 *
 * The parameter was the one thing keeping ShotComposer on a private copy of
 * this function: the two Shot paths had two poster implementations, and only
 * one of them could honour a chosen frame.
 *
 * Resolves null on any failure, and bails after 8s so a video the browser
 * cannot decode never hangs the publish flow.
 */
export function capturePoster(src: string, at?: number | null): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    // Set BEFORE src, and required for any source that is not a local blob:
    // drawing a cross-origin video onto a canvas taints it, and the toBlob
    // below then throws a SecurityError. Publishing captures from a local
    // object URL where this is moot, but anything re-capturing from storage
    // (a backfill for the Shots that predate posters) needs it, and Supabase
    // Storage does send the CORS headers that make it work.
    video.crossOrigin = "anonymous";
    video.src = src;

    const bail = setTimeout(() => resolve(null), 8000);

    video.onerror = () => {
      clearTimeout(bail);
      resolve(null);
    };
    video.onloadedmetadata = () => {
      const fallback = Math.min(0.5, Math.max(0, video.duration - 0.1));
      // Clamped: a cover time from a picker that measured a different duration
      // than this element reports would otherwise seek past the end, and
      // onseeked would never fire — hanging until the bail timeout.
      video.currentTime =
        at != null && Number.isFinite(at)
          ? Math.min(Math.max(at, 0), Math.max(0, video.duration - 0.05))
          : fallback;
    };
    video.onseeked = () => {
      clearTimeout(bail);
      const scale = Math.min(1, POSTER_WIDTH / (video.videoWidth || POSTER_WIDTH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((video.videoWidth || POSTER_WIDTH) * scale);
      canvas.height = Math.round((video.videoHeight || POSTER_WIDTH) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    };
  });
}
