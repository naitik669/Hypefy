"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FacingMode = "user" | "environment";

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

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera not supported on this device.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            // Ideals, not exact: a device that cannot do 1080x1920 should
            // hand back its closest match rather than throwing.
            width: { ideal: portrait ? 1080 : 1280 },
            height: { ideal: portrait ? 1920 : 960 },
          },
          audio,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => setReady(true);
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
  };
}
