"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, Globe, Music, Star } from "lucide-react";
import { SendIcon } from "@/components/ui/ShareIcon";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { extractHashtags, extractMentions } from "@/lib/content-utils";
import { MAX_SHOT_MB, MAX_SHOW_MB } from "@/lib/video-poster";
import {
  SuggestionDropdown,
  applySuggestion,
  useMentionHashtag,
} from "@/components/ui/MentionHashtagPicker";
import type { Track } from "@/lib/music";
import type { Trim } from "@/lib/shot-trim";
import { BLANK_POSTER } from "@/lib/blank-poster";
import { useObjectUrl } from "@/lib/object-url";
import { isAllowedVideo, isVideoFile } from "@/lib/video-mime";
import { useUpload } from "@/components/upload/UploadProvider";
import { DESIGN_WIDTH, type ShowLayer } from "@/lib/show-layers";
import { LayerStack } from "@/components/shows/LayerView";
import { publishFailureMessage, publishShow } from "@/lib/show-publish";
import { ShowAudienceBar } from "@/components/shows/ShowAudienceBar";
import type { ShowAudience } from "@/lib/show-audience";

/**
 * Preview and publish step for the camera-first creator.
 *
 * The media fills the screen the way the reel feed will show it, with the
 * caption over a gradient scrim rather than in a form below — what you see
 * here is what the Shot looks like.
 */
