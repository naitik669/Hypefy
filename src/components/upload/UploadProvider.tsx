"use client";

import { shrinkForUpload } from "@/lib/post-image";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hashImageFile } from "@/lib/media-hash-client";
import { useToast } from "@/components/ui/ToastProvider";
import type { Track } from "@/lib/music";
import { capturePoster } from "@/lib/video-poster";
import { trimToStore, type Trim } from "@/lib/shot-trim";
import { uploadContentType } from "@/lib/video-mime";
import { postImageUpload } from "@/lib/post-compose";
import {
  UploadCancelled,
  isCancelled,
  uploadFailureMessage,
  worthRetrying,
} from "@/lib/upload-error";
import { coverOf, imageUrlsOf, type PostSlot } from "@/lib/post-media";
import type { PostPick } from "@/lib/post-compose";

type PostUpload = {
  userId: string;
  files: PostPick[];
  caption: string | null;
  body: string | null;
  hashtags: string[];
  mentions: string[];
  track?: Track | null;
  poll?: { options: string[] } | null;
  /** width / height the post was composed at; null for text-only posts. The
   *  feed frames the gallery with it instead of forcing every post square. */
  aspectRatio?: number | null;
  /** ISO timestamp to publish later — routes the post to scheduled_posts. */
  scheduledAt?: string | null;
};

type ShotUpload = {
  userId: string;
  file: File;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  track?: Track | null;
  /** Which frame becomes the poster, in seconds. Null takes the default. */
  coverTime: number | null;
  /** The clip's length and the window that plays. */
  duration: number;
  trim: Trim;
};

/**
 * What failed, and enough of it to try again.
 *
 * Carries the message as well as the payload. The banner used to print
 * "Couldn't share your post." from a literal of its own, so the specific
 * reason only ever appeared in the toast — which is gone in three seconds,
 * while the banner is the thing that stays on screen.
 *
 * canRetry comes from worthRetrying: a file over the bucket ceiling or of
 * a type the bucket will not take cannot succeed on a second attempt, and
 * a Retry button there is a taunt rather than a control.
 */
type Failed = { message: string; canRetry: boolean } & (
  | { kind: "post"; post: PostUpload }
  | { kind: "shot"; shot: ShotUpload }
);

type Ctx = {
  progress: number | null;
  /** What is in flight, so each surface only shows its own kind. */
  active: "post" | "shot" | null;
  /** The last upload that failed — kept so the user can retry it. */
  failed: Failed | null;
  uploadPost: (a: PostUpload) => void;
  uploadShot: (a: ShotUpload) => void;
  retryUpload: () => void;
  dismissFailed: () => void;
  /** Stop the upload in progress. See UploadCancelled for what that means. */
  cancelUpload: () => void;
};
const UploadCtx = createContext<Ctx>({
  progress: null,
  active: null,
  failed: null,
  uploadPost: () => {},
  uploadShot: () => {},
  retryUpload: () => {},
  dismissFailed: () => {},
  cancelUpload: () => {},
});
export const useUpload = () => useContext(UploadCtx);

/**
 * Keep the perceptual hash of what was just posted, against the thing it was
 * posted to, so a takedown can block it being posted again (0157).
 *
 * Never allowed to fail the upload. The post is already live by the time
 * this runs; a fingerprint that does not write means a weaker blocklist
 * later, which is not worth showing anybody an error over.
 */
async function recordFingerprints(
  supabase: ReturnType<typeof createClient>,
  targetType: "post" | "shot",
  targetId: string,
  urls: string[],
  hashes: (string | null)[],
): Promise<void> {
  await Promise.all(
    urls.map(async (url, i) => {
      const hash = hashes[i];
      if (!hash) return;
      try {
        await supabase.rpc("claim_media", {
          p_target_type: targetType,
          p_target_id: targetId,
          p_url: url,
          p_hash: hash,
        });
      } catch {
        /* a weaker blocklist, not a failed post */
      }
    }),
  );
}

/**
 * Throw away objects an upload managed to store before it failed.
 *
 * A post with four photos that died on the fourth left three in the bucket
 * for ever: nothing referenced them, so nothing would ever clean them up,
 * and a retry wrote three more. publishShow has done this since it was
 * written — it removes the object when the insert fails — and the post and
 * Shot paths never did.
 *
 * Best effort by definition. This runs inside a catch, so it is already
 * handling a failure and must not produce another one; an orphan left
 * behind is a wasted megabyte, while a throw here would replace the real
 * error with a confusing one.
 */
