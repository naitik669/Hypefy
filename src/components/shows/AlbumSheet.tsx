"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, Copy, Loader2, Play, Plus } from "lucide-react";
import { SendIcon } from "@/components/ui/ShareIcon";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { useObjectUrl } from "@/lib/object-url";
import { haptics } from "@/lib/haptics";
import { isVideoFile } from "@/lib/video-mime";
import { BLANK_POSTER } from "@/lib/blank-poster";
import type { Track } from "@/lib/music";
import type { ShowAudience } from "@/lib/show-audience";
import { ShowAudienceBar } from "@/components/shows/ShowAudienceBar";
import { publishFailureMessage, publishShow } from "@/lib/show-publish";
import {
  ALBUM_MAX,
  addPicks,
  selectedPicks,
  toggleSelected,
} from "@/lib/show-album";

let seq = 0;
const nextId = () => `pick-${Date.now()}-${seq++}`;

/** One picked photo or clip, drawn from its own blob URL. */
function Thumb({ file, className = "" }: { file: File; className?: string }) {
  const url = useObjectUrl(file);
  return isVideoFile(file) ? (
    <>
      <video poster={BLANK_POSTER} src={`${url}#t=0.1`} muted playsInline preload="metadata" className={`h-full w-full object-cover ${className}`} />
      <Play size={16} fill="currentColor" aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 text-white drop-shadow" />
    </>
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={`h-full w-full object-cover ${className}`} />
  );
}

/**
 * Several from the gallery, put up as Shows one after another.
 *
 * First the picks, numbered in the order they will play — tap to take one
 * out or put it back, or add more. Then one caption, who it is for, and
 * Share. Each goes up through publishShow, the same path as a single Show.
 */
