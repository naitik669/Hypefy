"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { barCount, resamplePeaks, voiceWidth } from "@/lib/voice-peaks";
import { useChatMediaUrl } from "@/lib/chat-media-url";

interface Props {
  /** Storage URL from the voice-notes bucket */
  url: string;
  /** Pre-stored duration (seconds) encoded in message body, fallback to audio metadata */
  storedDuration?: number;
  /** The note's loudness over time, 0–100, recorded with it. Absent on every
   *  note sent before notes carried their shape. */
  peaks?: number[];
  mine: boolean;
}

const BARS = 28;

/**
 * The fallback shape, for notes recorded before notes carried their own.
 *
 * Deliberately gentle and low-contrast: it is standing in for information
 * nobody has, and it should not look as confident as a real waveform sitting
 * next to it in the same thread.
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
 *
 * The bubble is as wide as the note is long, between a floor and a cap, and
 * the bars are the note's own loudness. Both used to be fixed — every note
 * was 200px with the same drawing on it — so the waveform said nothing and
 * the length of what you were about to commit to was invisible until you
 * pressed play.
 */
export function VoiceMessage({ url, storedDuration, peaks, mine }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(storedDuration ?? 0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Voice notes sit in a private bucket; the stored URL is signed on the way in.
  const { src, retry } = useChatMediaUrl(url);

  useEffect(() => {
    if (!src) return;
    const audio = new Audio();
    audioRef.current = audio;
    audio.preload = "metadata";
    audio.src = src;

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
    // An expired link in a long-open thread: re-sign once, then give up.
    audio.onerror = () => {
      setLoaded(false);
      retry();
    };

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src, retry]);

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

  // Width follows the note's length; the bar count follows the width, so
  // bars stay the same thickness whatever the note.
  const width = voiceWidth(duration);
  const bars = barCount(width);
  const shape = peaks?.length ? resamplePeaks(peaks, bars) : resamplePeaks(STATIC_BARS, bars);
  const filledBars = Math.round(progress * shape.length);
  const displayTime = playing || progress > 0 ? currentTime : duration;

  return (
    <div
      style={{ width }}
      className={`flex items-center gap-2.5 rounded-2xl px-3 py-2.5 ${
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
            ? "bg-accent-ink/15 text-accent-ink hover:bg-accent-ink/25"
            : "bg-accent/15 text-accent hover:bg-accent/25"
        }`}
      >
        {playing ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="translate-x-[1px]" />
        )}
      </button>

      {/* Waveform and duration on one line — the duration used to sit under
          the bars, which made every bubble taller than it needed to be. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Waveform bars (tap to seek) */}
        <div
          role="slider"
          aria-label="Voice note scrubber"
          aria-valuenow={Math.round(progress * 100)}
          className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-[2px]"
          onClick={seek}
        >
          {shape.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-colors duration-75 ${
                i < filledBars
                  ? mine
                    ? "bg-accent-ink/80"
                    : "bg-accent"
                  : mine
                    ? "bg-accent-ink/25"
                    : "bg-foreground/15"
              }`}
              style={{ height: `${Math.max(12, h)}%`, minHeight: "12%" }}
            />
          ))}
        </div>

        {/* Duration / current time */}
        <span
          className={`shrink-0 tabular-nums text-[11px] font-bold ${
            mine ? "text-accent-ink/60" : "text-muted"
          }`}
        >
          {fmt(displayTime)}
        </span>
      </div>
    </div>
  );
}
