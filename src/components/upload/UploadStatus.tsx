"use client";

import { X } from "lucide-react";
import { useUpload } from "@/components/upload/UploadProvider";
import { uploadLabel } from "@/lib/upload-progress";

/**
 * One place an upload is reported, whatever kind it is and wherever you are.
 *
 * There were two of these and they could not see each other.
 * UploadProgressBar was a strip at the top of the page, rendered only by
 * Home, and it bailed out of drawing anything for a Shot. ShotUploadCard was
 * a floating card above the navbar, rendered by the app layout, and it bailed
 * out for a post. So sharing a post and then walking to any other tab left
 * nothing on screen at all — the upload was still running, with no way to
 * watch it, cancel it, or find out it had failed. Coming back to Home was the
 * only way to learn that something had gone wrong.
 *
 * The card shape won because it is the one that was already rendered from the
 * layout, so it survives navigation. The bar's one real advantage — that it
 * pushed the feed down rather than covering it — is kept by sitting above the
 * navbar in the gap the navbar already owns.
 */
export function UploadStatus() {
  const { progress, active, failed, retryUpload, dismissFailed, cancelUpload } = useUpload();

  const kind = failed?.kind ?? active;
  if (!kind) return null;
  if (progress == null && !failed) return null;

  const showingFailure = progress == null && !!failed;

  return (
    /* --nav-h, not a second copy of 72: the bar's height and the things that
       sit above it were two numbers that disagreed by the gesture inset
       once already. */
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-h)+var(--sab))] z-[120] flex justify-center px-3"
      // Announced rather than silent. An upload that fails while somebody is
      // reading another tab is the exact case a screen reader user has no
      // other way to learn about.
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-2xl border border-border bg-elevated/95 px-4 py-3 shadow-lg backdrop-blur-xl">
        {showingFailure ? (
          <>
            {/* The reason, not a literal. This said "Couldn't share your
                post." whatever had happened, so the one surface that stays
                on screen was the one that never told you anything. */}
            <p className="min-w-0 flex-1 text-sm font-semibold">{failed!.message}</p>
            {failed!.canRetry && (
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
              <span className="block text-sm font-semibold">{uploadLabel(kind)}</span>
              <span
                className="mt-1.5 block h-1 w-full overflow-hidden rounded-pill bg-border/60"
                role="progressbar"
                aria-valuenow={Math.round(progress ?? 0)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={uploadLabel(kind)}
              >
                <span
                  className="block h-full rounded-pill bg-accent transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, progress ?? 0))}%` }}
                />
              </span>
            </span>
            <button
              type="button"
              onClick={cancelUpload}
              className="shrink-0 rounded-pill border border-border px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