async function discardUploaded(
  supabase: ReturnType<typeof createClient>,
  stored: { bucket: string; path: string }[],
): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const { bucket, path } of stored) {
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), path]);
  }
  await Promise.all(
    [...byBucket.entries()].map(async ([bucket, paths]) => {
      try {
        await supabase.storage.from(bucket).remove(paths);
      } catch {
        /* an orphan is a wasted megabyte; a throw here loses the real error */
      }
    }),
  );
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const [active, setActive] = useState<"post" | "shot" | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  /*
   * Set by the Cancel button, read between slots.
   *
   * A ref, not state: the upload loop is a closure that started before the
   * button was pressed, and a state value it captured would still be false
   * however many times the component re-rendered.
   */
  const cancelled = useRef(false);

  const cancelUpload = useCallback(() => {
    cancelled.current = true;
  }, []);

  /** Throw out of the upload if the person asked it to stop. */
  const bailIfCancelled = () => {
    if (cancelled.current) throw new UploadCancelled();
  };

  const stopTrickle = () => { if (trickle.current) { clearInterval(trickle.current); trickle.current = null; } };
  const startTrickle = () => {
    stopTrickle();
    // Storage uploads don't expose byte progress, so creep toward 90% so the
    // bar always feels alive; real milestones jump it forward.
    trickle.current = setInterval(() => {
      setProgress((p) => (p == null || p >= 90 ? p : p + Math.max(0.4, (92 - p) * 0.03)));
    }, 220);
  };

  const uploadPost = useCallback(async (a: PostUpload) => {
    setActive("post");
    setProgress(6);
    setFailed(null);
    cancelled.current = false;
    startTrickle();
    // What has actually landed in the bucket, so a failure part-way through
    // can take it back out again. Outside the try so the catch can see it.
    const stored: { bucket: string; path: string }[] = [];
    try {
      // Hashed before anything is uploaded, so a picture that has already
      // been taken down is refused in a second rather than after a minute on
      // a phone uplink. A file that will not decode hashes to null, which
      // means "we do not know" and must read as "let it through": refusing
      // an upload over a decoder quirk is a far worse outcome than a miss.
      //
      // Only the photos. A clip is fingerprinted by its poster, which does
      // not exist yet — it is captured in the loop below, and checked there.
      const hashes = await Promise.all(
        a.files.map((pick) => (pick.kind === "image" ? hashImageFile(pick.file) : null)),
      );
      for (const hash of hashes) {
        if (!hash) continue;
        const { data: blocked } = await supabase.rpc("check_media", { p_hash: hash });
        if (blocked) {
          stopTrickle();
          setProgress(null);
          // Deliberately not "this matches something we removed". Describing
          // the rule is how someone works out what to change.
          toast("That image can't be posted.", "error");
          return;
        }
      }

      // Slot by slot, in the order they were picked — the order is the
      // post, so [photo, clip, photo] has to survive the upload.
      const slots: PostSlot[] = [];
      for (let i = 0; i < a.files.length; i++) {
        // Between slots, not mid-file: the request in flight cannot be
        // aborted, so this is the first moment stopping is possible.
        bailIfCancelled();
        const pick = a.files[i];

        if (pick.kind === "video") {
          const localUrl = URL.createObjectURL(pick.file);
          let posterUrl: string | null = null;
          try {
            // The poster first, before the long upload, for the reason the
            // Shot path gives: a backgrounded WebView does not decode, and
            // putting the phone down during the upload is exactly what
            // people do.
            const poster = await capturePoster(localUrl, null);
            if (poster) {
              // Checked against the blocklist like any other image, since
              // the poster is a real frame and the thing people see.
              const ph = await hashImageFile(poster);
              if (ph) {
                const { data: blocked } = await supabase.rpc("check_media", { p_hash: ph });
                if (blocked) {
                  stopTrickle();
                  setProgress(null);
                  await discardUploaded(supabase, stored);
                  toast("That video can't be posted.", "error");
                  return;
                }
              }
              const pPath = `${a.userId}/${Date.now()}-${i}-poster.jpg`;
              const { error: pErr } = await supabase.storage
                .from("post-videos")
                .upload(pPath, poster, { contentType: "image/jpeg", upsert: false });
              if (!pErr) {
                stored.push({ bucket: "post-videos", path: pPath });
                posterUrl = supabase.storage.from("post-videos").getPublicUrl(pPath).data.publicUrl;
              }
            }

            const ext = pick.file.name.split(".").pop() || "mp4";
            const vPath = `${a.userId}/${Date.now()}-${i}.${ext}`;
            const { error: vErr } = await supabase.storage
              .from("post-videos")
              .upload(vPath, pick.file, {
                contentType: uploadContentType(pick.file, "video/mp4"),
                upsert: false,
              });
            if (vErr) throw vErr;
            stored.push({ bucket: "post-videos", path: vPath });
            slots.push({
              kind: "video",
              url: supabase.storage.from("post-videos").getPublicUrl(vPath).data.publicUrl,
              poster: posterUrl,
              duration: pick.duration,
            });
          } finally {
            URL.revokeObjectURL(localUrl);
          }
          setProgress(Math.min(85, 10 + ((i + 1) / a.files.length) * 72));
          continue;
        }

        // Named and served as what it is: a photo posted in Auto is sent
        // as picked, and may be a PNG or WebP rather than a JPEG.
        const kind = postImageUpload(pick.file);
        const path = `${a.userId}/${Date.now()}-${i}.${kind.ext}`;
        const { error } = await supabase.storage
          .from("post-images")
          // Shrunk first. Auto mode hands over whatever the camera made, which
          // is routinely 3-6MB; fitting it inside UPLOAD_MAX_EDGE keeps the
          // whole frame and makes the usual upload about a megabyte.
          .upload(path, await shrinkForUpload(pick.file), { contentType: kind.contentType, upsert: false });
        if (error) throw error;
        stored.push({ bucket: "post-images", path });
        slots.push({
          kind: "image",
          url: supabase.storage.from("post-images").getPublicUrl(path).data.publicUrl,
        });
        setProgress(Math.min(85, 10 + ((i + 1) / a.files.length) * 72));
      }

      // The photos, in order, for every reader that predates `media`.
      const urls = imageUrlsOf(slots);

      const record = {
        user_id: a.userId,
        caption: a.caption,
        body: a.body,
        // The cover, which for a video-first post is its poster. Not
        // simply urls[0]: a post that opens with a clip would otherwise
        // have no thumbnail anywhere a grid or a share card looks, and a
        // video-only post would be blank in all of them.
        image_url: coverOf(slots),
        // NOT NULL column with a [] default — sending null breaks text-only posts.
        // Photos only, so an old reader shows what it has always shown.
        image_urls: urls,
        // The truth about what this post carries, in order. Null for a
        // text-only post rather than an empty array: nothing to describe.
        media: slots.length ? slots : null,
        hashtags: a.hashtags,
        mentions: a.mentions,
        track: a.track ?? null,
        poll: a.poll ?? null,
        aspect_ratio: a.aspectRatio ?? null,
      };

      // Last chance: past this the post exists, and cancelling would mean
      // deleting something already published rather than never making it.
      bailIfCancelled();

      // Scheduled → its own table (a pg_cron job publishes it when due); the
      // feed queries never see it, so nothing else changes.
      if (a.scheduledAt) {
        const { error: insErr } = await supabase
          .from("scheduled_posts")
          .insert({ ...record, scheduled_at: a.scheduledAt });
        if (insErr) throw insErr;
        // No fingerprints for a scheduled post: it becomes a row in `posts`
        // with a different id when pg_cron publishes it, and there is nothing
        // to attach them to until then. The pre-check above still ran.
      } else {
        const { data: created, error: insErr } = await supabase
          .from("posts")
          .insert(record)
          .select("id")
          .single();
        if (insErr) throw insErr;
        // Recorded after the post exists, so a takedown can find them. Not
        // awaited as a group with the insert: a fingerprint that fails to
        // write is a weaker blocklist later, not a post that failed now.
        await recordFingerprints(supabase, "post", created.id, urls, hashes);
      }

      stopTrickle();
      setProgress(100);
      toast(a.scheduledAt ? "Post scheduled" : "Post shared", "success");
      router.refresh();
      setTimeout(() => setProgress(null), 700);
    } catch (err) {
      stopTrickle();
      setProgress(null);
      // Nothing references these: the row they were for was never written,
      // or was written and failed. Leaving them is a bucket that only grows.
      await discardUploaded(supabase, stored);
      // A cancelled upload is not a failed one. No banner, and nothing
      // offering to retry the thing somebody just stopped.
      if (isCancelled(err)) {
        toast("Upload cancelled", "success");
        return;
      }
      // Stash the payload (Files still valid) so the user can one-tap retry.
      setFailed({
        kind: "post",
        post: a,
        message: uploadFailureMessage(err, "post"),
        canRetry: worthRetrying(err),
      });
      toast(uploadFailureMessage(err, "post"), "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, toast]);

  /**
   * A Shot, uploaded after you have already left the composer.
   *
   * Publishing used to hold you on a spinner for the whole file — up to 50 MB
   * on a phone — with a failure that dropped the clip entirely. This returns
   * you to the feed at once and keeps the File, so a failure is a banner with
   * a Retry rather than lost work.
   */
  const uploadShot = useCallback(async (a: ShotUpload) => {
    setActive("shot");
    setProgress(6);
    setFailed(null);
    cancelled.current = false;
    startTrickle();
    // Its own object URL: the composer that made one has already unmounted
    // and revoked it by the time the poster is captured.
    const localUrl = URL.createObjectURL(a.file);
    const stored: { bucket: string; path: string }[] = [];
    try {
      // The poster comes FIRST, before the long upload. It is drawn by
      // decoding the clip in a hidden <video>, and a backgrounded WebView
      // does not decode: capturing afterwards meant that putting the phone
      // down during a 50 MB upload — which is exactly what people do — gave
      // a Shot with no thumbnail. Nothing is sent yet, so it costs only the
      // moment it takes.
      const poster = await capturePoster(localUrl, a.coverTime);

      /*
       * The blocklist check, which only the post path has ever run.
       *
       * check_media and claim_media (0157) take a perceptual hash of an
       * image, and recordFingerprints has accepted "post" | "shot" since it
       * was written — the Shot half was simply never called. So a picture
       * taken down for good reason could be posted again as a still, or as
       * the cover of a clip, and nothing looked.
       *
       * The poster is what gets hashed. It is a real frame of the video and
       * it is the image people actually see in a grid, so it is both the
       * honest thing to fingerprint and the thing a re-upload would reuse.
       * Hashing the whole clip is a different problem — video fingerprinting
       * is not frame hashing — and is not pretended at here.
       *
       * A clip with no poster is not blocked. A null hash means "we do not
       * know", and the post path already decided that reads as let it
       * through: refusing an upload over a decoder quirk is far worse than
       * a miss.
       */
      const posterHash = poster ? await hashImageFile(poster) : null;
      if (posterHash) {
        const { data: blocked } = await supabase.rpc("check_media", { p_hash: posterHash });
        if (blocked) {
          stopTrickle();
          setProgress(null);
          toast("That video can't be posted.", "error");
          return;
        }
      }

      bailIfCancelled();
      const ext = a.file.name.split(".").pop() || "webm";
      const path = `${a.userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("shot-media")
        .upload(path, a.file, { contentType: uploadContentType(a.file), upsert: false });
      if (upErr) throw upErr;
      stored.push({ bucket: "shot-media", path });
      setProgress(80);
      const mediaUrl = supabase.storage.from("shot-media").getPublicUrl(path).data.publicUrl;

      // Best effort: a Shot with no poster still plays, so a failure here
      // must not cost the upload that has already succeeded.
      let posterUrl: string | null = null;
      if (poster) {
        const posterPath = `${a.userId}/${Date.now()}-poster.jpg`;
        const { error: pErr } = await supabase.storage
          .from("shot-media")
          .upload(posterPath, poster, { contentType: "image/jpeg" });
        if (!pErr) {
          stored.push({ bucket: "shot-media", path: posterPath });
          posterUrl = supabase.storage.from("shot-media").getPublicUrl(posterPath).data.publicUrl;
        }
      }

      bailIfCancelled();
      const { data: createdShot, error: insErr } = await supabase.from("shots").insert({
        user_id: a.userId,
        media_url: mediaUrl,
        caption: a.caption,
        poster_url: posterUrl,
        track: a.track ?? null,
        hashtags: a.hashtags,
        mentions: a.mentions,
        duration_secs: a.duration > 0 ? Number(a.duration.toFixed(3)) : null,
        ...trimToStore(a.trim, a.duration),
      }).select("id").single();
      if (insErr) throw insErr;

      // Recorded against the Shot now it exists, so a later takedown can
      // find it — the same arrangement the post path has had since 0157.
      if (createdShot && posterUrl) {
        await recordFingerprints(supabase, "shot", createdShot.id, [posterUrl], [posterHash]);
      }

      stopTrickle();
      setProgress(100);
      toast("Shot posted", "success");
      router.refresh();
      setTimeout(() => setProgress(null), 700);
    } catch (err) {
      stopTrickle();
      setProgress(null);
      // A clip that uploaded and then failed to insert is 50MB nothing
      // points at. The Show path has always removed its object on failure;
      // this one never did.
      await discardUploaded(supabase, stored);
      if (isCancelled(err)) {
        toast("Upload cancelled", "success");
        return;
      }
      setFailed({
        kind: "shot",
        shot: a,
        message: uploadFailureMessage(err, "Shot"),
        canRetry: worthRetrying(err),
      });
      toast(uploadFailureMessage(err, "Shot"), "error");
    } finally {
      URL.revokeObjectURL(localUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router, toast]);

  const retryUpload = useCallback(() => {
    if (!failed) return;
    if (failed.kind === "post") uploadPost(failed.post);
    else uploadShot(failed.shot);
  }, [failed, uploadPost, uploadShot]);

  const dismissFailed = useCallback(() => setFailed(null), []);

  return (
    <UploadCtx.Provider
      value={{ progress, active, failed, uploadPost, uploadShot, retryUpload, dismissFailed, cancelUpload }}
    >
      {children}
    </UploadCtx.Provider>
  );
}

/**
 * Upload status — rendered on Home beneath the Shows row. Shows the thin
 * progress line while uploading, or a retry banner when the last upload failed.
 */
export function UploadProgressBar() {
  const { progress, active, failed, retryUpload, dismissFailed, cancelUpload } = useUpload();

  if (active === "shot" || failed?.kind === "shot") return null;

  if (progress == null && failed) {
    return (
      <div className="flex items-center gap-3 border-b border-border/60 bg-danger/10 px-4 py-2.5">
        {/* The reason, not a literal. This said "Couldn't share your post."
            whatever had happened, so the one surface that stays on screen
            was the one that never told you anything. */}
        <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{failed.message}</p>
        {failed.canRetry && (
          <button
            type="button"
            onClick={retryUpload}
            className="shrink-0 rounded-pill bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink transition-transform active:scale-95"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={dismissFailed}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  if (progress == null) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
      <div className="h-0.5 min-w-0 flex-1 bg-border/40">
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%`, boxShadow: "0 0 8px rgba(163,230,53,0.6)" }}
        />
      </div>
      <button
        type="button"
        onClick={cancelUpload}
        className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

/**
 * A Shot on its way up, from wherever you are.
 *
 * Posting a Shot lands you on /shots, where Home's inline bar is not
 * rendered — and the Shots feed is a fixed, full-screen surface with nothing
 * to slot a bar into. So this floats above the tab bar instead, and is the
 * only place a Shot upload reports itself. It is deliberately not the same
 * component as the post bar: the two live on different screens and neither
 * ever shows the other's kind.
 */
export function ShotUploadCard() {
  const { progress, active, failed, retryUpload, dismissFailed, cancelUpload } = useUpload();

  const isShotFailure = failed?.kind === "shot";
  if (!isShotFailure && active !== "shot") return null;
  if (progress == null && !isShotFailure) return null;

  return (
    /* --nav-h, not a second copy of 72. The bar's height and the things
       that sit above it were two numbers that disagreed by the gesture
       inset once already; this was the last hardcoded copy left. */
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--sab))] z-[120] flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl border border-border bg-elevated/95 px-4 py-3 shadow-lg backdrop-blur-xl">
        {isShotFailure ? (
          <>
            <p className="min-w-0 flex-1 text-sm font-semibold">{failed.message}</p>
            {failed.canRetry && (
              <button
                type="button"
                onClick={retryUpload}
                className="shrink-0 rounded-pill bg-accent px-3.5 py-1.5 text-xs font-bold text-accent-ink transition-transform active:scale-95"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={dismissFailed}
              aria-label="Dismiss"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Posting your Shot…</span>
              <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-pill bg-border/60">
                <span
                  className="block h-full rounded-pill bg-accent transition-[width] duration-300 ease-out"
                  style={{ width: `${progress ?? 0}%` }}
                />
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-muted">
              {Math.round(progress ?? 0)}%
            </span>
            {/* A Shot is the fifty-megabyte one. If cancelling belongs
                anywhere it belongs here. */}
            <button
              type="button"
              onClick={cancelUpload}
              className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
