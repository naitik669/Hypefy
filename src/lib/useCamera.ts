"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NORMAL, type PhotoFilter } from "@/lib/photo-filters";
import { cropRect, pickMainBackCamera, renderPhoto, takeStill } from "@/lib/photo-capture";

export type FacingMode = "user" | "environment";

/**
 * What to ask the camera for.
 *
 * On a phone, never let the browser crop. Sensors only have landscape modes
 * (16:9, 4:3); asking for a 9:16 picture made Chrome on Android pick one and
 * crop-and-scale it down to 9:16 — keeping about a third of the width, which
 * reads as a 3x zoom. `resizeMode: "none"` restricts it to the sensor's own
 * modes, which the phone then rotates to portrait by itself, uncropped. The
 * size ideals are the sensor's orientation (landscape) for the same reason.
 *
 * Desktop webcams are landscape and never rotate, so there a crop is still
 * the only way to get a portrait Shot.
 */
export function videoConstraints(mode: FacingMode, portrait: boolean, phone: boolean): MediaTrackConstraints {
  if (phone) {
    return {
      facingMode: { ideal: mode },
      resizeMode: { ideal: "none" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    } as MediaTrackConstraints;
  }
  return {
    facingMode: { ideal: mode },
    aspectRatio: { ideal: portrait ? 9 / 16 : 4 / 3 },
    width: { ideal: portrait ? 1080 : 1280 },
    height: { ideal: portrait ? 1920 : 960 },
  };
}

/** A touch device held like a phone: the camera rotates its frames for us. */
export function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

/**
 * Some phones open at a zoom above 1x (or on a cropped digital zoom). Put it
 * back to the widest the lens allows, where the browser exposes zoom at all.
 */
export async function widestZoom(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number } }) | undefined;
  if (!track || !caps?.zoom) return;
  try {
    await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min } as MediaTrackConstraintSet] });
  } catch {
    // Not every camera accepts it; the stream is still fine.
  }
}

/**
 * Headless camera. Owns the MediaStream, facing mode, readiness and the
 * permission error; renders nothing.
 *
 * Shared by the creator (/create) and the Show camera (LiveCamera), which
 * each draw their own chrome over the same viewfinder.
 *
 * `audio` is opt-in: Shows capture a still and must not light the mic
 * indicator, while recording a Shot needs sound.
 */
export function useCamera({
  facingDefault = "user",
  portrait = true,
  audio = false,
}: {
  facingDefault?: FacingMode;
  /** 9:16 for Shots. Shows want the old 4:3. */
  portrait?: boolean;
  audio?: boolean;
} = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Bumped per start, so a slow start that loses a race stops its own stream. */
  const attempt = useRef(0);
  const [facing, setFacing] = useState<FacingMode>(facingDefault);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Real dimensions of the stream we were given, once metadata lands. */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const start = useCallback(
    async (mode: FacingMode) => {
      const mine = ++attempt.current;
      // Always stop the previous stream first — leaving it running keeps the
      // camera light on and some devices refuse a second stream entirely.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setReady(false);
      setError(null);
      setSize(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera not supported on this device.");
        return;
      }

      const phone = isPhone();
      const ask = (deviceId?: string) =>
        navigator.mediaDevices.getUserMedia({
          video: deviceId
            ? { ...videoConstraints(mode, portrait, phone), facingMode: undefined, deviceId: { exact: deviceId } }
            : videoConstraints(mode, portrait, phone),
          audio,
        });

      try {
        let stream = await ask();

        // On a phone with several back lenses, make sure it's the main one.
        // Labels are only readable once permission is granted, i.e. now.
        if (phone && mode === "environment") {
          const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          const current = stream.getVideoTracks()[0]?.getSettings().deviceId;
          const main = pickMainBackCamera(devices, current);
          if (main) {
            stream.getTracks().forEach((t) => t.stop());
            stream = await ask(main).catch(() => ask());
          }
        }

        if (mine !== attempt.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        void widestZoom(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            setReady(true);
            // Report what we actually got, not what we asked for. The caller
            // needs it to frame the viewfinder honestly when a device ignores
            // the request.
            const v = videoRef.current;
            if (v?.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
          };
        }
      } catch (err) {
        if (mine !== attempt.current) return;
        // NotAllowedError is a refusal; anything else is usually hardware
        // already in use, which needs different advice.
        const denied =
          err instanceof DOMException &&
          (err.name === "NotAllowedError" || err.name === "SecurityError");
        setError(
          denied
            ? "Camera access denied. Allow it in your browser or system settings, then retry."
            : "Could not start the camera. It may be in use by another app.",
        );
      }
    },
    [portrait, audio],
  );

  useEffect(() => {
    void start(facing);
    return () => {
      attempt.current++;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, start]);

  const flip = useCallback(
    () => setFacing((f) => (f === "user" ? "environment" : "user")),
    [],
  );

  /**
   * Take a photo as a JPEG: a full-resolution still where the browser can,
   * else the preview frame. Cropped to the 9:16 viewfinder (or left whole
   * when the stream is landscape and shown whole), counter-mirrored for the
   * selfie camera so the file matches what the subject saw, and filtered.
   */
  const capturePhoto = useCallback(
    async (name = `capture-${Date.now()}.jpg`, filter: PhotoFilter = NORMAL): Promise<File | null> => {
      const video = videoRef.current;
      const track = streamRef.current?.getVideoTracks()[0];
      if (!video || !ready || !video.videoWidth) return null;

      const landscape = video.videoWidth > video.videoHeight;
      const aspect = landscape ? video.videoWidth / video.videoHeight : 9 / 16;
      const mirror = facing === "user";

      const still = track ? await takeStill(track, !landscape) : null;
      const blob = still
        ? await renderPhoto(still, still.width, still.height, { aspect, mirror, filter })
        : await renderPhoto(video, video.videoWidth, video.videoHeight, { aspect, mirror, filter });
      still?.close();
      return blob ? new File([blob], name, { type: "image/jpeg" }) : null;
    },
    [facing, ready],
  );

  /** A small square of the current frame, for the filter thumbnails. */
  const snapshot = useCallback((px = 112): string | null => {
    const video = videoRef.current;
    if (!video?.videoWidth) return null;
    const crop = cropRect(video.videoWidth, video.videoHeight, 1);
    const canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (facing === "user") {
      ctx.translate(px, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, px, px);
    return canvas.toDataURL("image/jpeg", 0.8);
  }, [facing]);

  return {
    videoRef,
    streamRef,
    facing,
    flip,
    ready,
    error,
    retry: () => start(facing),
    capturePhoto,
    snapshot,
    /** Front camera is shown mirrored so it behaves like a mirror. */
    mirrored: facing === "user",
    size,
    /**
     * The device gave us a landscape stream despite being asked for portrait.
     * Worth knowing rather than silently cropping 75% of the width away.
     */
    isLandscape: size ? size.w > size.h : false,
  };
}
