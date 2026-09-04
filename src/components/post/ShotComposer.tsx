"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video, X, Loader2, Send, Link2, Check, ChevronRight, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { ShotCoverPicker } from "@/components/post/ShotCoverPicker";

const MAX_SIZE_MB = 60;
const ALLOWED_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/ogg"];
const POSTER_WIDTH = 720;

/** Author chip for the preview — the Shot is drawn as the reel feed draws it,
 *  which means it needs the same identity the feed puts over the video. */
export type ShotAuthor = {
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

/** Two panes: build it, then look at it. Labels are for the header title and
 *  assistive tech — the visible indicator is bars, same as the post composer. */
const STEPS = [{ label: "New Shot" }, { label: "Preview" }] as const;

/**
 * Grab a poster frame from the video as a JPEG blob.
 *
 * `at` is the chosen cover time; without one it falls back to ~0.5s, past any
 * black lead-in. The fallback is what every Shot used to get, and it is why
 * the picker exists — half a second into a phone recording is very often a
 * hand reaching for the screen.
 *
 * Returns null when the browser can't decode or seek. The Shot still posts,
 * just without a thumbnail.
 */
function capturePoster(src: string, at?: number | null): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    const bail = setTimeout(() => resolve(null), 8000);
    video.onerror = () => { clearTimeout(bail); resolve(null); };
    video.onloadedmetadata = () => {
      const fallback = Math.min(0.5, Math.max(0, video.duration - 0.1));
      // Clamped: a cover time from a picker that read a different duration
      // than this element reports would otherwise seek past the end and never
      // fire onseeked, hanging until the bail timeout.
      video.currentTime =
        at != null && Number.isFinite(at)
          ? Math.min(Math.max(at, 0), Math.max(0, video.duration - 0.05))
          : fallback;
    };
    video.onseeked = () => {
      clearTimeout(bail);
      const scale = Math.min(1, POSTER_WIDTH / (video.videoWidth || POSTER_WIDTH));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round((video.videoWidth || POSTER_WIDTH) * scale);
      canvas.height = Math.round((video.videoHeight || POSTER_WIDTH) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
    };
  });
}

/**
 * Shot composer — Shots are short VIDEO reels (permanent, vertical feed).
 */
