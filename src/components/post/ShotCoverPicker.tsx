"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";

/**
 * Choose which frame of a Shot becomes its cover.
 *
 * The cover used to be whatever happened to be at 0.5 seconds, and that was
 * defensible when it was only a loading placeholder. It is not any more: a
 * Shot's cover is now what people see in the feed before it plays, on
 * Discover tiles, on the profile showcase grid, and as the poster behind the
 * player. Half a second in is very often a hand reaching for the phone.
 *
 * A strip of frames rather than a scrubber. Scrubbing a video on a phone is
 * fiddly, needs a seek per pixel of travel, and asks someone to hunt; six
 * evenly spaced options across the clip is one tap and covers almost every
 * real case.
 *
 * Extraction is sequential on purpose. A single video element seeked one
 * frame at a time is slower than firing six in parallel, but parallel seeks
 * on one element trample each other and several browsers simply drop all but
 * the last. Six elements would decode the clip six times over on a phone.
 */

/** How many candidate frames to offer. */
const FRAME_COUNT = 6;
/** Thumbnails are small; no reason to decode them at full width. */
const STRIP_WIDTH = 160;

export type Frame = { time: number; url: string };

/**
 * Pull `count` evenly spaced frames out of a video.
 *
 * Deliberately avoids both ends: the first frame of a phone recording is
 * usually black or a blur, and the last is usually the hand coming back.
 */
export function frameTimes(duration: number, count = FRAME_COUNT): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  // Inset by half a step so the samples sit inside the clip rather than on
  // its edges.
  const step = duration / count;
  return Array.from({ length: count }, (_, i) =>
    Math.min(duration - 0.01, Math.max(0, step * i + step / 2))
  );
}

async function extractFrames(
  src: string,
  onFrame: (f: Frame) => void,
  signal: { cancelled: boolean }
): Promise<void> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;

  const ready = await new Promise<boolean>((resolve) => {
    const bail = setTimeout(() => resolve(false), 8000);
    video.onerror = () => {
      clearTimeout(bail);
      resolve(false);
    };
    video.onloadedmetadata = () => {
      clearTimeout(bail);
      resolve(true);
    };
  });
  if (!ready || signal.cancelled) return;

  const scale = Math.min(1, STRIP_WIDTH / (video.videoWidth || STRIP_WIDTH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((video.videoWidth || STRIP_WIDTH) * scale);
  canvas.height = Math.round((video.videoHeight || STRIP_WIDTH) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const time of frameTimes(video.duration)) {
    if (signal.cancelled) return;
    const seeked = await new Promise<boolean>((resolve) => {
      // A seek that never lands must not hang the whole strip.
      const bail = setTimeout(() => resolve(false), 4000);
      video.onseeked = () => {
        clearTimeout(bail);
        resolve(true);
      };
      video.currentTime = time;
    });
    if (!seeked || signal.cancelled) continue;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onFrame({ time, url: canvas.toDataURL("image/jpeg", 0.7) });
  }
}

export function ShotCoverPicker({
  src,
  value,
  onChange,
}: {
  /** Object URL of the chosen video. */
  src: string;
  /** Selected cover time in seconds. */
  value: number | null;
  onChange: (time: number) => void;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [done, setDone] = useState(false);
  const pickedRef = useRef(false);

  useEffect(() => {
    setFrames([]);
    setDone(false);
    pickedRef.current = false;
    const signal = { cancelled: false };

    extractFrames(
      src,
      (f) => {
        if (signal.cancelled) return;
        setFrames((prev) => [...prev, f]);
        // Default to the first frame we manage to pull, so a Shot always has
        // a cover even if the picker is never touched.
        if (!pickedRef.current) {
          pickedRef.current = true;
          onChange(f.time);
        }
      },
      signal
    ).finally(() => {
      if (!signal.cancelled) setDone(true);
    });

    return () => {
      signal.cancelled = true;
    };
    // onChange is an inline arrow in practice; re-running on it would restart
    // extraction on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // Nothing decoded and extraction finished — the browser could not read this
  // clip. Say nothing rather than showing an empty rail; the upload still
  // falls back to a captured frame.
  if (done && frames.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">
        <ImageIcon size={11} /> Cover
        {!done && <Loader2 size={11} className="animate-spin" />}
      </p>

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {frames.map((f) => {
          const active = value !== null && Math.abs(value - f.time) < 0.001;
          return (
            <button
              key={f.time}
              type="button"
              onClick={() => onChange(f.time)}
              aria-label={`Use the frame at ${f.time.toFixed(1)} seconds`}
              aria-pressed={active}
              className={`relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-lg transition-all ${
                active
                  ? "ring-2 ring-accent"
                  : "opacity-60 ring-1 ring-border hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          );
        })}

        {/* Placeholders for frames still decoding, so the rail does not grow
            item by item and shove the chosen one sideways under the finger. */}
        {!done &&
          Array.from({ length: Math.max(0, FRAME_COUNT - frames.length) }).map(
            (_, i) => (
              <div
                key={`ph-${i}`}
                className="skeleton aspect-[9/16] w-14 shrink-0 rounded-lg"
              />
            )
          )}
      </div>
    </div>
  );
}
