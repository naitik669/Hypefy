"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Decoded peak data, cached per preview URL. Re-opening the same track in one
 * session should not re-download and re-decode a megabyte of audio.
 */
const peakCache = new Map<string, number[]>();

const BARS = 56;

/**
 * Reads the preview and returns one loudness value per bar.
 *
 * RMS per bucket rather than peak: chart music is mastered so hard that peak
 * values sit near 1.0 almost everywhere, which draws a flat brick. RMS still
 * separates a chorus from a verse. Values are normalised to the loudest
 * bucket afterwards so quiet tracks fill the same height.
 */
async function loadPeaks(url: string, signal: AbortSignal): Promise<number[]> {
  const cached = peakCache.get(url);
  if (cached) return cached;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`preview ${res.status}`);
  const buf = await res.arrayBuffer();

  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buf);
    const data = decoded.getChannelData(0);
    const block = Math.floor(data.length / BARS);
    const out: number[] = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      let n = 0;
      // Step through the block rather than reading every sample — at 44.1kHz
      // a bucket is ~23k samples and every 16th is plenty for a drawing.
      for (let k = i * block; k < (i + 1) * block; k += 16) {
        sum += data[k] * data[k];
        n++;
      }
      out.push(n ? Math.sqrt(sum / n) : 0);
    }
    const max = Math.max(...out, 0.0001);
    const norm = out.map((v) => Math.max(0.08, v / max));
    peakCache.set(url, norm);
    return norm;
  } finally {
    void ctx.close();
  }
}

/**
 * Draggable waveform for picking where a 30s preview starts.
 *
 * Bars from the chosen point onward are lit; everything before is dimmed, so
 * the highlit run *is* the snippet that will play. Dragging anywhere on the
 * strip moves the start.
 *
 * If the audio cannot be fetched or decoded the bars simply never appear and
 * the strip stays draggable — the control degrades to a plain scrubber rather
 * than blocking the user from choosing a moment.
 */
export function Waveform({
  src,
  start,
  max,
  duration,
  windowLen,
  onChange,
}: {
  src: string;
  start: number;
  /** Latest allowed start — `duration - windowLen`, so the window always fits. */
  max: number;
  /** Full length of the preview the bars represent. */
  duration: number;
  /** Length of the snippet. The window is this wide and never resizes. */
  windowLen: number;
  onChange: (next: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // One piece of state keyed by src. Resetting it during render is React's
  // documented way to adjust state when a prop changes — doing it in the
  // effect instead would render one frame of the previous track's waveform
  // under the new track's title.
  const [state, setState] = useState<{ src: string; peaks: number[] | null; failed: boolean }>(
    () => ({ src, peaks: peakCache.get(src) ?? null, failed: false }),
  );
  if (state.src !== src) {
    setState({ src, peaks: peakCache.get(src) ?? null, failed: false });
  }
  const { peaks, failed } = state;

  useEffect(() => {
    const ac = new AbortController();
    loadPeaks(src, ac.signal)
      .then((p) => setState((s) => (s.src === src ? { ...s, peaks: p } : s)))
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setState((s) => (s.src === src ? { ...s, failed: true } : s));
      });
    return () => ac.abort();
  }, [src]);

  /** Pointer x is the CENTRE of the window, not its left edge — you are
   *  dragging a block, so it should sit under your finger rather than
   *  trailing it by half its width. Clamped so the block stays on the strip. */
  function seek(clientX: number) {
    const el = stripRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const centre = ratio * duration;
    onChange(Math.min(max, Math.max(0, Math.round(centre - windowLen / 2))));
  }

  const startRatio = start / duration;
  const widthRatio = windowLen / duration;

  return (
    <div
      ref={stripRef}
      role="slider"
      tabIndex={0}
      aria-label="Snippet start point"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={start}
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
        onChange(Math.min(max, Math.max(0, start + (e.key === "ArrowRight" ? 1 : -1))));
      }}
      className="relative flex h-20 w-full cursor-pointer touch-none select-none items-center gap-[2px] rounded-xl bg-elevated px-2 outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
    >
      {peaks
        ? peaks.map((v, i) => {
            // Lit only inside the window — dimmed both before and after, so
            // the bright run reads as a fixed block you slide, not a "from
            // here to the end" selection.
            const t = (i / BARS) * duration;
            const lit = t >= start && t < start + windowLen;
            return (
              <span
                key={i}
                className={`min-w-0 flex-1 rounded-full transition-colors ${lit ? "bg-accent" : "bg-white/12"}`}
                style={{ height: `${Math.round(v * 100)}%` }}
              />
            );
          })
        : // Placeholder bars while decoding, or forever if it failed. Fixed
          // pseudo-random heights, not animation — a shimmering waveform would
          // suggest audio is loading when it may never arrive.
          Array.from({ length: BARS }, (_, i) => (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-full bg-white/[0.07]"
              style={{ height: `${28 + ((i * 37) % 34)}%` }}
            />
          ))}

      {/* The window itself — one block with a bracket on each edge. It is
          not resizable on purpose: every snippet is the same length, so a
          two-handle trimmer would offer a choice that does not exist. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 rounded-lg border-2 border-foreground/70"
        style={{ left: `${startRatio * 100}%`, width: `${widthRatio * 100}%` }}
      />

      {failed && (
        <span className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] text-faint">
          Couldn&apos;t draw the waveform — dragging still works
        </span>
      )}
    </div>
  );
}
