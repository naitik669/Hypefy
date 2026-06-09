"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, X, Send, Crop, Plus } from "lucide-react";
import { extractHashtags, extractMentions } from "@/lib/content-utils";
import { RichPostText } from "@/components/ui/RichPostText";
import { ImageCropper } from "@/components/post/ImageCropper";
import { useUpload } from "@/components/upload/UploadProvider";

const MAX_SIZE_MB = 10;
const MAX_IMAGES = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Img = { id: string; file: File; url: string; origSrc: string };

/** Supported aspect ratios for posts. value = width / height. */
const RATIOS = [
  { label: "1:1", value: 1,          cssRatio: "aspect-square" },
  { label: "3:4", value: 3 / 4,      cssRatio: "aspect-[3/4]" },
  { label: "4:3", value: 4 / 3,      cssRatio: "aspect-[4/3]" },
  { label: "16:9", value: 16 / 9,    cssRatio: "aspect-video" },
] as const;

export function PostComposer({ userId }: { userId: string }) {
  const router = useRouter();
  const { uploadPost } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<{ id: string; origSrc: string }[]>([]);

  const [imgs, setImgs] = useState<Img[]>([]);
  const [crop, setCrop] = useState<{ id: string; origSrc: string } | null>(null);
  const [ratioIdx, setRatioIdx] = useState(0); // index into RATIOS array
  const [caption, setCaption] = useState("");
  const [body, setBody] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const currentRatio = RATIOS[ratioIdx];

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
    const raw: { id: string; origSrc: string }[] = [];
    for (const f of files.slice(0, slots)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setFileError("Only JPEG, PNG, and WebP images are allowed.");
        continue;
      }
      if (f.size > MAX_SIZE_MB * 1024 * 1024) {
        setFileError(`Each image must be under ${MAX_SIZE_MB}MB.`);
        continue;
      }
      raw.push({ id: crypto.randomUUID(), origSrc: URL.createObjectURL(f) });
    }
    if (files.length > slots) setFileError(`You can add up to ${MAX_IMAGES} images.`);
    if (!raw.length) return;
    // Crop each selected image in sequence.
    queueRef.current = raw;
    advanceCrop();
  }

  function onCropDone(blob: Blob, url: string) {
    if (!crop) return;
    const next: Img = { id: crop.id, file: new File([blob], "post.jpg", { type: "image/jpeg" }), url, origSrc: crop.origSrc };
    setImgs((prev) => {
      const i = prev.findIndex((p) => p.id === crop.id);
      if (i >= 0) {
        URL.revokeObjectURL(prev[i].url);
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
    setCrop({ id: img.id, origSrc: img.origSrc });
  }

  function removeImg(id: string) {
    setImgs((prev) => {
      const item = prev.find((p) => p.id === id);
      if (item) {
        URL.revokeObjectURL(item.url);
        URL.revokeObjectURL(item.origSrc);
      }
      return prev.filter((p) => p.id !== id);
    });
  }

  function handlePost() {
    if (submitted || !canPost) return;
    setSubmitted(true);
    // Hand off to the global uploader so it keeps running after we navigate —
    // Home shows a progress bar + a "Post shared" toast when it finishes.
    uploadPost({
      userId,
      files: imgs.map((i) => i.file),
      caption: caption.trim() || null,
      body: body.trim() || null,
      hashtags,
      mentions,
    });
    router.push("/home");
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-2">
      {/* ── Aspect-ratio picker ───────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted">Ratio</span>
        <div className="flex gap-1.5">
          {RATIOS.map((r, i) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRatioIdx(i)}
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

      {/* ── Image area ────────────────────────────────────────── */}
      {imgs.length === 0 ? (
        <div
          className={`cursor-pointer ${currentRatio.cssRatio} w-full flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface text-center transition-colors hover:border-accent/50`}
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
              className={`relative shrink-0 overflow-hidden rounded-2xl bg-surface ${currentRatio.cssRatio}`}
              style={{ width: currentRatio.value >= 1 ? 200 : 140 }}
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
              className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border bg-surface text-faint transition-colors hover:border-accent/50 ${currentRatio.cssRatio}`}
              style={{ width: currentRatio.value >= 1 ? 200 : 140 }}
            >
              <Plus size={26} />
              <span className="text-xs">Add</span>
            </button>
          )}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={onFileChange}
      />
      {fileError && <p className="text-xs text-danger">{fileError}</p>}

      {crop && (
        <ImageCropper
          src={crop.origSrc}
          aspect={currentRatio.value}
          label={`Crop · ${currentRatio.label}`}
          onCancel={onCropCancel}
          onDone={onCropDone}
        />
      )}

      {/* Caption */}
      <div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Write a caption…"
          className="input resize-none"
        />
        {caption && (
          <div className="mt-1 rounded-xl border border-border/50 bg-elevated px-3 py-2 text-sm">
            <RichPostText text={caption} />
          </div>
        )}
        <p className="mt-0.5 text-right text-xs text-faint">{caption.length}/280</p>
      </div>

      {/* Body / opinion */}
      <div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="What do you want to say?"
          className="input resize-none"
        />
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
            <span key={t} className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
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

      {/* Post button */}
      <button
        type="button"
        onClick={handlePost}
        disabled={!canPost || submitted}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-ink transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        <Send size={18} /> {submitted ? "Sharing…" : "Post"}
      </button>
    </div>
  );
}
