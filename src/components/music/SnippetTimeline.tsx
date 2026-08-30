"use client";

import { useRef } from "react";

/**
 * Drag a fixed-length window along a track, with no waveform behind it.
 *
 * Used for Spotify tracks. The Web Playback SDK is a remote control, not an
 * audio source — there are no samples to decode, so there is nothing to draw.
 * Rather than fake a waveform from noise, this shows the shape of the choice
 * honestly: a bar the length of the song, and the block that will play.
 *
 * Same interaction contract as Waveform: pointer x is the window's centre,
 * arrow keys nudge, and the window never resizes.
 */
export function SnippetTimeline({
  start,
  max,
  duration,
  windowLen,
  onChange,
}: {
  start: number;
  max: number;
  duration: number;
  windowLen: number;
  onChange: (next: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function seek(clientX: number) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    onChange(Math.min(max, Math.max(0, Math.round(ratio * duration - windowLen / 2))));
  }

  const startRatio = duration > 0 ? start / duration : 0;
  const widthRatio = duration > 0 ? Math.min(1, windowLen / duration) : 1;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Snippet start point"
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-valuenow={Math.round(start)}
      aria-valuetext={`Starts at ${Math.round(start)} seconds`}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(e.clientX);
      }}
      onPointerMove={(e) => { if (dragging.current) seek(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        // A whole song is long enough that one second per press is useless;
        // step by a fraction of the window instead.
        const step = Math.max(1, Math.round(windowLen / 5));
        onChange(Math.min(max, Math.max(0, start + (e.key === "ArrowRight" ? step : -step))));
      }}
      className="relative h-20 w-full cursor-pointer touch-none select-none overflow-hidden rounded-xl bg-elevated outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
    >
      {/* Inert tick marks: texture so the strip reads as a length rather than
          an empty box, without pretending to describe the audio. */}
      <div aria-hidden className="absolute inset-0 flex items-center gap-[3px] px-2">
        {Array.from({ length: 48 }, (_, i) => (
          <span key={i} className="h-6 min-w-0 flex-1 rounded-full bg-white/[0.06]" />
        ))}
      </div>

      <span
        aria-hidden
        className="absolute inset-y-0 rounded-lg border-2 border-foreground/70 bg-accent/25"
        style={{ left: `${startRatio * 100}%`, width: `${widthRatio * 100}%` }}
      />
    </div>
  );
}
