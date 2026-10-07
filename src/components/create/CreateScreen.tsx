"use client";

import { useEffect, useRef, useState } from "react";
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
  Video,
  Camera,
} from "lucide-react";
import { useCamera } from "@/lib/useCamera";
import { useVideoRecorder } from "@/lib/useVideoRecorder";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { haptics } from "@/lib/haptics";
import { TrackPicker } from "@/components/music/TrackPicker";
import { ShotPreview } from "@/components/create/ShotPreview";
import { ShotEditor } from "@/components/create/ShotEditor";
import {
  FilterCarousel,
  FilterRailButton,
  useFilterState,
  viewfinderFilter,
} from "@/components/camera/FilterCarousel";
import type { Track } from "@/lib/music";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { MAX_SHOT_MB } from "@/lib/video-poster";
import { MAX_SHOT_SECS, type Trim } from "@/lib/shot-trim";
import { pickProblem } from "@/lib/pick-check";
import { capturePoster } from "@/lib/video-poster";
import { isVideoFile } from "@/lib/video-mime";
import { useToast } from "@/components/ui/ToastProvider";
import {
  MAX_DRAFTS,
  deleteDraft,
  listDrafts,
  saveDraft,
  type CreationDraft,
  type DraftEdit,
} from "@/lib/creation-drafts";
import { ConstructionNote, DraftStrip, LeaveSheet } from "@/components/create/CreateExtras";

export type CreateMode = "shot" | "show";

/** How long the note on an unbuilt control stays up. */
const NOTE_MS = 2600;

/**
 * Post is here to switch to, not to do: it leaves for the composer. Live is
 * here because it is coming: tapping it says so and changes nothing.
 */
