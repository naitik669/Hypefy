"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { safeBack } from "@/lib/safe-back";
import {
  X,
  RefreshCw,
  Timer,
  Music,
  Sparkles,
  Images,
  AlertCircle,
} from "lucide-react";
import { useCamera } from "@/lib/useCamera";
import { useVideoRecorder } from "@/lib/useVideoRecorder";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { haptics } from "@/lib/haptics";
import { TrackPicker } from "@/components/music/TrackPicker";
import { ShotPreview } from "@/components/create/ShotPreview";
import type { Track } from "@/lib/music";

export type CreateMode = "post" | "shot" | "show" | "live";

const MODES: { id: CreateMode; label: string }[] = [
  { id: "post", label: "Post" },
  { id: "shot", label: "Shot" },
  { id: "show", label: "Show" },
  { id: "live", label: "Live" },
];

/** Duration caps, in the order the button cycles through them. */
const DURATIONS = [15, 30, 60];

/**
 * Fullscreen, camera-first creator.
 *
 * Replaces CreateSheet, which was a bottom-sheet carousel that only routed
 * elsewhere. The camera runs behind the whole UI and the mode switcher sits
 * along the bottom, so choosing what to make no longer means leaving the
 * screen and coming back.
 *
 * A state machine rather than sub-routes — the same shape /shows/add already
 * uses — because the camera stream must survive switching modes, and a route
 * change would tear it down and re-prompt for permission.
 */
