"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, X, Send, Crop, Plus, Music, FileText, BarChart2, Clock, CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { extractHashtags, extractMentions } from "@/lib/content-utils";
import { RichPostText } from "@/components/ui/RichPostText";
import { ImageCropper } from "@/components/post/ImageCropper";
import { useUpload } from "@/components/upload/UploadProvider";
import { useMentionHashtag, applySuggestion, SuggestionDropdown } from "@/components/ui/MentionHashtagPicker";
import { TrackPicker } from "@/components/music/TrackPicker";
import { TrackChip } from "@/components/music/TrackChip";
import { PostPreview, type PreviewAuthor } from "@/components/post/PostPreview";
import type { Track } from "@/lib/music";

const MAX_SIZE_MB = 10;
const MAX_IMAGES = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DRAFT_KEY = "hypefy_post_draft";

/** `origFile` is kept alongside the cropped `file` so switching to Auto can
 *  hand the untouched original back — a crop is destructive, and without the
 *  original there is no way to return to the photo's real shape. */
type Img = { id: string; file: File; url: string; origSrc: string; origFile: File };

/** Supported aspect ratios for posts. value = width / height;
 *  null means "whatever shape the photo already is". */
const RATIOS = [
  { label: "Auto", value: null,      cssRatio: null },
  { label: "1:1", value: 1,          cssRatio: "aspect-square" },
  { label: "3:4", value: 3 / 4,      cssRatio: "aspect-[3/4]" },
  { label: "4:3", value: 4 / 3,      cssRatio: "aspect-[4/3]" },
  { label: "16:9", value: 16 / 9,    cssRatio: "aspect-video" },
] as const;

/** Matches the CHECK constraint on posts.aspect_ratio (0035). A panorama or
 *  a very tall screenshot would otherwise be rejected by the insert, or
 *  wreck the feed layout if it were not. */
const MIN_AR = 0.4;
const MAX_AR = 3.0;
const clampAR = (n: number) => Math.min(MAX_AR, Math.max(MIN_AR, n));

/** Order and count of the panes. Labels are for assistive tech only — the
 *  visible indicator is bars, deliberately unlabelled. */
const STEPS = [
  { label: "Media" },
  { label: "Write" },
  { label: "Extras" },
] as const;