export function AlbumSheet({
  userId,
  initialFiles,
  track,
  collabId,
  onCancel,
  onDone,
}: {
  userId: string;
  initialFiles: File[];
  track: Track | null;
  collabId?: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const toast = useToast();
  const moreRef = useRef<HTMLInputElement>(null);

  const [{ picks, order }, setAlbum] = useState(() => {
    const first = addPicks([], initialFiles, nextId);
    return { picks: first.picks, order: first.selected };
  });
  const [step, setStep] = useState<"pick" | "post">("pick");
  const [caption, setCaption] = useState("");
  const [audience, setAudience] = useState<ShowAudience>("everyone");
  const [hiddenFrom, setHiddenFrom] = useState<string[]>([]);
  /** Picks already up, so a retry carries on from where it stopped. */
  const [posted, setPosted] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  const chosen = selectedPicks(picks, order);
  const remaining = chosen.filter((p) => !posted.includes(p.id));

  function add(files: File[]) {
    const r = addPicks(picks, files, nextId);
    setAlbum({ picks: r.picks, order: [...order, ...r.selected].slice(0, ALBUM_MAX) });
    if (r.refused.length) toast(r.refused[0], "error");
    else if (r.overCap) toast(`An album holds ${ALBUM_MAX}. The rest were left out.`, "error");
  }

  async function share() {
    if (progress !== null || remaining.length === 0) return;
    const total = chosen.length;
    for (const [i, pick] of remaining.entries()) {
      setProgress(posted.length + i + 1);
      const isFirst = chosen[0]?.id === pick.id;
      const result = await publishShow(
        supabase,
        {
          userId,
          file: pick.file,
          // The words go on the first: the rest follow it in the reel.
          caption: isFirst ? caption : "",
          track: isFirst ? track : null,
          layers: [],
          audience,
          hiddenFrom,
          collabId,
        },
        i + 1,
      );
      if (!result.ok) {
        setProgress(null);
        const up = posted.length + i;
        toast(
          up > 0
            ? `${up} of ${total} went up. ${publishFailureMessage(result.reason)}`
            : publishFailureMessage(result.reason),
          "error",
        );
        return;
      }
      setPosted((prev) => [...prev, pick.id]);
    }
    setProgress(null);
    haptics.success();
    onDone();
  }

  const input = (
    <input
      ref={moreRef}
      type="file"
      accept="image/*,video/*"
      multiple
      className="hidden"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        if (files.length) add(files);
      }}
    />
  );

  if (step === "post") {
    const busy = progress !== null;
    return (
      <div className="fixed inset-0 z-[210] flex flex-col bg-background" data-album-post>
        <div className="flex items-center gap-2 px-4 pt-[max(1rem,var(--sat))]">
          <button
            type="button"
            onClick={() => setStep("pick")}
            disabled={busy || posted.length > 0}
            aria-label="Back to the picks"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-foreground active:scale-95 disabled:opacity-40"
          >
            <ChevronLeft size={22} />
          </button>
          <h2 className="text-[17px] font-extrabold">Album · {chosen.length} Shows</h2>
        </div>

        {/* As big as the screen allows, at the shape a Show is: this is the
            last look before they go up. */}
        <div className="no-scrollbar mt-4 flex min-h-0 flex-1 items-start gap-2.5 overflow-x-auto px-4 pb-4" aria-label="In the order they will play">
          {chosen.map((p, i) => (
            <span key={p.id} className="relative block aspect-[9/16] h-full max-h-[420px] shrink-0 overflow-hidden rounded-2xl bg-surface">
              <Thumb file={p.file} />
              <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[12px] font-extrabold text-accent-ink">
                {posted.includes(p.id) ? "✓" : i + 1}
              </span>
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-3 px-4 pb-[max(1rem,var(--sab))]">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">Caption · shown on the first one</span>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
              maxLength={280}
              disabled={posted.length > 0}
              placeholder="Say something… use #hashtags"
              className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-faint focus:border-white/30"
            />
          </label>
          <ShowAudienceBar
            userId={userId}
            audience={audience}
            onAudience={setAudience}
            hidden={hiddenFrom}
            onHidden={setHiddenFrom}
          />
          <button
            type="button"
            onClick={share}
            disabled={busy || remaining.length === 0}
            className="flex h-12 items-center justify-center gap-2 rounded-pill bg-accent text-[15px] font-extrabold text-accent-ink transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Sharing {progress} of {chosen.length}…
              </>
            ) : (
              <>
                {posted.length > 0 ? `Share the other ${remaining.length}` : `Share ${chosen.length} Shows`}
                <SendIcon size={15} weight="fill" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[210] flex flex-col bg-black/60" data-album-pick>
      <button type="button" aria-label="Close the album" onClick={onCancel} className="h-[120px] shrink-0" />
      <div className="flex min-h-0 flex-1 flex-col rounded-t-[26px] bg-surface">
        <span aria-hidden className="mx-auto mt-2 block h-1 w-10 rounded-full bg-border" />
        <div className="flex items-center justify-between px-4 pb-2.5 pt-3">
          <h2 className="text-[17px] font-extrabold">Album</h2>
          <span className="flex h-8 items-center gap-1.5 rounded-pill bg-accent px-3 text-xs font-extrabold text-accent-ink">
            <Copy size={14} aria-hidden />
            Pick up to {ALBUM_MAX}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 gap-[3px] px-[3px]">
            {picks.map((p) => {
              const n = order.indexOf(p.id);
              const on = n >= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${isVideoFile(p.file) ? "Video" : "Photo"}${on ? `, number ${n + 1}` : ", not in the album"}`}
                  onClick={() => {
                    haptics.select();
                    setAlbum((a) => ({ ...a, order: toggleSelected(a.order, p.id) }));
                  }}
                  className="relative aspect-square overflow-hidden bg-background"
                >
                  <Thumb file={p.file} className={on ? "" : "opacity-60"} />
                  {on ? (
                    <>
                      <span aria-hidden className="pointer-events-none absolute inset-0 border-[3px] border-accent" />
                      <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-accent-ink">
                        {n + 1}
                      </span>
                    </>
                  ) : (
                    <span aria-hidden className="absolute right-1.5 top-1.5 h-[22px] w-[22px] rounded-full border-2 border-white/85 bg-black/20" />
                  )}
                </button>
              );
            })}
            {picks.length < ALBUM_MAX && (
              <button
                type="button"
                onClick={() => moreRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1.5 bg-background text-muted transition-colors hover:text-foreground"
              >
                <Plus size={22} />
                <span className="text-xs font-semibold">Add more</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 pb-[max(1rem,var(--sab))] pt-3">
          <span className="text-sm font-bold">
            {order.length} selected
          </span>
          <button
            type="button"
            disabled={order.length === 0}
            onClick={() => setStep("post")}
            className="h-11 rounded-pill bg-accent px-6 text-[15px] font-extrabold text-accent-ink transition active:scale-95 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
      {input}
    </div>
  );
}
