"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, X, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { extractHashtags, extractMentions } from "@/lib/content-utils";
import { RichPostText } from "@/components/ui/RichPostText";

const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function PostComposer({ userId }: { userId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [body, setBody] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hashtags = extractHashtags(caption + " " + body);
  const mentions = extractMentions(caption + " " + body);
  const canPost = caption.trim().length > 0 || body.trim().length > 0 || imageFile != null;

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError("Only JPEG, PNG, and WebP images are allowed.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setFileError(`Image must be under ${MAX_SIZE_MB}MB.`);
      return;
    }
    setImageFile(file);
    setPreview(URL.createObjectURL(file));
  }

  function removeImage() {
    setImageFile(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handlePost() {
    setPostError(null);
    startTransition(async () => {
      let imageUrl: string | null = null;

      // Upload image if present
      if (imageFile) {
        const ext = imageFile.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("post-images")
          .upload(path, imageFile, { contentType: imageFile.type, upsert: false });

        if (uploadErr) {
          setPostError("Image upload failed: " + uploadErr.message);
          return;
        }
        const { data: pub } = supabase.storage
          .from("post-images")
          .getPublicUrl(path);
        imageUrl = pub.publicUrl;
      }

      // Insert post
      const { error: insertErr } = await supabase.from("posts").insert({
        user_id: userId,
        caption: caption.trim() || null,
        body: body.trim() || null,
        image_url: imageUrl,
        hashtags,
        mentions,
      });

      if (insertErr) {
        setPostError(insertErr.message);
        return;
      }

      router.push("/home");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-8 pt-2">
      {/* Image upload area */}
      <div
        className="relative flex min-h-[180px] cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface transition-colors hover:border-accent/50"
        onClick={() => !preview && fileRef.current?.click()}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="h-full max-h-72 w-full object-cover" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeImage(); }}
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm"
              aria-label="Remove image"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <ImageIcon size={32} className="text-faint" />
            <p className="text-sm text-muted">Tap to add a photo</p>
            <p className="text-xs text-faint">JPEG, PNG, WebP · max 10MB</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept={ALLOWED_TYPES.join(",")} className="hidden" onChange={onFileChange} />
      {fileError && <p className="text-xs text-danger">{fileError}</p>}

      {/* Caption */}
      <div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="Write a caption…"
          className="input resize-none"
        />
        {/* Live rich preview */}
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

      {/* Helpers */}
      <p className="text-xs text-faint">Use # to add hashtags · @ to mention someone</p>

      {postError && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{postError}</p>
      )}

      {/* Post button */}
      <button
        type="button"
        onClick={handlePost}
        disabled={!canPost || pending}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-bold text-accent-ink shadow-[0_0_24px_2px_rgba(200,255,0,0.3)] transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? (
          <><Loader2 size={18} className="animate-spin" /> Posting…</>
        ) : (
          <><Send size={18} /> Post</>
        )}
      </button>
    </div>
  );
}
