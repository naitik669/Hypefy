"use client";

/**
 * The phone's camera, from the page.
 *
 * getUserMedia works in the Android app as well as the browser: the app
 * already holds CAMERA and RECORD_AUDIO for calls, and the WebView passes the
 * page's request through to them.
 */

export type Facing = "user" | "environment";

/** Longest video the camera records before it stops by itself. */
export const MAX_RECORD_MS = 60_000;
/** A press held this long on the shutter records instead of taking a photo. */
export const HOLD_TO_RECORD_MS = 220;

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Whether the camera is already allowed, without asking. "prompt" when the
 *  browser can't say. */
export async function cameraPermission(): Promise<"granted" | "denied" | "prompt"> {
  try {
    const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
    return (status?.state as "granted" | "denied" | "prompt" | undefined) ?? "prompt";
  } catch {
    return "prompt";
  }
}

/** Open the camera, with the microphone when asked for and allowed. A refused
 *  microphone still gives a camera, so photos keep working. */
export async function openCamera(facing: Facing, withAudio: boolean): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    facingMode: facing,
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };
  if (withAudio) {
    try {
      return await navigator.mediaDevices.getUserMedia({ video, audio: true });
    } catch (e) {
      if ((e as DOMException)?.name !== "NotAllowedError" && (e as DOMException)?.name !== "NotFoundError") throw e;
    }
  }
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** A recording format this browser can make and the chat bucket accepts. */
export function recorderType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return options.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
}

/** The frame on screen as a JPEG, flipped for the front camera so the photo
 *  matches the mirror image you framed. */
export async function captureFrame(video: HTMLVideoElement, mirror: boolean): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

/** "0:07" */
export function clock(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
