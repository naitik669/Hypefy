"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Video recording for the Shot creator.
 *
 * Mirrors the codec-probe approach already used for voice notes
 * (VoiceRecorder.tsx) rather than assuming a format: Chrome and Android
 * produce WebM, Safari only ever produces MP4, and picking wrong yields a
 * zero-byte file instead of an error.
 *
 * Order matters. vp9 first for quality per byte, then plain webm, then mp4
 * for Safari. Every one of these is accepted by the shot-media bucket.
 */
const CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

function supportedMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export type RecorderState = "idle" | "recording" | "stopping";

export function useVideoRecorder({
  stream,
  maxSeconds,
  onComplete,
}: {
  stream: MediaStream | null;
  maxSeconds: number;
  onComplete: (file: File) => void;
}) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Held in a ref as well as state: the stop handler runs outside React's
  // render cycle and would otherwise close over a stale callback.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const [state, setState] = useState<RecorderState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [unsupported, setUnsupported] = useState(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    setState("stopping");
    clearTimer();
    rec.stop();
  }, []);

  const start = useCallback(() => {
    if (!stream || recorderRef.current?.state === "recording") return;

    const mime = supportedMime();
    if (!mime) {
      setUnsupported(true);
      return;
    }

    chunksRef.current = [];
    const rec = new MediaRecorder(stream, { mimeType: mime });
    recorderRef.current = rec;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      setState("idle");
      setElapsed(0);
      // A zero-byte blob means the encoder never produced a frame — surface
      // nothing rather than handing an empty file to the uploader.
      if (blob.size > 0) {
        const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
        onCompleteRef.current(
          new File([blob], `shot-${Date.now()}.${ext}`, { type: mime }),
        );
      }
    };

    // Timeslice so data arrives progressively; without it a crash mid-record
    // loses everything.
    rec.start(250);
    setState("recording");
    setElapsed(0);

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const secs = (Date.now() - startedAt) / 1000;
      setElapsed(secs);
      if (secs >= maxSeconds) stop();
    }, 100);
  }, [stream, maxSeconds, stop]);

  // Stop cleanly if the screen unmounts mid-record.
  useEffect(
    () => () => {
      clearTimer();
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    },
    [],
  );

  return {
    state,
    elapsed,
    unsupported,
    recording: state === "recording",
    progress: Math.min(elapsed / maxSeconds, 1),
    start,
    stop,
  };
}