export function PostComposer({ userId, author }: { userId: string; author: PreviewAuthor }) {
  const router = useRouter();
  const { uploadPost } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<{ id: string; origSrc: string; file: File }[]>([]);

  const [imgs, setImgs] = useState<Img[]>([]);
  const [crop, setCrop] = useState<{ id: string; origSrc: string; file: File } | null>(null);
  const [ratioIdx, setRatioIdx] = useState(0); // index into RATIOS array; 0 = Auto
  /** Measured from the first photo when the shape is Auto. Every image in a
   *  post shares one frame in the feed, so the first one sets it — the same
   *  rule Instagram uses for multi-image posts. */
  const [autoRatio, setAutoRatio] = useState<number | null>(null);
  const [caption, setCaption] = useState("");
  const [body, setBody] = useState("");
  const captionRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [captionCursor, setCaptionCursor] = useState(0);
  const [bodyCursor, setBodyCursor] = useState(0);
  const [activeField, setActiveField] = useState<"caption" | "body" | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [trackPickerOpen, setTrackPickerOpen] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  // Poll: null = no poll; otherwise 2-4 option strings (blanks dropped on post).
  const [pollOptions, setPollOptions] = useState<string[] | null>(null);
  // Schedule: null = post now; otherwise a datetime-local string to publish at.
  const [scheduleAt, setScheduleAt] = useState<string | null>(null);
  const activeText = activeField === "caption" ? caption : activeField === "body" ? body : "";
  const activeCursor = activeField === "caption" ? captionCursor : bodyCursor;
  const { suggestions: pickerSuggestions, reset: resetPicker } = useMentionHashtag(activeText, activeCursor);

  // ── Draft persistence: text + song survive leaving the composer.
  // Images are deliberately excluded — File objects don't outlive the page.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { caption?: string; body?: string; track?: Track | null };
      if (!d.caption && !d.body && !d.track) return;
      setCaption((d.caption ?? "").slice(0, 280));
      setBody((d.body ?? "").slice(0, 1000));
      setTrack(d.track ?? null);
      setDraftRestored(true);
    } catch { /* corrupt draft — ignore */ }
  }, []);

  useEffect(() => {
    try {
      if (!caption.trim() && !body.trim() && !track) {
        localStorage.removeItem(DRAFT_KEY);
      } else {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ caption, body, track }));
      }
    } catch { /* storage full/unavailable — drafts are best-effort */ }
  }, [caption, body, track]);

  function discardDraft() {
    setCaption("");
    setBody("");
    setTrack(null);
    setDraftRestored(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }

  function applyPickerSelection(s: Parameters<typeof applySuggestion>[2]): void {
    if (activeField === "caption") {
      const { newValue, newCursor } = applySuggestion(caption, captionCursor, s);
      setCaption(newValue.slice(0, 280));
      setCaptionCursor(newCursor);
      setTimeout(() => captionRef.current?.setSelectionRange(newCursor, newCursor), 0);
    } else if (activeField === "body") {
      const { newValue, newCursor } = applySuggestion(body, bodyCursor, s);
      setBody(newValue.slice(0, 1000));
      setBodyCursor(newCursor);
      setTimeout(() => bodyRef.current?.setSelectionRange(newCursor, newCursor), 0);
    }
    resetPicker();
  }
  const [fileError, setFileError] = useState<string | null>(null);
  /** Which pane of the flow is showing. Post stays reachable from all of
   *  them — the steps sequence the work, they do not gate publishing. */
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const currentRatio = RATIOS[ratioIdx];
  const isAuto = currentRatio.value === null;
  /** The frame the composer previews in. Auto has no fixed Tailwind class —
   *  it drives `aspect-ratio` inline from the measured photo, falling back to
   *  square until the probe resolves (or before any photo is chosen). */
  const frameClass = currentRatio.cssRatio ?? "";
  const frameStyle: React.CSSProperties = isAuto ? { aspectRatio: String(autoRatio ?? 1) } : {};
  /** Effective ratio: what the frame shows, and what the post is stored with. */
  const postAspect = currentRatio.value ?? autoRatio ?? 1;
  const frameWidth = postAspect >= 1 ? 200 : 140;

  const hashtags = extractHashtags(caption + " " + body);
  const mentions = extractMentions(caption + " " + body);
  const canPost = caption.trim().length > 0 || body.trim().length > 0 || imgs.length > 0;

  function openPicker() {
    fileRef.current?.click();
  }

  function advanceCrop() {
    const next = queueRef.current.shift();
    setCrop(next ?? null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    setFileError(null);

    const slots = MAX_IMAGES - imgs.length;
    const raw: { id: string; origSrc: string; file: File }[] = [];
    for (const f of files.slice(0, slots)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setFileError("Only JPEG, PNG, and WebP images are allowed.");
        continue;
      }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        setFileError(`Each image must be under ${MAX_SIZE_MB}MB.`);
        continue;
      }
      raw.push({ id: crypto.randomUUID(), origSrc: URL.createObjectURL(f), file: f });
    }
    if (files.length > slots) setFileError(`You can add up to ${MAX_IMAGES} images.`);
    if (!raw.length) return;

    // Auto keeps the photo exactly as it is — no cropper, no re-encode. The
    // whole point of the mode is that nothing gets cut off.
    if (RATIOS[ratioIdx].value === null) {
      const added: Img[] = raw.map((r) => ({
        id: r.id, file: r.file, url: r.origSrc, origSrc: r.origSrc, origFile: r.file,
      }));
      setImgs((prev) => [...prev, ...added]);
      if (imgs.length === 0) measureAuto(added[0].origSrc);
      return;
    }

    // Crop each selected image in sequence.
    queueRef.current = raw;
    advanceCrop();
  }

  /** Read a photo's real shape so Auto has a ratio to store. */
  function measureAuto(src: string) {
    const probe = new window.Image();
    probe.onload = () => {
      if (probe.naturalHeight > 0) setAutoRatio(clampAR(probe.naturalWidth / probe.naturalHeight));
    };
    probe.src = src;
  }

  /** Changing the shape after photos are in has to rebuild them: a crop is
   *  destructive, so going to Auto restores each original, and going to a
   *  fixed frame re-runs the cropper over the originals rather than over
   *  already-cropped output. */
  function changeShape(nextIdx: number) {
    if (nextIdx === ratioIdx) return;
    setRatioIdx(nextIdx);
    if (!imgs.length) return;

    if (RATIOS[nextIdx].value === null) {
      setImgs((prev) => prev.map((p) => {
        if (p.url !== p.origSrc) URL.revokeObjectURL(p.url);
        return { ...p, file: p.origFile, url: p.origSrc };
      }));
      measureAuto(imgs[0].origSrc);
      return;
    }
    queueRef.current = imgs.map((p) => ({ id: p.id, origSrc: p.origSrc, file: p.origFile }));
    advanceCrop();
  }

  function onCropDone(blob: Blob, url: string) {
    if (!crop) return;
    const next: Img = {
      id: crop.id,
      file: new File([blob], "post.jpg", { type: "image/jpeg" }),
      url,
      origSrc: crop.origSrc,
      origFile: crop.file,
    };
    setImgs((prev) => {
      const i = prev.findIndex((p) => p.id === crop.id);
      if (i >= 0) {
        // Never revoke the original — Auto and every later re-crop read from it.
        if (prev[i].url !== prev[i].origSrc) URL.revokeObjectURL(prev[i].url);
        const copy = [...prev];
        copy[i] = next;
        return copy;
      }
      return [...prev, next];
    });
    advanceCrop();
  }

  function onCropCancel() {
    // Skip this one; if it was never committed, free its object URL.
    if (crop && !imgs.some((p) => p.id === crop.id)) URL.revokeObjectURL(crop.origSrc);
    advanceCrop();
  }

  function recrop(img: Img) {
    queueRef.current = [];
    setCrop({ id: img.id, origSrc: img.origSrc, file: img.origFile });
  }

  function removeImg(id: string) {
    setImgs((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) {
        URL.revokeObjectURL(item.url);
        URL.revokeObjectURL(item.origSrc);
      }
      const next = prev.filter((p) => p.id !== id);
      // The first photo sets the Auto ratio, so dropping it has to re-measure
      // — otherwise the post would be stored at the shape of a photo that is
      // no longer in it.
      if (isAuto && prev[0]?.id === id) {
        if (next[0]) measureAuto(next[0].origSrc);
        else setAutoRatio(null);
      }
      return next;
    });
  }

  // Blank options are dropped; a poll only ships with 2+ real choices.
  const cleanPollOptions = (pollOptions ?? []).map((o) => o.trim()).filter(Boolean);
  const cleanPoll = cleanPollOptions.length >= 2 ? { options: cleanPollOptions.slice(0, 4) } : null;

  // Only schedule when a future time is chosen; past/now falls back to posting now.
  const willSchedule = !!scheduleAt && new Date(scheduleAt).getTime() > Date.now() + 30_000;

  function handlePost() {
    if (submitted || !canPost) return;
    setSubmitted(true);
    // Hand off to the global uploader so it keeps running after we navigate —
    // Home shows a progress bar + a toast when it finishes.
    uploadPost({
      userId,
      files: imgs.map((i) => i.file),
      caption: caption.trim() || null,
      body: body.trim() || null,
      hashtags,
      mentions,
      track,
      poll: cleanPoll,
      // Only meaningful with photos; a text-only post has no frame to keep.
      aspectRatio: imgs.length ? postAspect : null,
      scheduledAt: willSchedule ? new Date(scheduleAt!).toISOString() : null,
    });
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    router.push(willSchedule ? "/create/scheduled" : "/home");
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-2">
      {/* ── Roadmap ─────────────────────────────────────────────
          Bars only. Naming the steps put a label on each pane that repeated
          what the pane already showed, and the labels had to be vague enough
          to cover everything inside them, so they said less than the content
          did. Position is the only thing the indicator needs to carry.

          Still buttons: nothing here is a prerequisite for anything else, so
          forcing Back/Next to reach a pane already on screen would be an
          artificial lock. The label lives in aria-label for screen readers,
          which do need it. */}
      <nav aria-label="Post steps" className="flex items-stretch gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            aria-label={s.label}
            aria-current={i === step ? "step" : undefined}
            className="min-w-0 flex-1 py-2"
          >
            <span
              className={`block h-[3px] w-full rounded-full transition-colors ${
                i === step ? "bg-accent" : i < step ? "bg-accent/40" : "bg-border"
              }`}
            />
          </button>
        ))}
      </nav>

      {/* Live preview — shown on every step, because the point of stepping
          through is knowing what the thing looks like at each point. */}
      <PostPreview
        author={author}
        imageUrls={imgs.map((i) => i.url)}
        aspect={postAspect}
        caption={caption}
        body={body}
        track={track}
        pollOptions={pollOptions}
      />

      {/* Draft restored notice */}
      {draftRestored && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <FileText size={14} className="shrink-0 text-accent" />
          <p className="min-w-0 flex-1 text-xs text-muted">Draft restored from last time.</p>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 text-xs font-semibold text-muted transition-colors hover:text-danger"
          >
            Discard
          </button>
        </div>
      )}

      {/* ═══ Step 1 · Media ═══════════════════════════════════ */}
      {step === 0 && (
      <>
      {/* ── Image area ────────────────────────────────────────── */}
      {imgs.length === 0 ? (
        <div
          className={`cursor-pointer ${frameClass} w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface text-center transition-colors hover:border-accent/50`}
          style={frameStyle}
          onClick={openPicker}
        >
          <ImageIcon size={32} className="text-faint" />
          <p className="text-sm text-muted">Tap to add photos</p>
          <p className="text-xs text-faint">Up to {MAX_IMAGES} · JPEG, PNG, WebP · max {MAX_SIZE_MB}MB each</p>
        </div>
      ) : (
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {imgs.map((img, i) => (
            <div
              key={img.id}
              className={`relative shrink-0 overflow-hidden rounded-2xl bg-surface ${frameClass}`}
              style={{ ...frameStyle, width: frameWidth }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={`Image ${i + 1}`} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => recrop(img)}
                aria-label="Re-crop"
                className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
              >
                <Crop size={13} />
              </button>
              <button
                type="button"
                onClick={() => removeImg(img.id)}
                aria-label="Remove image"
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
              >
                <X size={14} />
              </button>
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                {i + 1}/{imgs.length}
              </span>
            </div>
          ))}
          {imgs.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={openPicker}
              className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-surface text-faint transition-colors hover:border-accent/50 ${frameClass}`}
              style={{ ...frameStyle, width: frameWidth }}
            >
              <Plus size={26} />
              <span className="text-xs">Add</span>
            </button>
          )}
        </div>
      )}
      {/* ── Photo shape ─────────────────────────────────────────
          Only once there are photos to shape. Asking for a frame first meant
          choosing a crop for an image nobody had picked yet, and the control
          sat there dead on a text-only post.

          Photos therefore always arrive under Auto (uncropped), and choosing
          a fixed shape here re-crops them from the originals kept on each
          Img — so the decision is reversible, including back to Auto. */}
      {imgs.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-muted">Photo shape</span>
          <div className="flex gap-1.5">
            {RATIOS.map((r, i) => (
              <button
                key={r.label}
                type="button"
                onClick={() => changeShape(i)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  i === ratioIdx
                    ? "bg-accent text-accent-ink"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {fileError && <p className="text-xs text-danger">{fileError}</p>}
      </>
      )}

      {/* Mounted in every step, not inside one: the picker is opened
          programmatically, and a cropper unmounted mid-crop would drop the
          image being cropped. */}
      <input
        ref={fileRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={onFileChange}
      />

      {crop && (
        <ImageCropper
          src={crop.origSrc}
          aspect={currentRatio.value ?? 1}
          label={`Crop · ${currentRatio.label}`}
          onCancel={onCropCancel}
          onDone={onCropDone}
        />
      )}

      {/* ═══ Step 2 · Write ═══════════════════════════════════ */}
      {step === 1 && (
      <>
      {/* Caption — the line that sits beside your @name in the feed.
          Labelled explicitly: two boxes differing only by placeholder text
          gave no way to tell what either one was for, or why one allowed
          280 characters and the other 1000. */}
      <div className="relative">
        <label htmlFor="post-caption" className="mb-1.5 flex items-baseline gap-2">
          <span className="text-xs font-bold text-foreground">Caption</span>
          <span className="text-[11px] text-faint">Shows next to your name</span>
        </label>
        <textarea
          id="post-caption"
          ref={captionRef}
          value={caption}
          onChange={(e) => { setCaption(e.target.value.slice(0, 280)); setCaptionCursor(e.target.selectionStart ?? 0); setActiveField("caption"); }}
          onSelect={(e) => setCaptionCursor((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onFocus={() => setActiveField("caption")}
          onBlur={() => setTimeout(resetPicker, 150)}
          rows={2}
          placeholder="Write a caption…"
          className="input resize-none"
        />
        {activeField === "caption" && <SuggestionDropdown suggestions={pickerSuggestions} onSelect={applyPickerSelection} />}
        {caption && (
          <div className="mt-1 rounded-xl border border-border/50 bg-elevated px-3 py-2 text-sm">
            <RichPostText text={caption} />
          </div>
        )}
        <p className="mt-0.5 text-right text-xs text-faint">{caption.length}/280</p>
      </div>

      {/* Body — the paragraph under the caption. Marked optional because it
          is: a post is postable with only a photo, or only a caption. */}
      <div className="relative">
        <label htmlFor="post-body" className="mb-1.5 flex items-baseline gap-2">
          <span className="text-xs font-bold text-foreground">Say more</span>
          <span className="text-[11px] text-faint">Optional · appears below the caption</span>
        </label>
        <textarea
          id="post-body"
          ref={bodyRef}
          value={body}
          onChange={(e) => { setBody(e.target.value.slice(0, 1000)); setBodyCursor(e.target.selectionStart ?? 0); setActiveField("body"); }}
          onSelect={(e) => setBodyCursor((e.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onFocus={() => setActiveField("body")}
          onBlur={() => setTimeout(resetPicker, 150)}
          rows={3}
          placeholder="Add context, a story, your take…"
          className="input resize-none"
        />
        {activeField === "body" && <SuggestionDropdown suggestions={pickerSuggestions} onSelect={applyPickerSelection} />}
        {body && (
          <div className="mt-1 rounded-xl border border-border/50 bg-elevated px-3 py-2 text-sm">
            <RichPostText text={body} />
          </div>
        )}
        <p className="mt-0.5 text-right text-xs text-faint">{body.length}/1000</p>
      </div>

      {/* Parsed tags preview */}
      {(hashtags.length > 0 || mentions.length > 0) && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-surface px-3 py-2">
          {hashtags.map((t) => (
            <span key={t} className="rounded-full bg-hashtag/15 px-2 py-0.5 text-xs font-semibold text-hashtag">
              #{t}
            </span>
          ))}
          {mentions.map((m) => (
            <span key={m} className="rounded-full bg-verified/15 px-2 py-0.5 text-xs font-semibold text-verified">
              @{m}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-faint">Use # to add hashtags · @ to mention someone</p>
      </>
      )}

      {/* ═══ Step 3 · Extras ══════════════════════════════════ */}
      {step === 2 && (
      <>
      {/* Song + poll attachments */}
      <div className="flex flex-wrap items-center gap-2">
        {track ? (
          <TrackChip track={track} onRemove={() => setTrack(null)} />
        ) : (
          <button
            type="button"
            onClick={() => setTrackPickerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/25 hover:text-foreground"
          >
            <Music size={13} /> Add a song
          </button>
        )}
        {pollOptions === null && (
          <button
            type="button"
            onClick={() => setPollOptions(["", ""])}
            className="inline-flex items-center gap-1.5 rounded-pill border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/25 hover:text-foreground"
          >
            <BarChart2 size={13} /> Add a poll
          </button>
        )}
      </div>

      {/* Poll options editor */}
      {pollOptions !== null && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-faint">Poll</p>
            <button
              type="button"
              onClick={() => setPollOptions(null)}
              aria-label="Remove poll"
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt}
                onChange={(e) =>
                  setPollOptions((prev) => prev!.map((o, j) => (j === i ? e.target.value.slice(0, 60) : o)))
                }
                placeholder={`Option ${i + 1}`}
                className="input h-10 flex-1 text-sm"
              />
              {pollOptions.length > 2 && (
                <button
                  type="button"
                  onClick={() => setPollOptions((prev) => prev!.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 4 && (
            <button
              type="button"
              onClick={() => setPollOptions((prev) => [...prev!, ""])}
              className="self-start rounded-pill border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:text-foreground"
            >
              + Add option
            </button>
          )}
          <p className="text-[11px] text-faint">Your caption is the question. 2–4 options.</p>
        </div>
      )}
      <TrackPicker open={trackPickerOpen} onClose={() => setTrackPickerOpen(false)} onSelect={setTrack} />

      {/* Schedule */}
      <div className="flex items-center gap-2">
        {scheduleAt === null ? (
          <button
            type="button"
            onClick={() => {
              // Default to one hour out, rounded, in the input's local format.
              const d = new Date(Date.now() + 60 * 60 * 1000);
              d.setSeconds(0, 0);
              const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
              setScheduleAt(local);
            }}
            className="inline-flex items-center gap-1.5 rounded-pill border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-white/25 hover:text-foreground"
          >
            <Clock size={13} /> Schedule for later
          </button>
        ) : (
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <CalendarClock size={15} className="shrink-0 text-accent" />
            <input
              type="datetime-local"
              value={scheduleAt}
              min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
              onChange={(e) => setScheduleAt(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none [color-scheme:dark]"
            />
            <button
              type="button"
              onClick={() => setScheduleAt(null)}
              aria-label="Cancel schedule"
              className="shrink-0 text-muted hover:text-foreground"
            >
              <X size={15} />
            </button>
          </div>
        )}
        {/* "Scheduled" alone, sitting beside "Schedule for later", read as a
            status label or a second toggle rather than a link to the list. */}
        <Link href="/create/scheduled" className="ml-auto shrink-0 text-xs font-semibold text-muted hover:text-foreground">
          View scheduled
        </Link>
      </div>

      </>
      )}

      {/* ── Step navigation ─────────────────────────────────────
          Post sits alongside Back/Next rather than only on the last step: a
          photo with a caption is already a complete post, and making someone
          walk to step 3 to publish it would be ceremony, not guidance. */}
      <div className="flex items-center gap-2 pt-1">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep((v) => v - 1)}
            className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-border px-4 text-sm font-semibold text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeft size={16} /> Back
          </button>
        )}
        {step < STEPS.length - 1 && (
          <button
            type="button"
            onClick={() => setStep((v) => v + 1)}
            className="flex h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-border bg-surface text-sm font-bold text-foreground transition-colors hover:border-white/25"
          >
            Next <ChevronRight size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={handlePost}
          disabled={!canPost || submitted}
          className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-40 ${
            step === STEPS.length - 1 ? "flex-1" : "shrink-0"
          }`}
        >
          {willSchedule ? <CalendarClock size={17} /> : <Send size={17} />}
          {submitted ? (willSchedule ? "Scheduling…" : "Sharing…") : willSchedule ? "Schedule" : "Post"}
        </button>
      </div>
    </div>
  );
}
