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
/** Long enough for a phone to decode a big clip, short enough not to hold a publish. */
const GIVE_UP_MS = 12_000;

/**
 * Is this frame simply black?
 *
 * The first frames of a phone recording usually are, and a seek that lands
 * before the decoder has caught up gives one too — which is how a Shot ends
 * up with a poster that looks like no poster at all. Sampled on a grid rather
 * than every pixel: a hundred points say as much as a hundred thousand, and
 * cost nothing. Exported for tests.
 */
export function isBlankFrame(
  data: { data: Uint8ClampedArray | number[]; width: number; height: number },
  threshold = 10,
): boolean {
  const { width, height } = data;
  if (!width || !height) return true;
  const stepX = Math.max(1, Math.floor(width / 10));
  const stepY = Math.max(1, Math.floor(height / 10));
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      // Any pixel with some light in it means the frame is a picture.
      if (data.data[i] > threshold || data.data[i + 1] > threshold || data.data[i + 2] > threshold) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Where to look for a frame worth keeping, in order.
 *
 * A chosen cover time is tried first and is the answer when it has anything
 * in it. Past that the opening second of a recording is often black — a lens
 * waking up, a fade in — so the fallbacks walk further in rather than giving
 * up on the first dark frame. Exported for tests.
 */
export function posterTimes(duration: number, at?: number | null): number[] {
  const usable = Number.isFinite(duration) && duration > 0;
  // Clamped to the end only when there is an end to clamp to: a clip whose
  // duration is unknown — what a MediaRecorder webm reports until it is
  // remuxed — would otherwise turn every time into NaN, and seeking to NaN
  // is how a recorded Shot ended up with no poster at all.
  const safe = (t: number) =>
    usable ? Math.min(Math.max(t, 0), duration - 0.05) : Math.max(t, 0);
  const chosen = at != null && Number.isFinite(at) ? [safe(at)] : [];
  if (!usable) return chosen.length ? chosen : [0.5];
  const spread = [0.5, duration * 0.25, duration * 0.5, duration * 0.75].map(safe);
  // The chosen frame first, then the spread, each time only once.
  return [...new Set([...chosen, ...spread])];
}


/**
 * Grab a still from a video for use as its poster.
 *
 * `at` is a chosen cover time in seconds; without one, or when the frame
 * there is black, it tries further in (see posterTimes). A black poster is
 * the same as no poster to anyone looking at the grid, and the first frames
 * of a phone recording are very often black, which is why the cover picker
 * exists and why this does not stop at the first attempt.
 *
 * Waits for a frame to actually be decoded before drawing — a seek reports
 * itself done before the picture is there on some phones, and drawing then
 * gives exactly the black frame above.
 *
 * Resolves null on any failure, and gives up after 12s so a video the
 * browser cannot decode never hangs a publish.
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

    let done = false;
    const finish = (blob: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(bail);
      video.removeAttribute("src");
      video.load();
      resolve(blob);
    };
    const bail = setTimeout(() => finish(null), GIVE_UP_MS);

    video.onerror = () => finish(null);

    video.onloadeddata = async () => {
      const times = posterTimes(video.duration, at);
      let best: Blob | null = null;
      for (const t of times) {
        const frame = await drawAt(video, t);
        if (!frame) continue;
        // The first frame with something in it wins; a black one is kept
        // only in case every other attempt fails too.
        if (!frame.blank) return finish(frame.blob);
        best = best ?? frame.blob;
      }
      finish(best);
    };

    video.src = src;
    video.load();
  });
}

/** Seek, wait for the picture, draw it. Null if the seek or the draw fails. */
function drawAt(
  video: HTMLVideoElement,
  time: number,
): Promise<{ blob: Blob | null; blank: boolean } | null> {
  return new Promise((resolve) => {
    let settled = false;
    const give = setTimeout(() => settle(null), 4000);
    const settle = (v: { blob: Blob | null; blank: boolean } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(give);
      video.onseeked = null;
      resolve(v);
    };

    video.onseeked = () => {
      // A seek says it is done before the frame is necessarily painted. Where
      // the browser can tell us a frame is ready, wait for it; otherwise give
      // it a tick, which is what the rest have.
      const draw = () => settle(paint(video));
      const withFrame = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => number;
      };
      if (typeof withFrame.requestVideoFrameCallback === "function") {
        withFrame.requestVideoFrameCallback(draw);
      } else {
        setTimeout(draw, 60);
      }
    };

    try {
      video.currentTime = time;
    } catch {
      settle(null);
    }
  });
}

/** The frame on screen, as a JPEG, and whether it is simply black. */
function paint(video: HTMLVideoElement): { blob: Blob | null; blank: boolean } | null {
  const scale = Math.min(1, POSTER_WIDTH / (video.videoWidth || POSTER_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || POSTER_WIDTH) * scale);
  canvas.height = Math.round((video.videoHeight || POSTER_WIDTH) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  let blank = false;
  try {
    blank = isBlankFrame(ctx.getImageData(0, 0, canvas.width, canvas.height));
  } catch {
    // A tainted canvas cannot be read — or written out either, so there is
    // nothing to judge and nothing to keep.
    return null;
  }
  const url = canvas.toDataURL("image/jpeg", 0.82);
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: "image/jpeg" }), blank };
}
