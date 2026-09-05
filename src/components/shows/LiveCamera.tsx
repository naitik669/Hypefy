"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";

type FacingMode = "user" | "environment";

/**
 * LiveCamera — real-time camera viewfinder for the Shows creator.
 *
 * Opens front camera by default. Flip button switches to back.
 * The large shutter circle captures the current frame and returns
 * it as a JPEG File via `onCapture`.
 */
export function LiveCamera({
  onCapture,
}: {
  onCapture: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<FacingMode>("user");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async (mode: FacingMode) => {
    // Stop any running stream first
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
          // Portrait, not the old 4:3 landscape. A Show is displayed
          // full-screen portrait by ShowViewer, so capturing landscape meant
          // the viewer cropped most of the frame away afterwards — and the
          // preview here cropped a different amount, so what you framed was
          // not what got posted.
          aspectRatio: { ideal: 9 / 16 },
          width: { ideal: 1080 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch {
      setError(
        "Camera access denied. Tap the camera icon in your browser's address bar to allow it.",
      );
    }
  }, []);

  // Start / restart camera when facingMode changes
  useEffect(() => {
    startCamera(facing);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, startCamera]);

  function capture() {
    const video = videoRef.current;
    if (!video || !ready) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Mirror the canvas for front camera so the saved image isn't flipped
    if (facing === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `show-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
      {/* Live preview — mirror front camera in CSS so it feels like a mirror.
          Letterboxed to 9:16 for the same reason as the Shot viewfinder: a
          phone screen is ~20:9 and no camera is, so covering it edge to edge
          crops the width and shows you a tighter frame than you are about to
          capture. */}
      <div className="flex h-full w-full items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`aspect-[9/16] max-h-full w-full object-cover ${facing === "user" ? "[transform:scaleX(-1)]" : ""}`}
        />
      </div>

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
          <AlertCircle size={40} className="text-danger" />
          <p className="text-sm text-white/80">{error}</p>
          <button
            type="button"
            onClick={() => startCamera(facing)}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink"
          >
            Retry
          </button>
        </div>
      )}

      {/* Flip camera button — top-right */}
      <button
        type="button"
        aria-label="Flip camera"
        onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform active:scale-95"
      >
        <RefreshCw size={22} />
      </button>

      {/* Shutter button — bottom-center */}
      <button
        type="button"
        aria-label="Take photo"
        onClick={capture}
        disabled={!ready}
        className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white bg-white/25 backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-40"
      >
        {/* Inner circle */}
        <div className="h-14 w-14 rounded-full bg-white/80" />
      </button>
    </div>
  );
}