const MODES: { id: CreateMode | "post" | "live"; label: string }[] = [
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
export function CreateScreen({
  userId,
  initialMode = "shot",
  askedForLive = false,
  initialTrack = null,
}: {
  /** A song to start with: "Use this sound" from a sound's page. */
  initialTrack?: Track | null;
  userId: string;
  /** They chose Live from the (+) menu: open with the note on its tab. */
  askedForLive?: boolean;
  /**
   * Which mode to land in. Shot is the default because it is what the camera
   * is already pointed at; holding (+) picks a different one, and arriving on
   * the wrong tab and having to switch would undo the whole point of the
   * shortcut.
   */
  initialMode?: CreateMode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [maxSeconds, setMaxSeconds] = useState(DURATIONS[0]);
  const [track, setTrack] = useState<Track | null>(initialTrack);
  const [trackOpen, setTrackOpen] = useState(false);
  const [captured, setCaptured] = useState<File | null>(null);
  /**
   * Where this Shot is coming from.
   *
   * Opening the creator used to point a live camera at you before you had
   * said you wanted to record anything — and because useCamera started on
   * mount regardless, it did that in every mode, Post and Live included.
   * Most Shots are a clip somebody already has, so choosing one is the
   * landing state and the camera is a thing you ask for.
   */
  const [source, setSource] = useState<"pick" | "camera">("pick");
  /**
   * What the edit stage settled on, once it has been through. Null means the
   * clip has not been edited yet, which is what puts the editor on screen.
   */
  const [edited, setEdited] = useState<{
    duration: number;
    trim: Trim;
    coverTime: number | null;
  } | null>(null);
  /** Past the editor, on the caption. Kept apart from `edited` so stepping
   *  back to the editor does not throw the edit away. */
  const [captioning, setCaptioning] = useState(false);
  const [caption, setCaption] = useState("");
  /** The edit as it stands in the editor right now, for a draft saved from there. */
  const liveEdit = useRef<DraftEdit | null>(null);
  /** Drafts kept on this device, and which one (if any) is open. */
  const [drafts, setDrafts] = useState<CreationDraft[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  /** The question asked before work in progress is left. */
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Which unbuilt control is saying so. */
  const [note, setNote] = useState<"live" | "effects" | null>(askedForLive ? "live" : null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Why the file just chosen cannot be used, said where it was chosen. */
  const [pickError, setPickError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const close = () => safeBack(router);

  /**
   * Back, one step at a time.
   *
   * The hardware Back button used to leave the creator from anywhere in it,
   * caption screen included, and the clip went with it. A clip recorded here
   * cannot be chosen again from the gallery.
   */
  function back() {
    if (leaving) return setLeaving(false);
    if (captured) {
      // Caption → editor keeps everything. Anything further back would drop
      // the clip, so that is asked about first.
      if (captioning && mode === "shot") return setCaptioning(false);
      return setLeaving(true);
    }
    if (source === "camera") return setSource("pick");
    close();
  }
  useOverlayBackButton(true, back);

  useEffect(() => {
    let live = true;
    void listDrafts(userId).then((d) => {
      if (live) setDrafts(d);
    });
    return () => {
      live = false;
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, [userId]);

  // The note that greets someone who chose Live from the (+) menu goes away
  // on its own, like the ones raised by a tap.
  useEffect(() => {
    if (!askedForLive) return;
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, [askedForLive]);

  function sayUnderConstruction(which: "live" | "effects") {
    haptics.tap();
    setNote(which);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }

  function noteEdit(edit: DraftEdit) {
    liveEdit.current = edit;
  }

  /** Put everything about the clip in hand down. */
  function clearWork() {
    setCaptured(null);
    setEdited(null);
    setCaptioning(false);
    setCaption("");
    setDraftId(null);
    setLeaving(false);
    liveEdit.current = null;
  }

  function startWith(file: File) {
    clearWork();
    setCaptured(file);
  }

  async function removeDraft(id: string) {
    await deleteDraft(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  function discard() {
    // Opened from a draft, so discarding is deleting that draft.
    if (draftId) void removeDraft(draftId);
    clearWork();
  }

  async function keepAsDraft() {
    if (!captured || saving) return;
    setSaving(true);
    const isShot = mode === "shot";
    const edit = isShot ? (captioning ? edited : (liveEdit.current ?? edited)) : null;
    // A still to know it by. Never worth failing the save over.
    let thumb: Blob | null = null;
    if (isVideoFile(captured)) {
      const url = URL.createObjectURL(captured);
      thumb = await capturePoster(url, edit?.coverTime ?? null).catch(() => null);
      URL.revokeObjectURL(url);
    } else {
      thumb = captured;
    }
    const draft: CreationDraft = {
      id: draftId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      mode,
      file: captured,
      thumb,
      track,
      edit,
      caption,
      savedAt: Date.now(),
    };
    const result = await saveDraft(draft);
    setSaving(false);
    if (result === "full") {
      setLeaving(false);
      toast(`You have ${MAX_DRAFTS} drafts. Delete one to save another.`, "error");
      return;
    }
    if (result === "failed") {
      setLeaving(false);
      toast("This device couldn't store the draft.", "error");
      return;
    }
    setDrafts((prev) => [draft, ...prev.filter((d) => d.id !== draft.id)]);
    clearWork();
    toast("Saved to drafts", "success");
  }

  function resume(d: CreationDraft) {
    haptics.tap();
    clearWork();
    setMode(d.mode);
    setTrack(d.track);
    setEdited(d.edit);
    setCaption(d.caption);
    // Back on the caption if it had got that far; otherwise the editor.
    setCaptioning(d.mode === "shot" && d.edit !== null);
    setDraftId(d.id);
    setCaptured(d.file);
  }

  /** Published: a draft it came from has done its job. */
  function finish() {
    if (draftId) void deleteDraft(draftId);
    router.replace(mode === "show" ? "/home" : "/shots");
  }

  // Only Shot and Show want a viewfinder. Live has nothing to show yet, so
  // running the camera for it would light the indicator for no reason.
  const wantsCamera = (mode === "shot" || mode === "show") && source === "camera";
  const wantsAudio = mode === "shot";

  // enabled, so the stream is only ever opened once someone asks to record.
  const cam = useCamera({ portrait: true, audio: wantsAudio, enabled: wantsCamera });
  // Filters are for photos, so Show mode only: a Shot records the raw stream.
  const filters = useFilterState();
  const filtering = mode === "show" && filters.open;
  const look = viewfinderFilter(filters.selected);
  const stream = cam.streamRef.current;

  const rec = useVideoRecorder({
    stream,
    maxSeconds,
    onComplete: startWith,
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
      const photo = await cam.capturePhoto(`show-${Date.now()}.jpg`, filters.selected);
      if (photo) startWith(photo);
      return;
    }
    if (mode === "shot") {
      rec.recording ? rec.stop() : rec.start();
    }
  }

  function onGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Now, not three screens later at the Post button.
    const problem = pickProblem(file, mode === "show" ? "show" : "shot");
    setPickError(problem);
    if (problem) return;
    startWith(file);
  }

  const songPicker = trackOpen ? (
    <TrackPicker
      open={trackOpen}
      onClose={() => setTrackOpen(false)}
      onSelect={(t) => {
        setTrack(t);
        setTrackOpen(false);
      }}
    />
  ) : null;

  // Edit step — trim, cover and sound, before anything is written about it.
  // A Show is a photo: none of these apply, so it goes straight to the
  // caption. A Shot goes through here, whichever way its clip arrived, which
  // is what makes the length rule true of both routes rather than only the
  // other composer.
  const leaveSheet = leaving ? (
    <LeaveSheet
      what={mode === "show" ? "Show" : "Shot"}
      resumed={draftId !== null}
      saving={saving}
      onSave={keepAsDraft}
      onDiscard={discard}
      onStay={() => setLeaving(false)}
    />
  ) : null;

  if (captured && mode !== "show" && !captioning) {
    return (
      <>
        <ShotEditor
          file={captured}
          track={track}
          initial={edited}
          onEdit={noteEdit}
          onPickSound={() => setTrackOpen(true)}
          onClearSound={() => setTrack(null)}
          onBack={back}
          onNext={(edit) => {
            setEdited(edit);
            setCaptioning(true);
          }}
        />
        {songPicker}
        {leaveSheet}
      </>
    );
  }

  // Preview step — the captured media, caption, hashtags and publish.
  if (captured) {
    return (
      <>
        <ShotPreview
          file={captured}
          mode={mode}
          track={track}
          userId={userId}
          edit={edited ?? undefined}
          initialCaption={caption}
          onCaptionChange={setCaption}
          onBack={back}
          onDone={finish}
        />
        {leaveSheet}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {/*
        Viewfinder, framed at the shape it will actually be recorded in.

        It used to be full-bleed with object-cover, and that is why it looked
        zoomed in. A phone screen is about 20:9; no camera is. Covering a
        screen that tall with even a perfect 9:16 stream throws away ~18-20%
        of the WIDTH — and if the device hands back landscape, which plenty do
        in a WebView, it throws away about 75%. Measured, on a 390x844 screen:
        1080x1920 leaves 82% of the width, 1280x720 leaves 26%.

        The framing was also dishonest. MediaRecorder captures the stream
        verbatim, so the crop was never applied to the recording — you framed
        a shot against a picture that was not what you were about to save.

        Letterboxed to 9:16 instead: the whole frame is visible, it matches
        what gets stored, and the black bands are where the chrome already
        sits.
      */}
      {wantsCamera ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative aspect-[9/16] max-h-full w-full overflow-hidden">
            <video poster={BLANK_POSTER}
              ref={cam.videoRef}
              autoPlay
              playsInline
              muted
              // A landscape stream (a phone that didn't rotate it) is shown
              // whole rather than cut down to its middle third.
              className={`h-full w-full ${cam.isLandscape ? "object-contain" : "object-cover"} ${
                cam.mirrored ? "[transform:scaleX(-1)]" : ""
              }`}
              style={{ filter: look.filter }}
            />
            {look.tint && (
              <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: look.tint }} />
            )}
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-elevated to-black" />
      )}

      {/* Choose a clip. Sits where the viewfinder would be, so the thing you
          are most likely to want is the thing under your eyes — and nothing
          is recording while you decide. */}
      {!wantsCamera && (mode === "shot" || mode === "show") && (
        <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-5 px-8">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="flex w-full max-w-[300px] flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-white/20 bg-white/[0.03] px-6 py-10 text-center transition-colors hover:border-accent/50 hover:bg-white/[0.06] active:scale-[0.99]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
              <Video size={26} className="text-white" />
            </span>
            <span className="text-[15px] font-bold text-white">
              {mode === "show" ? "Choose a photo or video" : "Choose a video"}
            </span>
            <span className="text-[11px] leading-relaxed text-white/45">
              {mode === "show"
                ? "From your gallery"
                : `MP4 · WebM · MOV · up to ${MAX_SHOT_MB}MB · trimmed to ${MAX_SHOT_SECS}s`}
            </span>
          </button>
          <DraftStrip
            drafts={drafts.filter((d) => d.mode === mode)}
            onResume={resume}
            onDelete={(d) => void removeDraft(d.id)}
          />
        </div>
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
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,var(--sat))]">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
        >
          <X size={20} />
        </button>

        {/* A Show can carry a song as well; the other Show creator, now gone,
            was the only place that offered it. */}
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
          {mode === "show" ? (
            <FilterRailButton open={filters.open} onClick={() => filters.toggle(cam.snapshot)} />
          ) : (
            // Video effects are not built yet. The control is there because
            // they are coming, and tapping it says so.
            <span className="relative">
              <RailButton label="Effects" icon={Sparkles} onClick={() => sayUnderConstruction("effects")} />
              {note === "effects" && <ConstructionNote side="left" />}
            </span>
          )}
        </div>
      )}

      {/* ── Bottom: capture row, then the mode switcher ─────────── */}
      <div className="relative z-10 mt-auto flex flex-col gap-5 pb-[max(0.75rem,var(--sab))]">
        {filtering ? (
          <FilterCarousel
            selected={filters.selected}
            onSelect={filters.select}
            favorites={filters.favorites}
            onToggleFavorite={filters.toggleFavorite}
            onShutter={onShutter}
            disabled={!cam.ready}
            thumb={filters.thumb}
          />
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

            {/* Shutter. It only appears once the camera has been asked for;
                before that its place is taken by the ask. */}
            {source === "pick" ? (
              <button
                type="button"
                onClick={() => {
                  haptics.tap();
                  setSource("camera");
                }}
                className="flex items-center gap-2 rounded-pill bg-white px-6 py-3.5 text-sm font-bold text-black transition-transform active:scale-95"
              >
                <Camera size={18} />
                {mode === "show" ? "Take one" : "Record"}
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

            {/* Back out of the camera, which otherwise had no exit but the
                mode switcher. Keeps the shutter centred either way. */}
            {wantsCamera ? (
              <button
                type="button"
                onClick={() => {
                  haptics.tap();
                  setSource("pick");
                }}
                aria-label="Close the camera"
                className="flex flex-col items-center gap-1 text-white active:scale-95"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/25 bg-black/40 backdrop-blur-sm">
                  <X size={20} />
                </span>
                <span className="text-[11px] font-medium">Close</span>
              </button>
            ) : (
              <span className="h-11 w-11" aria-hidden />
            )}
          </div>
        )}

        {pickError && (
          <p role="alert" className="mx-6 rounded-xl bg-danger/15 px-3 py-2 text-center text-xs text-danger">
            {pickError}
          </p>
        )}

        {rec.unsupported && (
          <p className="px-8 text-center text-xs text-danger">
            This browser can&rsquo;t record video. Pick a clip from your gallery instead.
          </p>
        )}

        {/* Mode switcher */}
        <div className="flex items-center justify-center gap-1">
          {MODES.map((m) => (
            <span key={m.id} className="relative">
            <button
              type="button"
              onClick={() => {
                if (m.id === "live") {
                  sayUnderConstruction("live");
                  return;
                }
                haptics.select();
                if (m.id === "post") {
                  router.push("/create/post");
                  return;
                }
                setSource("pick");
                setPickError(null);
                setMode(m.id);
                if (m.id !== "show") filters.close();
              }}
              aria-pressed={m.id === "live" ? undefined : mode === m.id}
              className={`rounded-pill px-4 py-2 text-sm font-bold transition ${
                mode === m.id
                  ? "bg-white/15 text-white"
                  : "text-white/55 hover:text-white/80"
              }`}
            >
              {m.label}
            </button>
            {m.id === "live" && note === "live" && <ConstructionNote side="above" />}
            </span>
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

      {songPicker}
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