export function ShotPreview({
  file,
  mode,
  track,
  userId,
  edit,
  initialCaption = "",
  onCaptionChange,
  onBack,
  onDone,
  layers = [],
  collabId,
}: {
  file: File;
  mode: "shot" | "show";
  track: Track | null;
  userId: string;
  /**
   * What the edit stage decided: the clip's length, the window that plays,
   * and which frame is the cover. Absent for a Show, which is a photo and
   * has none of them.
   */
  edit?: { duration: number; trim: Trim; coverTime: number | null };
  /** What was written last time, when this is a draft or a step back. */
  initialCaption?: string;
  /** Told of every keystroke, so leaving can keep the words too. */
  onCaptionChange?: (caption: string) => void;
  onBack: () => void;
  onDone: () => void;
  /** What was arranged on a Show, if anything was. */
  layers?: ShowLayer[];
  /** The shared Show this one is being added to, if any. */
  collabId?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const { uploadShot } = useUpload();
  const [caption, setCaptionState] = useState(initialCaption);
  function setCaption(next: string) {
    setCaptionState(next);
    onCaptionChange?.(next);
  }
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  /** Who the Show goes to, and who it is kept from. Shows only. */
  const [audience, setAudience] = useState<ShowAudience>("everyone");
  const [hiddenFrom, setHiddenFrom] = useState<string[]>([]);
  /** The cover frame, in seconds, as the edit stage left it. It was asked
   *  for again on this screen, a second time for the same Shot. */
  const coverTime = edit?.coverTime ?? null;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /**
   * The Show's stickers, drawn where they were placed. This screen showed
   * the bare photo, so everything arranged on it looked lost the moment
   * "Add to your Show" was pressed — it was posted, just never shown here.
   */
  const frameRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ width: DESIGN_WIDTH, height: 844 });
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const seen = new ResizeObserver(([entry]) => {
      setFrame({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const { suggestions, reset } = useMentionHashtag(caption, cursor);
  // Not file.type.startsWith: a gallery pick can arrive with no type at all,
  // and then a video was treated as an image.
  const isVideo = isVideoFile(file);

  // Object URLs leak until revoked, and a long session through the creator
  // can mint a lot of them — but revoking them in an effect cleanup breaks
  // every second reader of the same URL, which is what the cover picker is.
  const url = useObjectUrl(file);

  // Shows go to a bucket half the size of Shots. Using the Shot limit for both
  // meant a 40MB Show passed this check and was rejected on upload — reported
  // as "check your connection", because the catch below can't tell a 413 from
  // a dropped socket.
  const maxMb = mode === "show" ? MAX_SHOW_MB : MAX_SHOT_MB;
  const tooBig = file.size > maxMb * 1024 * 1024;
  // Compared on the base type. A clip recorded in the app is
  // "video/webm;codecs=vp9,opus", which is not any of the bare strings in the
  // allowed list — so every recorded Shot was refused here.
  const badType = isVideo && !isAllowedVideo(file);

  async function publish(room: ShowAudience = audience) {
    if (busy) return;

    if (tooBig) {
      toast(`That clip is over ${maxMb}MB. Try a shorter one.`);
      return;
    }
    if (badType) {
      toast("That video format isn't supported.");
      return;
    }

    // A Shot goes to the background uploader and you go back to the feed.
    // Publishing used to hold you here on a spinner for the whole file — up
    // to 50 MB on a phone — and a failure dropped the clip with it. The
    // uploader keeps the File, so a failure is a banner with a Retry.
    //
    // A Show stays inline: it is a photo, it is quick, and it has none of the
    // trim or poster work that makes the Shot path worth moving.
    if (mode === "shot") {
      uploadShot({
        userId,
        file,
        caption: caption.trim() || null,
        hashtags: extractHashtags(caption.trim()),
        mentions: extractMentions(caption.trim()),
        track,
        coverTime,
        duration: edit?.duration ?? 0,
        trim: edit?.trim ?? { start: 0, end: 0 },
      });
      onDone();
      return;
    }

    setBusy(true);
    const result = await publishShow(supabase, {
      userId,
      file,
      caption,
      track,
      layers,
      audience: room,
      hiddenFrom,
      collabId,
    });
    if (!result.ok) {
      setBusy(false);
      toast(publishFailureMessage(result.reason));
      return;
    }

    setBusy(false);
    onDone();
  }

  const captionField = (
    <div className="relative">
      {/* Suggestions open downward here: the field sits at the bottom of
          a fullscreen overlay, so the usual upward dropdown would run
          off the top of the caption area. */}
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-2">
          <SuggestionDropdown
            suggestions={suggestions}
            onSelect={(s) => {
              const { newValue, newCursor } = applySuggestion(caption, cursor, s);
              setCaption(newValue);
              setCursor(newCursor);
              reset();
              requestAnimationFrame(() =>
                inputRef.current?.setSelectionRange(newCursor, newCursor),
              );
            }}
          />
        </div>
      )}

      <textarea
        ref={inputRef}
        value={caption}
        onChange={(e) => {
          setCaption(e.target.value);
          setCursor(e.target.selectionStart ?? 0);
        }}
        onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        rows={2}
        maxLength={280}
        placeholder="Say something… use #hashtags"
        aria-label="Caption"
        className="w-full resize-none rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white outline-none backdrop-blur-sm transition placeholder:text-white/45 focus:border-white/35"
      />
    </div>
  );

  /**
   * A Show is shared from its own preview: the picture as people will see
   * it, stickers and all, and under it one row — who it is kept from, then
   * the two places it can go. Choosing the room is the button you press,
   * so there is no picker to set first.
   */
  if (mode === "show") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-black px-2 pb-[max(0.75rem,var(--sab))] pt-[max(0.5rem,var(--sat))]">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[26px] bg-neutral-900" data-show-preview>
          {isVideo ? (
            <video poster={BLANK_POSTER} src={url} className="absolute inset-0 h-full w-full object-cover" autoPlay loop muted playsInline />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div ref={frameRef} className="pointer-events-none absolute inset-0">
            <LayerStack layers={layers} frame={frame} editing />
          </div>
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-2">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to editing"
              className="flex h-11 w-11 items-center justify-center text-white [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))_drop-shadow(0_0_8px_rgba(0,0,0,0.3))] active:scale-90"
            >
              <ChevronLeft size={28} strokeWidth={2.6} />
            </button>
            {track && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.6))]">
                <Music size={13} />
                <span className="max-w-[160px] truncate">{track.title}</span>
              </span>
            )}
          </div>

          <div className="absolute inset-x-3 bottom-3">
            {(tooBig || badType) && (
              <p className="mb-2 rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
                {tooBig
                  ? `That photo is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is ${maxMb}MB.`
                  : "That video format isn't supported."}
              </p>
            )}
            {captionField}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 px-1" data-share-row>
          <ShowAudienceBar
            userId={userId}
            audience="everyone"
            onAudience={setAudience}
            hidden={hiddenFrom}
            onHidden={setHiddenFrom}
            compact
          />
          <span className="flex-1" />
          {collabId ? (
            <ShareButton label={busy ? "Posting…" : "Add to the shared Show"} tone="lime" disabled={busy || tooBig || badType} onClick={() => publish("everyone")}>
              <Globe size={15} />
            </ShareButton>
          ) : (
            <>
              <ShareButton label={busy && audience === "everyone" ? "Posting…" : "Your Show"} tone="white" disabled={busy || tooBig || badType} onClick={() => { setAudience("everyone"); void publish("everyone"); }}>
                <Globe size={15} />
              </ShareButton>
              <ShareButton label={busy && audience === "hypers" ? "Posting…" : "Hype buddies"} tone="lime" disabled={busy || tooBig || badType} onClick={() => { setAudience("hypers"); void publish("hypers"); }}>
                <Star size={15} className="fill-current" />
              </ShareButton>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {isVideo ? (
        <video poster={BLANK_POSTER}
          src={url}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}

      {/* Scrims so the controls stay readable over any footage. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 to-transparent"
      />

      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,var(--sat))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to camera"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
        >
          <ArrowLeft size={20} />
        </button>
        {track && (
          <span className="flex items-center gap-1.5 rounded-pill bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
            <Music size={13} />
            <span className="max-w-[160px] truncate">{track.title}</span>
          </span>
        )}
      </div>

      <div className="relative z-10 mt-auto flex flex-col gap-3 px-4 pb-[max(1rem,var(--sab))]">
        {(tooBig || badType) && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
            {tooBig
              ? `That clip is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is ${maxMb}MB.`
              : "That video format isn't supported."}
          </p>
        )}

        {captionField}

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-white/50">
            {caption.length}/280
          </span>
          <button
            type="button"
            onClick={() => publish()}
            disabled={busy || tooBig || badType}
            className="flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-50"
          >
            {busy ? "Posting…" : "Post Shot"}
            {!busy && <SendIcon size={15} weight="fill" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One of the two places a Show can go: small, a dark icon tile then the words. */
function ShareButton({
  label,
  tone,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone: "white" | "lime";
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 items-center gap-2 rounded-[15px] pl-1.5 pr-3.5 text-[13px] font-extrabold text-black transition active:scale-95 disabled:opacity-50 ${
        tone === "lime" ? "bg-accent" : "bg-white"
      }`}
    >
      <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-[11px] bg-black ${tone === "lime" ? "text-accent" : "text-white"}`}>
        {children}
      </span>
      {label}
    </button>
  );
}
