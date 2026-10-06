"use client";

import { Video, X } from "lucide-react";
import { timeAgoShort } from "@/lib/time";
import { useObjectUrl } from "@/lib/object-url";
import type { CreationDraft } from "@/lib/creation-drafts";

/**
 * The small pieces of the creator that are not the camera: the note on a
 * control that is not built yet, the drafts you can pick back up, and the
 * question asked before work in progress is left behind.
 */

/**
 * What a control says when it is tapped and there is nothing behind it yet.
 *
 * Live and Effects are on the screen because they are coming, and a button
 * that silently does nothing reads as broken. This points at the button and
 * says so. `side` is where the note sits relative to the control it is on.
 */
export function ConstructionNote({ side }: { side: "above" | "left" }) {
  const place =
    side === "above"
      ? "bottom-full right-0 mb-2.5"
      : "right-full top-1/2 mr-2.5 -translate-y-1/2";
  const tail =
    side === "above"
      ? "right-6 top-full -mt-1.5"
      : "left-full top-1/2 -ml-1.5 -translate-y-1/2";
  return (
    <span
      role="status"
      className={`pointer-events-none absolute z-30 w-52 animate-rise rounded-2xl bg-white px-3.5 py-2.5 text-left shadow-xl ${place}`}
    >
      <span className="block text-[13px] font-extrabold text-black">🚧 In development</span>
      <span className="mt-0.5 block text-[11px] font-medium leading-snug text-black/65">
        Oops, you just tried to enter a construction area.
      </span>
      <span aria-hidden className={`absolute h-3 w-3 rotate-45 bg-white ${tail}`} />
    </span>
  );
}

/** One kept draft: tap to carry on with it, or throw it away. */
function DraftTile({
  draft,
  onResume,
  onDelete,
}: {
  draft: CreationDraft;
  onResume: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onResume}
        aria-label={`Continue draft from ${timeAgoShort(new Date(draft.savedAt))} ago`}
        className="relative block h-[92px] w-[58px] overflow-hidden rounded-xl border border-white/15 bg-white/[0.06] active:scale-95"
      >
        {draft.thumb ? (
          <DraftThumb blob={draft.thumb} />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            <Video size={18} className="text-white/50" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-1 pb-1 pt-3 text-center text-[9px] font-bold text-white">
          {timeAgoShort(new Date(draft.savedAt))}
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete draft"
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black text-white ring-1 ring-white/25 active:scale-90"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function DraftThumb({ blob }: { blob: Blob }) {
  // useObjectUrl only reads it as a blob; a File is one.
  const url = useObjectUrl(blob as File);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

/** The drafts kept on this device, under the place a new clip is chosen. */
export function DraftStrip({
  drafts,
  onResume,
  onDelete,
}: {
  drafts: CreationDraft[];
  onResume: (d: CreationDraft) => void;
  onDelete: (d: CreationDraft) => void;
}) {
  if (drafts.length === 0) return null;
  return (
    <div className="w-full max-w-[300px]" data-drafts>
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/45">
        Drafts · on this device
      </p>
      <div className="no-scrollbar flex gap-3 overflow-x-auto pb-1 pt-1.5">
        {drafts.map((d) => (
          <DraftTile key={d.id} draft={d} onResume={() => onResume(d)} onDelete={() => onDelete(d)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Asked before work in progress is left: keep it, lose it, or stay.
 *
 * Leaving used to drop the clip without a word, and a clip recorded in the
 * app cannot be chosen again from the gallery.
 */
export function LeaveSheet({
  what,
  resumed,
  saving,
  onSave,
  onDiscard,
  onStay,
}: {
  what: "Shot" | "Show";
  /** This was opened from a draft, so the draft is what would be lost. */
  resumed: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[260] flex items-end justify-center bg-black/60" onClick={onStay}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Leave this ${what}?`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] animate-rise rounded-t-3xl bg-elevated px-5 pb-[max(1.25rem,var(--sab))] pt-5"
      >
        <p className="text-center text-base font-extrabold text-foreground">Leave this {what}?</p>
        <p className="mx-auto mt-1 max-w-[30ch] text-center text-xs text-muted">
          Save it as a draft to finish later. Drafts stay on this device.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="h-12 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? "Saving…" : resumed ? "Save changes" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="h-12 rounded-2xl bg-danger/15 text-sm font-bold text-danger active:scale-[0.98] disabled:opacity-60"
          >
            {resumed ? "Delete draft" : "Discard"}
          </button>
          <button
            type="button"
            onClick={onStay}
            disabled={saving}
            className="h-12 rounded-2xl text-sm font-bold text-muted active:scale-[0.98]"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