export function ShotComposer({ userId, author }: { userId: string; author: ShotAuthor }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  /** Chosen cover frame, in seconds. Null until the picker reports one. */
  const [coverTime, setCoverTime] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [postedId, setPostedId] = useState<string | null>(null);
  /** Which pane is showing. Posting stays reachable from both — the steps
   *  sequence the work, they do not gate publishing. */
  const [step, setStep] = useState(0);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError(null);
    if (!ALLOWED_TYPES.includes(f.type)) {
      setFileError("Shots are videos. Allowed: MP4, WebM, MOV.");
      return;
    }
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Max size ${MAX_SIZE_MB}MB.`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    // A new clip invalidates the old choice.
    setCoverTime(null);
  }

  function removeFile() {
    setFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    // Nothing left to preview — don't strand the user on an empty pane.
    setStep(0);
  }

  async function copyLink() {
    if (!postedId) return;
    const url = `${window.location.origin}/shots`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handlePost() {
    if (!file) return;
    setPostError(null);
    startTransition(async () => {
      const ext = file.name.split(".").pop() ?? "mp4";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from("shot-media")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) {
        setPostError("Upload failed: " + uploadErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("shot-media").getPublicUrl(path);

      // Poster frame → Discover tiles, profile grids, OG cards, and the reel
      // feed's own loading state. Optional: a failed capture never blocks the
      // post itself.
      let posterUrl: string | null = null;
      if (preview) {
        const posterBlob = await capturePoster(preview, coverTime);
        if (posterBlob) {
          const posterPath = `${userId}/${Date.now()}-poster.jpg`;
          const { error: posterErr } = await supabase.storage
            .from("shot-media")
            .upload(posterPath, posterBlob, { contentType: "image/jpeg", upsert: false });
          if (!posterErr) {
            posterUrl = supabase.storage.from("shot-media").getPublicUrl(posterPath).data.publicUrl;
          }
        }
      }

      const { data: shot, error: insertErr } = await supabase
        .from("shots")
        .insert({ user_id: userId, media_url: pub.publicUrl, caption: caption.trim() || null, poster_url: posterUrl })
        .select("id")
        .single();

      if (insertErr) {
        setPostError(insertErr.message);
        return;
      }
      setPostedId(shot.id);
    });
  }

  // ── Success state ──────────────────────────────────────────
  if (postedId) {
    return (
      <>
        <PageHeader title="Shot posted" />
        <div className="flex flex-col items-center justify-center gap-6 px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/20">
            <Send size={36} className="text-accent" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold">Shot posted!</h2>
            <p className="mt-1 text-sm text-muted">Your reel is live in the Shots feed.</p>
          </div>
          <button
            type="button"
            onClick={copyLink}
            className="flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl border border-border bg-surface text-sm font-semibold transition-colors hover:bg-elevated"
          >
            {copied ? (
              <>
                <Check size={16} className="text-accent" /> Link copied!
              </>
            ) : (
              <>
                <Link2 size={16} /> Copy Shots link
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              router.push("/shots");
              router.refresh();
            }}
            className="flex h-12 w-full max-w-xs items-center justify-center rounded-xl bg-accent text-sm font-bold text-accent-ink"
          >
            Watch Shots
          </button>
        </div>
      </>
    );
  }

  const postButton = (className: string) => (
    <button
      type="button"
      onClick={handlePost}
      disabled={!file || pending}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40 ${className}`}
    >
      {pending ? (
        <>
          <Loader2 size={18} className="animate-spin" /> Posting…
        </>
      ) : (
        <>
          <Send size={17} /> Post Shot
        </>
      )}
    </button>
  );

  return (
    <>
      {/* One back arrow for the whole flow: on Preview it returns to the
          composer, on the composer it leaves the screen. */}
      <PageHeader
        title={STEPS[step].label}
        showBack
        onBack={step === 0 ? undefined : () => setStep(0)}
      />

      <div className="flex flex-col gap-4 px-4 pb-8 pt-2">
        {/* Position only — one arrow in the header is the entire back story,
            so these stay indicators rather than a second control. */}
        <nav aria-label="Shot steps" className="flex items-stretch gap-1.5 pt-1">
          {STEPS.map((s, i) => (
            <span
              key={s.label}
              aria-current={i === step ? "step" : undefined}
              className={`h-[3px] min-w-0 flex-1 rounded-full transition-colors ${
                i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-border"
              }`}
            />
          ))}
        </nav>

        {/* ═══ Page 1 · Compose ═══════════════════════════════════ */}
        {step === 0 && (
          <>
            <div
              className="relative flex min-h-[300px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface hover:border-accent/50"
              onClick={() => !preview && fileRef.current?.click()}
            >
              {preview ? (
                <>
                  <video
                    src={preview}
                    className="max-h-[60vh] w-full bg-black object-contain"
                    controls
                    playsInline
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile();
                    }}
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Video size={40} className="text-faint" />
                  <p className="text-sm text-muted">Tap to choose a video</p>
                  <p className="text-xs text-faint">MP4 · WebM · MOV · up to {MAX_SIZE_MB}MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={onFileChange} />
            {fileError && <p className="text-xs text-danger">{fileError}</p>}

            {/* Sits with the clip, before the caption: the cover is a property
                of the video, and choosing it while the video is the thing on
                screen is the moment it makes sense. */}
            {preview && (
              <ShotCoverPicker
                src={preview}
                value={coverTime}
                onChange={setCoverTime}
              />
            )}

            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 150))}
              rows={2}
              placeholder="Add a caption… (optional)"
              className="input resize-none"
            />
            <p className="-mt-2 text-right text-xs text-faint">{caption.length}/150</p>
          </>
        )}

        {/* ═══ Page 2 · Preview ═══════════════════════════════════
            Drawn the way the reel feed draws it: full-bleed 9:16, the caption
            over a bottom gradient, the author chip in the corner. The action
            rail is left out on purpose — nothing in it reflects a choice being
            made here, so showing it would only be decoration. */}
        {step === 1 && (
          <div className="relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl bg-black">
            {preview && (
              <video
                src={preview}
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
              />
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3.5">
              <div className="flex items-center gap-2.5">
                <Avatar
                  name={author.name}
                  hue={author.hue}
                  size={34}
                  src={author.avatarUrl ?? undefined}
                  className="ring-2 ring-white/70"
                />
                <span className="text-sm font-bold text-white drop-shadow">
                  {author.username ? `@${author.username}` : author.name}
                </span>
              </div>
              {caption.trim() && (
                <p className="line-clamp-2 text-sm text-white/90 drop-shadow">{caption.trim()}</p>
              )}
            </div>
          </div>
        )}

        {postError && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{postError}</p>}

        {/* ── Step navigation ─────────────────────────────────────
            Preview is a step; Post is the commit. They differ by fill, not
            only by wording — two accent buttons side by side would give
            navigating and publishing the same weight, which is the wrong
            signal on the one action that cannot be undone. */}
        {step === 0 ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!file}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface text-sm font-bold text-foreground transition-colors hover:border-white/25 disabled:opacity-40"
            >
              Preview <ChevronRight size={17} />
            </button>
            {postButton("flex-1")}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {/* Second way back, next to the thing you are deciding about — the
                header arrow is easy to miss when your attention is down here. */}
            <button
              type="button"
              onClick={() => setStep(0)}
              aria-label="Back to editing"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-white/25 hover:text-foreground"
            >
              <ChevronLeft size={18} />
            </button>
            {postButton("flex-1")}
          </div>
        )}
      </div>
    </>
  );
}
