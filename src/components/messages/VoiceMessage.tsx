"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

interface Props {
  /** Storage URL from the voice-notes bucket */
  url: string;
  /** Pre-stored duration (seconds) encoded in message body, fallback to audio metadata */
  storedDuration?: number;
  mine: boolean;
}

const BARS = 28;

/**
 * Deterministic organic waveform heights — looks hand-drawn without any
 * heavy audio decoding. Values are stable between renders and don't jump.
 */
function staticBar(i: number): number {
  const x = i / BARS;
  const h =
    Math.abs(Math.sin(x * Math.PI * 7.5)) * 55 +
    Math.abs(Math.sin(x * Math.PI * 2.9 + 1.1)) * 28 +
    Math.abs(Math.cos(x * Math.PI * 11.2 + 0.4)) * 12 +
    10;
  return Math.min(95, Math.max(10, h));
}

const STATIC_BARS = Array.from({ length: BARS }, (_, i) => staticBar(i));

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = String(Math.floor(secs % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Hypefy-branded voice message bubble.
 *
 * Mine  → accent background, accent-ink bars
 * Theirs → surface background, accent bars
 *
 * Tap the waveform to seek. Tap the play button to toggle playback.
 */
export function VoiceMessage({ url, storedDuration, mine }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(storedDuration ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "metadata";
    audio.src = url;

    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
      setLoaded(true);
    };
    audio.ontimeupdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
        setCurrentTime(audio.currentTime);
      }
    };
    audio.onended = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    audio.onerror = () => setLoaded(false);

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [url]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !loaded) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch(() => {});
      setPlaying(true);
    }
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setProgress(ratio);
  }

  const filledBars = Math.round(progress * BARS);
  const displayTime = playing || progress > 0 ? currentTime : duration;

  return (
    <div
      className={`flex w-[200px] items-center gap-2.5 rounded-2xl px-3 py-2.5 ${
        mine ? "rounded-br-md bg-accent" : "rounded-bl-md bg-surface"
      }`}
    >
      {/* Play / Pause button */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
          mine
            ? "bg-white/20 text-white hover:bg-white/30"
            : "bg-accent/15 text-accent hover:bg-accent/25"
        }`}
      >
        {playing ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="translate-x-[1px]" />
        )}
      </button>

      {/* Waveform + duration */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* Waveform bars (tap to seek) */}
        <div
          role="slider"
          aria-label="Voice note scrubber"
          aria-valuenow={Math.round(progress * 100)}
          className="flex h-7 cursor-pointer items-end gap-[2px]"
          onClick={seek}
        >
          {STATIC_BARS.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-colors duration-75 ${
                i < filledBars
                  ? mine
                    ? "bg-white"
                    : "bg-accent"
                  : mine
                    ? "bg-white/30"
                    : "bg-foreground/15"
              }`}
              style={{ height: `${h}%`, minHeight: "10%" }}
            />
          ))}
        </div>

        {/* Duration / current time */}
        <span
          className={`tabular-nums text-[10px] font-semibold ${
            mine ? "text-white/60" : "text-faint"
          }`}
        >
          {fmt(displayTime)}
        </span>
      </div>
    </div>
  );
}
