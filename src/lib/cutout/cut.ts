/**
 * Which cutter cuts the photo. The server (BiRefNet on fal.ai, Naitik's
 * choice on 27 Nov) is tried first: it is fast and clean on any phone. The
 * on-device model is the fallback for whenever the server cannot answer —
 * FAL_KEY not set yet, the hourly cap reached, the network gone — so a
 * sticker can always be made. The device model's 46 MB download only
 * happens if the fallback is actually needed.
 *
 * Both cutters are passed in, so a test decides which one answers.
 */
import type { Photo } from "./engine";
import type { Progress } from "./model-loader";

export type DeviceCutter = {
  prepare(onProgress?: (p: Progress) => void): Promise<number>;
  cut(photo: Photo): Promise<Uint8ClampedArray>;
};

export type CutDeps = {
  server: (photo: Photo) => Promise<Uint8ClampedArray>;
  device: () => DeviceCutter;
  onProgress?: (p: Progress) => void;
};

export async function cutWithFallback(
  photo: Photo,
  deps: CutDeps,
): Promise<{ mask: Uint8ClampedArray; via: "server" | "device" }> {
  try {
    const mask = await deps.server(photo);
    if (mask.length === photo.w * photo.h) return { mask, via: "server" };
  } catch {
    // Fall through to the device: an answer beats an error.
  }
  const device = deps.device();
  await device.prepare(deps.onProgress);
  return { mask: await device.cut(photo), via: "device" };
}
