"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Scissors, ImageIcon, Music, X } from "lucide-react";
import { ShotTrimmer } from "@/components/post/ShotTrimmer";
import { ShotCoverPicker } from "@/components/post/ShotCoverPicker";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { useObjectUrl } from "@/lib/object-url";
import {
  MAX_SHOT_SECS,
  MIN_SHOT_SECS,
  clampTrim,
  defaultTrim,
  fmtSecs,
  playbackWindow,
  tooShort,
  trimToStore,
  type Trim,
} from "@/lib/shot-trim";
import type { Track } from "@/lib/music";

type Tool = "trim" | "cover" | null;

/**
 * The edit stage: the clip, and the three things you can do to it.
 *
 * Split out from the caption step because the two halves want opposite
 * layouts — editing is direct manipulation and wants the screen, describing
 * is a form. It is also where the length rule lives. The camera-first path
 * had no trim and no cap at all, so a three-minute clip picked from the
 * gallery went straight to publish; the rule existed only on the other route
 * into the same content type.
 *
 * Every tool opens over the video rather than replacing it, so you can always
 * see what you are changing.
 */
export function ShotEditor({
  file,
  track,
  onPickSound,
  onClearSound,
  initial,
  onEdit,
  onBack,
  onNext,
}: {
  file: File;
  /**
   * The edit to open on: coming back from the caption, or picking a draft
   * back up. Without it the trim and cover went back to their defaults every
   * time you stepped back to this screen.
   */
  initial?: { trim: Trim; coverTime: number | null } | null;
  /** Told of every change, so leaving from here can keep what was done. */
  onEdit?: (edit: { duration: number; trim: Trim; coverTime: number | null }) => void;
  track: Track | null;
  /** Opens the track picker, which the creator owns. */
  onPickSound: () => void;
  onClearSound: () => void;
  onBack: () => void;
  onNext: (edit: { duration: number; trim: Trim; coverTime: number | null }) => void;
}) {
  const url = useObjectUrl(file);

  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [trim, setTrim] = useState<Trim>({ start: 0, end: 0 });
  const [coverTime, setCoverTime] = useState<number | null>(initial?.coverTime ?? null);
  const [tool, setTool] = useState<Tool>(null);

  useEffect(() => {
    if (duration > 0) onEdit?.({ duration, trim, coverTime });
    // onEdit is the parent's to keep stable; this follows the edit itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, trim, coverTime]);

  const selected = trim.end - trim.start;
  const blocked =
    duration > 0 && tooShort(duration)
      ? `Shots need to be at least ${MIN_SHOT_SECS}s.`
      : duration > 0 && selected > MAX_SHOT_SECS + 0.001
        ? `That is ${fmtSecs(selected)}. Trim it to ${fmtSecs(MAX_SHOT_SECS)} or less.`
        : null;

  // The clip plays the part that will become the Shot, on a loop, so the
  // trim is something you watch rather than something you compute.
  const window0 = playbackWindow(trimToStore(trim, duration));

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,var(--sat))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-sm font-bold text-white">Edit</span>
        <button
          type="button"
          onClick={() => onNext({ duration, trim, coverTime })}
          disabled={blocked !== null}
          className="rounded-pill bg-accent px-5 py-2 text-sm font-bold text-accent-ink transition-transform active:scale-95 disabled:opacity-40"
        >
          Next
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative aspect-[9/16] max-h-full w-full overflow-hidden">
          <video
            ref={video}
            src={url}
            poster={BLANK_POSTER}
            className="h-full w-full object-cover"
            autoPlay
            loop={window0.end === null}
            muted
            playsInline
            onLoadedMetadata={(e) => {
              const secs = e.currentTarget.duration;
              if (!Number.isFinite(secs) || secs <= 0) return;
              setDuration(secs);
              // Clamped against this clip, in case what was kept does not fit it.
              setTrim(
                initial && initial.trim.end > initial.trim.start
                  ? clampTrim(initial.trim.start, initial.trim.end, secs)
                  : defaultTrim(secs),
              );
            }}
            onTimeUpdate={(e) => {
              // Looping the chosen window rather than the file. The native
              // loop only knows about the whole clip.
              const v = e.currentTarget;
              if (v.currentTime < window0.start - 0.25) v.currentTime = window0.start;
              else if (window0.end !== null && v.currentTime >= window0.end) {
                v.currentTime = window0.start;
              }
            }}
          />
        </div>

        {/* One button per thing you can change. A rail rather than a row of
            panels, so the clip keeps the screen while you work on it. */}
        <div className="absolute right-3 top-4 z-10 flex flex-col gap-3">
          <ToolButton
            label="Trim"
            icon={Scissors}
            caption={duration > 0 ? fmtSecs(selected) : undefined}
            active={tool === "trim"}
            onClick={() => setTool((t) => (t === "trim" ? null : "trim"))}
          />
          <ToolButton
            label="Cover"
            icon={ImageIcon}
            active={tool === "cover"}
            onClick={() => setTool((t) => (t === "cover" ? null : "cover"))}
          />
          <ToolButton
            label={track ? "Sound" : "Add sound"}
            icon={Music}
            active={!!track}
            onClick={onPickSound}
          />
        </div>

        {blocked && (
          <p className="absolute inset-x-4 bottom-3 z-10 rounded-xl bg-danger/90 px-3 py-2 text-center text-xs font-semibold text-white">
            {blocked}
          </p>
        )}
      </div>

      {/* The chosen song, where you can see it is chosen and drop it. */}
      {track && !tool && (
        <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
          <Music size={16} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            {track.title}
            {track.artist && <span className="font-normal text-white/50"> · {track.artist}</span>}
          </span>
          <button
            type="button"
            onClick={onClearSound}
            aria-label="Remove sound"
            className="shrink-0 rounded-full p-1 text-white/50 active:scale-90"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {tool && (
        <div className="border-t border-white/10 bg-elevated px-4 pb-[max(0.75rem,var(--sab))] pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {tool === "trim" ? "Trim" : "Cover"}
            </span>
            <button
              type="button"
              onClick={() => setTool(null)}
              aria-label="Done"
              className="text-[11px] font-bold text-accent"
            >
              Done
            </button>
          </div>
          {tool === "trim" && duration > 0 && (
            <ShotTrimmer src={url} duration={duration} value={trim} onChange={setTrim} />
          )}
          {tool === "cover" && (
            <ShotCoverPicker src={url} value={coverTime} onChange={setCoverTime} />
          )}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  icon: Icon,
  caption,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Scissors;
  caption?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className="flex flex-col items-center gap-1 active:scale-95"
    >
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-2xl backdrop-blur-sm transition-colors ${
          active ? "bg-accent text-accent-ink" : "bg-black/45 text-white"
        }`}
      >
        <Icon size={19} />
      </span>
      <span className="text-[10px] font-bold text-white drop-shadow">
        {caption ?? label}
      </span>
    </button>
  );
}
