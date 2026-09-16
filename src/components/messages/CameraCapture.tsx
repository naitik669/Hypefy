"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, RefreshCw, RotateCcw, X } from "lucide-react";
import { Plane } from "@/components/ui/Plane";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import {
  HOLD_TO_RECORD_MS,
  MAX_RECORD_MS,
  captureFrame,
  clock,
  openCamera,
  recorderType,
  stopStream,
  type Facing,
} from "@/lib/camera";

export type Captured = { file: File; type: "image" | "video"; preview: string };

/**
 * The camera, full screen. Tap the shutter for a photo, hold it to record a
 * video; then look at what you took, add a caption, and send it or retake.
 */
export function CameraCapture({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (shot: Captured, caption: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef(0);
  const pressed = useRef(false);

  const [facing, setFacing] = useState<Facing>("environment");
  const [error, setError] = useState<"denied" | "unavailable" | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [shot, setShot] = useState<Captured | null>(null);
  const [caption, setCaption] = useState("");
  const [attempt, setAttempt] = useState(0);

  useOverlayBackButton(true, () => (shot ? retake() : onClose()));

  // The camera runs while there is nothing taken to look at.
  useEffect(() => {
    if (shot) return;
    let cancelled = false;
    openCamera(facing, typeof MediaRecorder !== "undefined")
      .then((stream) => {
        if (cancelled) return stopStream(stream);
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
        setReady(true);
      })
      .catch((e: DOMException) => {
        if (!cancelled) setError(e?.name === "NotAllowedError" ? "denied" : "unavailable");
      });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing, shot, attempt]);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_RECORD_MS) stopRecording();
    }, 100);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  // A preview's object URL goes with it, unless it was sent.
  const sent = useRef(false);
  useEffect(() => {
    return () => {
      if (shot && !sent.current) URL.revokeObjectURL(shot.preview);
    };
  }, [shot]);

  async function takePhoto() {
    const v = videoRef.current;
    if (!v) return;
    const blob = await captureFrame(v, facing === "user");
    if (!blob) return;
    const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
    setShot({ file, type: "image", preview: URL.createObjectURL(file) });
  }

  function startRecording() {
    const stream = streamRef.current;
    const type = recorderType();
    if (!stream || !type) return takePhoto();
    chunks.current = [];
    const rec = new MediaRecorder(stream, { mimeType: type });
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const base = type.split(";")[0];
      const blob = new Blob(chunks.current, { type: base });
      if (!blob.size) return;
      const file = new File([blob], `video-${Date.now()}.${base === "video/mp4" ? "mp4" : "webm"}`, { type: base });
      setShot({ file, type: "video", preview: URL.createObjectURL(file) });
    };
    rec.start(250);
    recorderRef.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
  }

  function stopRecording() {
    const rec = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    if (rec && rec.state !== "inactive") rec.stop();
  }

  function onShutterDown(e: React.PointerEvent) {
    if (!ready) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pressed.current = true;
    holdTimer.current = setTimeout(() => {
      if (pressed.current) startRecording();
    }, HOLD_TO_RECORD_MS);
  }

  function onShutterUp() {
    if (!pressed.current) return;
    pressed.current = false;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (recorderRef.current) stopRecording();
    else void takePhoto();
  }

  function retake() {
    if (shot) URL.revokeObjectURL(shot.preview);
    setReady(false);
    setShot(null);
    setCaption("");
  }

  function send() {
    if (!shot) return;
    sent.current = true;
    onSend(shot, caption.trim());
  }

  if (typeof document === "undefined") return null;
  const progress = Math.min(1, elapsed / MAX_RECORD_MS);

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex flex-col bg-black text-white"
      role="dialog"
      aria-label="Camera"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {shot ? (
        <>
          <div className="relative min-h-0 flex-1">
            {shot.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.preview} alt="" className="h-full w-full object-contain" />
            ) : (
              <video src={shot.preview} autoPlay loop playsInline controls className="h-full w-full object-contain" />
            )}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[calc(var(--sat,0px)+10px)]">
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-black/45">
                <X size={20} />
              </button>
              <button type="button" onClick={retake} className="flex h-9 items-center gap-1.5 rounded-full bg-black/45 px-3.5 text-[13px] font-semibold">
                <RotateCcw size={15} />
                Retake
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 pb-[calc(var(--sab,0px)+12px)] pt-3">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Add a caption…"
              aria-label="Caption"
              className="h-11 min-w-0 flex-1 rounded-2xl bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/50"
            />
            <button
              type="button"
              onClick={send}
              aria-label={shot.type === "video" ? "Send video" : "Send photo"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink active:scale-90"
            >
              <Plane size={18} weight="fill" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full object-cover"
              style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
            />
            {error && (
              <div className="absolute inset-0 grid place-content-center justify-items-center gap-3 px-8 text-center">
                <Camera size={34} className="text-white/60" />
                <p className="text-[15px] font-semibold">
                  {error === "denied" ? "Hypefy can't use your camera" : "No camera found"}
                </p>
                <p className="text-[13px] leading-snug text-white/60">
                  {error === "denied"
                    ? "Allow camera access for Hypefy in your phone or browser settings, then try again."
                    : "Connect a camera, or pick a photo from your gallery instead."}
                </p>
                <button
                  type="button"
                  onClick={() => { setError(null); setAttempt((n) => n + 1); }}
                  className="mt-1 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black"
                >
                  Try again
                </button>
              </div>
            )}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[calc(var(--sat,0px)+10px)]">
              <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-black/45">
                <X size={20} />
              </button>
              {recording && (
                <span className="flex items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[13px] font-bold tabular-nums">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff4d4d]" />
                  {clock(elapsed)}
                </span>
              )}
              <span className="h-10 w-10" />
            </div>
          </div>
          <div className="relative flex items-center justify-center gap-12 bg-black px-6 pb-[calc(var(--sab,0px)+20px)] pt-5">
            <span className="h-11 w-11" />
            <button
              type="button"
              aria-label="Shutter: tap for a photo, hold for a video"
              disabled={!ready}
              onPointerDown={onShutterDown}
              onPointerUp={onShutterUp}
              onPointerCancel={onShutterUp}
              onContextMenu={(e) => e.preventDefault()}
              className="relative grid h-[76px] w-[76px] place-items-center rounded-full border-[5px] border-white disabled:opacity-40"
              style={{ touchAction: "none" }}
            >
              {recording && (
                <span
                  className="absolute -inset-[5px] rounded-full"
                  style={{
                    background: `conic-gradient(#ff4d4d ${progress * 360}deg, transparent 0)`,
                    WebkitMask: "radial-gradient(circle, transparent 33px, #000 34px)",
                    mask: "radial-gradient(circle, transparent 33px, #000 34px)",
                  }}
                />
              )}
              <span
                className={`transition-all duration-200 ${
                  recording ? "h-7 w-7 rounded-lg bg-[#ff4d4d]" : "h-[58px] w-[58px] rounded-full bg-white/25"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => { setReady(false); setFacing((f) => (f === "user" ? "environment" : "user")); }}
              disabled={recording}
              aria-label="Switch camera"
              className="grid h-11 w-11 place-items-center rounded-full bg-white/10 disabled:opacity-30"
            >
              <RefreshCw size={19} />
            </button>
            <p className="absolute inset-x-0 top-1 text-center text-[11px] text-white/55">
              {recording ? "Release to stop" : "Tap for photo, hold for video"}
            </p>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