export function CreateScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<CreateMode>("shot");
  const [maxSeconds, setMaxSeconds] = useState(DURATIONS[0]);
  const [track, setTrack] = useState<Track | null>(null);
  const [trackOpen, setTrackOpen] = useState(false);
  const [captured, setCaptured] = useState<File | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const close = () => safeBack(router);
  useOverlayBackButton(true, close);

  // Only Shot and Show want a viewfinder. Post is text and gallery, and Live
  // has nothing to show yet — running the camera for either would light the
  // indicator for no reason.
  const wantsCamera = mode === "shot" || mode === "show";
  const wantsAudio = mode === "shot";

  const cam = useCamera({ portrait: true, audio: wantsAudio });
  const stream = cam.streamRef.current;

  const rec = useVideoRecorder({
    stream,
    maxSeconds,
    onComplete: (file) => setCaptured(file),
  });

  // Lock background scroll for as long as the creator is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function onShutter() {
    haptics.tap();
    if (mode === "show") {
      const photo = await cam.capturePhoto(`show-${Date.now()}.jpg`);
      if (photo) setCaptured(photo);
      return;
    }
    if (mode === "shot") {
      rec.recording ? rec.stop() : rec.start();
    }
  }

  function onGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setCaptured(file);
  }

  // Preview step — the captured media, caption, hashtags and publish.
  if (captured) {
    return (
      <ShotPreview
        file={captured}
        mode={mode === "show" ? "show" : "shot"}
        track={track}
        userId={userId}
        onBack={() => setCaptured(null)}
        onDone={() => router.replace(mode === "show" ? "/home" : "/shots")}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/* Viewfinder, full-bleed behind every control. */}
      {wantsCamera ? (
        <video
          ref={cam.videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 h-full w-full object-cover ${
            cam.mirrored ? "[transform:scaleX(-1)]" : ""
          }`}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-elevated to-black" />
      )}

      {wantsCamera && cam.error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
          <AlertCircle size={40} className="text-danger" />
          <p className="text-sm text-white/80">{cam.error}</p>
          <button
            type="button"
            onClick={cam.retry}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
        >
          <X size={20} />
        </button>

        {mode === "shot" && (
          <button
            type="button"
            onClick={() => setTrackOpen(true)}
            className="flex items-center gap-2 rounded-pill bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm active:scale-95"
          >
            <Music size={16} />
            <span className="max-w-[150px] truncate">
              {track ? track.title : "Add sound"}
            </span>
          </button>
        )}

        <div className="h-10 w-10" aria-hidden />
      </div>

      {/* ── Right rail ──────────────────────────────────────────── */}
      {wantsCamera && (
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1 rounded-pill bg-black/35 py-3 backdrop-blur-sm">
          <RailButton label="Flip camera" onClick={cam.flip} icon={RefreshCw} />
          {mode === "shot" && (
            <RailButton
              label={`Length: ${maxSeconds} seconds`}
              onClick={() =>
                setMaxSeconds(
                  (d) => DURATIONS[(DURATIONS.indexOf(d) + 1) % DURATIONS.length],
                )
              }
              icon={Timer}
              caption={`${maxSeconds}s`}
            />
          )}
          {/* Effects are not built yet; the control is present but says so
              rather than pretending to do something. */}
          <RailButton label="Effects — coming soon" icon={Sparkles} disabled />
        </div>
      )}

      {/* ── Bottom: capture row, then the mode switcher ─────────── */}
      <div className="relative z-10 mt-auto flex flex-col gap-5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {mode === "live" ? (
          <p className="px-8 pb-4 text-center text-sm text-white/70">
            Going live isn&rsquo;t ready yet. It&rsquo;ll show up here when it is.
          </p>
        ) : (
          <div className="flex items-center justify-center gap-10 px-6">
            {/* Gallery */}
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-1 text-white active:scale-95"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-black/40 backdrop-blur-sm">
                <Images size={20} />
              </span>
              <span className="text-[11px] font-medium">Add</span>
            </button>

            {/* Shutter. For Post there is no capture — go straight to the
                existing composer, which handles text and multi-image. */}
            {mode === "post" ? (
              <button
                type="button"
                onClick={() => router.push("/create/post")}
                className="rounded-pill bg-accent px-7 py-3.5 text-sm font-bold text-accent-ink active:scale-95"
              >
                Write a post
              </button>
            ) : (
              <button
                type="button"
                onClick={onShutter}
                disabled={!cam.ready || rec.unsupported}
                aria-label={
                  mode === "show"
                    ? "Take photo"
                    : rec.recording
                      ? "Stop recording"
                      : "Start recording"
                }
                className="relative flex h-[74px] w-[74px] items-center justify-center rounded-full border-4 border-white transition-transform active:scale-90 disabled:opacity-40"
              >
                {/* Ring fills as the duration cap is consumed. */}
                {rec.recording && (
                  <span
                    aria-hidden
                    className="absolute inset-[-4px] rounded-full"
                    style={{
                      background: `conic-gradient(var(--color-accent) ${rec.progress * 360}deg, transparent 0deg)`,
                    }}
                  />
                )}
                <span
                  className={`relative bg-danger transition-all ${
                    rec.recording ? "h-7 w-7 rounded-md" : "h-[58px] w-[58px] rounded-full"
                  }`}
                />
              </button>
            )}

            {/* Balances the gallery button so the shutter stays centred. */}
            <span className="h-11 w-11" aria-hidden />
          </div>
        )}

        {rec.unsupported && (
          <p className="px-8 text-center text-xs text-danger">
            This browser can&rsquo;t record video. Pick a clip from your gallery instead.
          </p>
        )}

        {/* Mode switcher */}
        <div className="flex items-center justify-center gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                haptics.select();
                setMode(m.id);
              }}
              aria-pressed={mode === m.id}
              className={`rounded-pill px-4 py-2 text-sm font-bold transition ${
                mode === m.id
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:text-white/80"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept={mode === "show" ? "image/*,video/*" : "video/*"}
        className="hidden"
        onChange={onGallery}
      />

      {trackOpen && (
        <TrackPicker
          open={trackOpen}
          onClose={() => setTrackOpen(false)}
          onSelect={(t) => {
            setTrack(t);
            setTrackOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RailButton({
  label,
  icon: Icon,
  onClick,
  caption,
  disabled,
}: {
  label: string;
  icon: typeof RefreshCw;
  onClick?: () => void;
  caption?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex w-14 flex-col items-center gap-0.5 py-2 text-white transition active:scale-90 disabled:opacity-35"
    >
      <Icon size={22} />
      {caption && <span className="text-[10px] font-bold">{caption}</span>}
    </button>
  );
}
