"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { MAX_SHOT_SECS, MIN_SHOT_SECS, clampTrim, fmtSecs, type Trim } from "@/lib/shot-trim";
import { extractStrip, type Frame } from "@/lib/video-frames";

/** How many frames the strip shows. Enough to recognise the clip, few enough
 *  that extraction is quick on a phone. */
const STRIP_FRAMES = 10;

type Edge = "start" | "end" | null;

/**
 * Decode the strip into `into`, resolving when there is something to show.
 *
 * A plain function rather than work inside the effect, so the only state move
 * is in the .then — the effect itself never sets state synchronously.
 */
async function decodeStrip(
  src: string,
  into: Frame[],
  signal: { cancelled: boolean },
): Promise<boolean> {
  try {
    await extractStrip(src, STRIP_FRAMES, (f) => into.push(f), signal);
  } catch {
    return false;
  }
  return into.length > 0;
}

/**
 * Choose which part of a clip is the Shot.
 *
 * A filmstrip with a draggable window, not a pair of number inputs: a trim is
 * a thing you recognise by looking, and the frames are the only way to find
 * the moment you meant. The strip is the same sequential frame extraction the
 * cover picker uses, so a clip is decoded once per purpose and never in
 * parallel — several browsers drop all but the last of parallel seeks on one
 * element.
 *
 * Nothing here cuts the video. The window is stored beside it and the player
 * honours it, which is the same shape a Shot's song already has.
 */
export function ShotTrimmer({
  src,
  duration,
  value,
  onChange,
}: {
  src: string;
  /** Length of the clip, in seconds. 0 until the video reports it. */
  duration: number;
  value: Trim;
  onChange: (trim: Trim) => void;
}) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<Edge>(null);
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!src) return;
    const signal = { cancelled: false };
    const collected: Frame[] = [];
    decodeStrip(src, collected, signal).then((ok) => {
      if (signal.cancelled) return;
      setFrames(ok ? collected : []);
      setLoading(false);
    });
    return () => {
      signal.cancelled = true;
    };
  }, [src]);

  /** Where a pointer at this x sits in the clip, in seconds. */
  function timeAt(clientX: number): number {
    const box = strip.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    return ratio * duration;
  }

  function moveEdge(edge: Exclude<Edge, null>, clientX: number) {
    const at = timeAt(clientX);
    const next =
      edge === "start"
        ? clampTrim(at, value.end, duration)
        : clampTrim(value.start, at, duration);
    onChange(next);
  }

  // Dragging is tracked on the window rather than the handle: a finger moving
  // faster than the element can follow leaves the handle behind, and every
  // further move would then land on whatever is underneath it instead.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => moveEdge(dragging, e.clientX);
    const up = () => setDragging(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  const span = duration > 0 ? duration : 1;
  const leftPct = (value.start / span) * 100;
  const widthPct = Math.max(2, ((value.end - value.start) / span) * 100);
  const selected = value.end - value.start;
  const tooLong = selected > MAX_SHOT_SECS + 0.001;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs font-semibold">
        <span className="text-muted">
          Selected{" "}
          <span className={`tabular-nums ${tooLong ? "text-danger" : "text-accent"}`}>
            {fmtSecs(selected)}
          </span>
        </span>
        <span className="text-faint">
          max <span className="tabular-nums">{fmtSecs(MAX_SHOT_SECS)}</span>
        </span>
      </div>

      <div
        ref={strip}
        className="relative h-14 select-none overflow-hidden rounded-xl bg-surface"
        style={{ touchAction: "none" }}
      >
        <div className="flex h-full">
          {frames.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.time}
              src={f.url}
              alt=""
              draggable={false}
              className="h-full flex-1 object-cover"
              style={{ width: `${100 / STRIP_FRAMES}%` }}
            />
          ))}
          {loading && frames.length === 0 && (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 size={18} className="animate-spin text-faint" />
            </div>
          )}
        </div>

        {/* Everything outside the window is dimmed rather than hidden, so the
            clip you are cutting from stays legible while you cut it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 bg-black/65"
          style={{ width: `${leftPct}%` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/65"
          style={{ left: `${leftPct + widthPct}%` }}
        />

        <div
          className={`pointer-events-none absolute inset-y-0 rounded-lg border-2 ${
            tooLong ? "border-danger" : "border-accent"
          }`}
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />

        {(["start", "end"] as const).map((edge) => (
          <button
            key={edge}
            type="button"
            aria-label={edge === "start" ? "Trim start" : "Trim end"}
            onPointerDown={(e) => {
              e.preventDefault();
              setDragging(edge);
            }}
            // Keyboard is not an afterthought here: without it the only way to
            // trim is a drag, which no screen reader or keyboard user can do.
            onKeyDown={(e) => {
              const step = e.shiftKey ? 1 : 0.2;
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const delta = e.key === "ArrowLeft" ? -step : step;
              onChange(
                edge === "start"
                  ? clampTrim(value.start + delta, value.end, duration)
                  : clampTrim(value.start, value.end + delta, duration),
              );
            }}
            className="absolute inset-y-0 flex w-7 items-center justify-center"
            style={{
              left: `${edge === "start" ? leftPct : leftPct + widthPct}%`,
              transform: "translateX(-50%)",
              touchAction: "none",
            }}
          >
            <span
              className={`h-8 w-1.5 rounded-full ${
                tooLong ? "bg-danger" : "bg-accent"
              } ${dragging === edge ? "scale-y-110" : ""}`}
            />
          </button>
        ))}
      </div>

      <p className="text-[11px] text-faint">
        {duration > MAX_SHOT_SECS
          ? `This clip is ${fmtSecs(duration)}. Drag the handles to pick the ${fmtSecs(MAX_SHOT_SECS)} that plays.`
          : `Drag the handles to trim. At least ${MIN_SHOT_SECS}s.`}
      </p>
    </div>
  );
}
