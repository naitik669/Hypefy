"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2, Loader2 } from "lucide-react";
import { SendIcon } from "@/components/ui/ShareIcon";
import { summarisePeaks } from "@/lib/voice-peaks";

type Status = "idle" | "recording" | "paused" | "sending";

interface Props {
  /** `peaks` is the note's loudness over time, 0–100, for drawing its shape. */
  onSend: (blob: Blob, durationSecs: number, peaks: number[]) => Promise<void>;
  onCancel: () => void;
  /** Fires on every real recording-state transition (mic actually live vs.
   *  paused/stopped) — lets the parent broadcast this to the other party,
   *  mirroring the typing indicator. Not tied to the mic-permission prompt:
   *  it only fires once audio is genuinely flowing. */
  onStatusChange?: (recording: boolean) => void;
}

const BARS = 30;
const MAX_SECS = 120; // 2-minute cap
/** How often loudness is sampled, in ms. 60fps is far more than a waveform
 *  needs and would push a setState every frame for two minutes. */
const SAMPLE_MS = 60;

function getSupportedMime(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Format seconds as M:SS */
function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = String(Math.floor(secs % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Full-composer voice recorder with pause/resume.
 * Renders inside the chat composer area, replacing the text input.
 *
 *  ┌─────────────────────────────────────────────────────┐
 *  │  [🗑]  ~~live waveform~~  0:32 paused  [⏸/▶]  [➤]  │
 *  └─────────────────────────────────────────────────────┘
 */
export function VoiceRecorder({ onSend, onCancel, onStatusChange }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [bars, setBars] = useState<number[]>(Array(BARS).fill(8));

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /** Every loudness sample of the whole recording, pauses included, so the
   *  note is sent with the shape you watched while speaking. */
  const samplesRef = useRef<number[]>([]);
  const lastSampleAt = useRef(0);

  // Boot — request mic and start immediately
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        bootRecorder(stream);
      } catch {
        if (!cancelled) onCancel();
      }
    })();
    return () => {
      cancelled = true;
      stopCleanup();
      onStatusChange?.(false); // safety net for an unexpected unmount mid-recording
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hit the cap
  useEffect(() => {
    if (elapsed >= MAX_SECS && status === "recording") pauseRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  // ── Internals ─────────────────────────────────────────────────────────────

  function bootRecorder(stream: MediaStream) {
    const mime = getSupportedMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(150); // collect chunk every 150ms
    setStatus("recording");
    onStatusChange?.(true);
    startTimer();
    startWaveform(stream);
  }

  function startTimer() {
    // Also re-announces "still recording" every second — a recording can run
    // up to MAX_SECS with only one start event otherwise, and the peer's
    // indicator uses a short safety-net timeout to recover from a missed stop.
    timerRef.current = setInterval(() => {
      setElapsed((e) => e + 1);
      onStatusChange?.(true);
    }, 1000);
  }
  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function startWaveform(stream: MediaStream) {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    // Time domain, not frequency: this used to read the frequency spectrum and
    // draw it as bars, which is why the "waveform" wriggled constantly and
    // never went quiet when you stopped talking. Loudness over time is the
    // thing a voice note's shape is supposed to mean.
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    src.connect(analyser);
    analyserRef.current = analyser;

    const data = new Uint8Array(analyser.fftSize);
    function tick() {
      animRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - lastSampleAt.current < SAMPLE_MS) return;
      lastSampleAt.current = now;

      analyser.getByteTimeDomainData(data);
      // Silence sits at 128; loudness is how far the wave swings from it.
      let swing = 0;
      for (const v of data) swing = Math.max(swing, Math.abs(v - 128));
      // Speech rarely comes near the full range, so it is lifted to use the
      // height available. The clamp keeps a shout from clipping the bar.
      const level = Math.min(100, Math.round((swing / 128) * 165));

      samplesRef.current.push(level);
      // The live bars scroll: the newest sample enters on the right, so the
      // recording reads left to right exactly as it will once sent.
      setBars((prev) => [...prev.slice(1), Math.max(6, level)]);
    }
    animRef.current = requestAnimationFrame(tick);
  }

  function stopWaveform() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    setBars(Array(BARS).fill(8));
    analyserRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  function stopCleanup() {
    stopTimer();
    stopWaveform();
    try { mediaRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  // ── Public actions ─────────────────────────────────────────────────────────

  function pauseRecording() {
    if (mediaRef.current?.state === "recording") {
      mediaRef.current.pause();
      setStatus("paused");
      onStatusChange?.(false);
      stopTimer();
      stopWaveform();
    }
  }

  function resumeRecording() {
    if (mediaRef.current?.state === "paused") {
      mediaRef.current.resume();
      setStatus("recording");
      onStatusChange?.(true);
      startTimer();
      if (streamRef.current) startWaveform(streamRef.current);
    }
  }

  async function sendVoice() {
    if (status === "sending" || elapsed === 0) return;
    setStatus("sending");
    onStatusChange?.(false);
    stopTimer();
    stopWaveform();

    const mr = mediaRef.current;
    if (!mr) { onCancel(); return; }

    // Flush final chunk then collect blob
    await new Promise<void>((res) => { mr.onstop = () => res(); mr.stop(); });
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const mime = getSupportedMime() || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    await onSend(blob, elapsed, summarisePeaks(samplesRef.current));
  }

  function discard() {
    onStatusChange?.(false);
    stopCleanup();
    onCancel();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isRecording = status === "recording";
  const isPaused = status === "paused";
  const isSending = status === "sending";

  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2.5 ring-1 ring-border/60">
      {/* Discard */}
      <button
        type="button"
        onClick={discard}
        aria-label="Discard recording"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger transition hover:bg-danger/10 active:scale-90"
      >
        <Trash2 size={18} />
      </button>

      {/* Waveform + timer */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Live bars */}
        <div className="flex h-7 items-end gap-[2.5px]">
          {bars.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-all duration-75 ${
                isRecording ? "bg-accent" : "bg-foreground/25"
              }`}
              style={{ height: `${h}%`, minHeight: "6%" }}
            />
          ))}
        </div>
        {/* Timer + state label */}
        <div className="flex items-center gap-1.5">
          {isRecording && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          )}
          {isPaused && (
            <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
          )}
          <span className="tabular-nums text-[11px] font-semibold text-muted">
            {fmt(elapsed)}
          </span>
          {isPaused && (
            <span className="text-[10px] font-medium text-faint">paused</span>
          )}
          {elapsed >= MAX_SECS && (
            <span className="text-[10px] text-faint">max</span>
          )}
        </div>
      </div>

      {/* Pause / Resume */}
      <button
        type="button"
        onClick={isRecording ? pauseRecording : resumeRecording}
        aria-label={isRecording ? "Pause recording" : "Resume recording"}
        disabled={isSending}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:bg-white/5 active:scale-90 disabled:opacity-30"
      >
        {isRecording ? <Pause size={16} /> : <Play size={16} className="translate-x-[1px]" />}
      </button>

      {/* Send */}
      <button
        type="button"
        onClick={sendVoice}
        disabled={isSending || elapsed === 0}
        aria-label="Send voice note"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
      >
        {isSending
          ? <Loader2 size={18} className="animate-spin" />
          : <SendIcon size={18} weight="fill" />
        }
      </button>
    </div>
  );
}
