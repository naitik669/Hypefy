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

/** Mirrors the bucket's allowed MIME list. */
export const ALLOWED_SHOT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/ogg",
];

const POSTER_WIDTH = 720;

/**
 * Grab a still from a video for use as its poster.
 *
 * Seeks to 0.5s rather than 0 — the first frame of a phone recording is
 * very often black. Resolves null on any failure, and bails after 8s so a
 * video the browser cannot decode never hangs the publish flow.
 */
export function capturePoster(src: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;

    const bail = setTimeout(() => resolve(null), 8000);

    video.onerror = () => {
      clearTimeout(bail);
      resolve(null);
    };
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, Math.max(0, video.duration - 0.1));
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
