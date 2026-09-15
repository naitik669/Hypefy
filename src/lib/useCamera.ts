"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
 * Extracted from LiveCamera so the creator can draw its own chrome — a top
 * bar, a right rail, a mode switcher — over the same viewfinder. LiveCamera
 * keeps its original API and its own shutter, so /shows/add is untouched.
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
  const [facing, setFacing] = useState<FacingMode>(facingDefault);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Real dimensions of the stream we were given, once metadata lands. */
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const start = useCallback(
    async (mode: FacingMode) => {
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

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints(mode, portrait, isPhone()),
          audio,
        });
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, start]);

  const flip = useCallback(
    () => setFacing((f) => (f === "user" ? "environment" : "user")),
    [],
  );

  /**
   * Grab the current frame as a JPEG. The canvas is counter-mirrored for the
   * selfie camera so the saved file matches what the subject saw rather than
   * arriving flipped.
   */
  const capturePhoto = useCallback(
    (name = `capture-${Date.now()}.jpg`) =>
      new Promise<File | null>((resolve) => {
        const video = videoRef.current;
        if (!video || !ready) return resolve(null);

        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);

        if (facing === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(
          (blob) =>
            resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null),
          "image/jpeg",
          0.92,
        );
      }),
    [facing, ready],
  );

  return {
    videoRef,
    streamRef,
    facing,
    flip,
    ready,
    error,
    retry: () => start(facing),
    capturePhoto,
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
