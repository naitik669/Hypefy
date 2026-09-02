"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send, Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { extractHashtags } from "@/lib/content-utils";
import {
  ALLOWED_SHOT_TYPES,
  MAX_SHOT_MB,
  capturePoster,
} from "@/lib/video-poster";
import {
  SuggestionDropdown,
  applySuggestion,
  useMentionHashtag,
} from "@/components/ui/MentionHashtagPicker";
import type { Track } from "@/lib/music";

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
  onBack,
  onDone,
}: {
  file: File;
  mode: "shot" | "show";
  track: Track | null;
  userId: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const [caption, setCaption] = useState("");
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { suggestions, reset } = useMentionHashtag(caption, cursor);
  const isVideo = file.type.startsWith("video/");

  // Object URLs leak until revoked, and a long session through the creator
  // can mint a lot of them.
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const tooBig = file.size > MAX_SHOT_MB * 1024 * 1024;
  const badType = isVideo && !ALLOWED_SHOT_TYPES.includes(file.type);

  async function publish() {
    if (busy) return;

    if (tooBig) {
      toast(`That clip is over ${MAX_SHOT_MB}MB. Try a shorter one.`);
      return;
    }
    if (badType) {
      toast("That video format isn't supported.");
      return;
    }

    setBusy(true);
    const bucket = mode === "show" ? "show-media" : "shot-media";
    const ext = file.name.split(".").pop() || (isVideo ? "webm" : "jpg");
    const path = `${userId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (upErr) {
      setBusy(false);
      toast("Upload failed. Check your connection and try again.");
      return;
    }

    const mediaUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

    // Poster frame. Best-effort: a Shot without one still plays, so a
    // failure here must not block publishing.
    let posterUrl: string | null = null;
    if (isVideo && mode === "shot") {
      const poster = await capturePoster(url);
      if (poster) {
        const posterPath = `${userId}/${Date.now()}-poster.jpg`;
        const { error: pErr } = await supabase.storage
          .from(bucket)
          .upload(posterPath, poster, { contentType: "image/jpeg" });
        if (!pErr) {
          posterUrl = supabase.storage.from(bucket).getPublicUrl(posterPath).data
            .publicUrl;
        }
      }
    }

    const text = caption.trim();
    const { error: insErr } =
      mode === "show"
        ? await supabase.from("shows").insert({
            user_id: userId,
            media_url: mediaUrl,
            caption: text || null,
            track: track ?? null,
          })
        : await supabase.from("shots").insert({
            user_id: userId,
            media_url: mediaUrl,
            caption: text || null,
            poster_url: posterUrl,
            track: track ?? null,
            hashtags: extractHashtags(text),
          });

    setBusy(false);

    if (insErr) {
      toast("Couldn't publish that. Try again.");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      {isVideo ? (
        <video
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

      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
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

      <div className="relative z-10 mt-auto flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {(tooBig || badType) && (
          <p className="rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
            {tooBig
              ? `That clip is ${(file.size / 1024 / 1024).toFixed(0)}MB — the limit is ${MAX_SHOT_MB}MB.`
              : "That video format isn't supported."}
          </p>
        )}

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

        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-white/50">
            {caption.length}/280
          </span>
          <button
            type="button"
            onClick={publish}
            disabled={busy || tooBig || badType}
            className="flex items-center gap-2 rounded-pill bg-accent px-6 py-3 text-sm font-bold text-accent-ink transition active:scale-95 disabled:opacity-50"
          >
            {busy ? "Posting…" : mode === "show" ? "Add to Show" : "Post Shot"}
            {!busy && <Send size={15} />}
          </button>
        </div>
      </div>
    </div>
  );
}
