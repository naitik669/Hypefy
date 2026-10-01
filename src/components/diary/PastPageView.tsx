"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { shieldProps, useOverlayShield } from "@/lib/overlay-shield";
import { Check, Copy, Download, Loader2, Star, Trash2, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { DiscSleeve, SongLine, DISC_GUTTER } from "@/components/diary/DiaryDisc";
import { PagePhoto } from "@/components/diary/PagePhoto";
import { diaryTheme, fillSize, pageStops } from "@/components/diary/DiaryPage";
import { loadPhoto, renderPageImage, savePageImage } from "@/lib/page-image";
import type { ArchivedDiary } from "@/lib/diary";

/**
 * One past page, opened: the page as it was, and what you can do with it now.
 *
 * The page is drawn the way the spotlight draws a page — the same header, the
 * same words at the size they were written, the same record behind it — so
 * opening one from the archive shows you the thing you remember rather than a
 * summary of it. Under it, a sheet with when it went up, how it ended, who
 * could see it, and the handful of things left to do with a page nobody can
 * see any more.
 *
 * Full screen rather than another sheet on top of the archive: a page is the
 * subject here, and it needs the room. Put on the body rather than where it
 * is written: the archive sheet slides on a transform, and a transform makes
 * everything fixed inside it measure against the sheet instead of the screen
 * — this view came out short and spilled under its own footer.
 */

/** How wide a page is here. Narrower than the screen, so it reads as a card. */
const CARD_W = "clamp(232px, calc(min(100vw, 480px) - 96px), 300px)";

function dayAndTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ENDED: Record<ArchivedDiary["endedHow"], string> = {
  expired: "Ran its 24 hours",
  replaced: "Replaced by a newer page",
  taken_down: "Taken down",
};

export function PastPageView({
  page,
  hue,
  name,
  avatarUrl,
  onClose,
  onDelete,
  deleting = false,
}: {
  /** The page to open. Null closes the view. */
  page: ArchivedDiary | null;
  hue: number;
  name: string;
  avatarUrl: string | null;
  onClose: () => void;
  /** Delete it for good. The archive owns the row, so it does the deleting. */
  onDelete: (writtenAt: string) => void;
  deleting?: boolean;
}) {
  useOverlayShield(!!page, onClose);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Escape closes it, the way the sheets do.
  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, onClose]);

  // A page you opened, closed and opened again starts fresh — settled during
  // the render that changes it, so it is never briefly the last page's state.
  const [showing, setShowing] = useState(page?.writtenAt ?? null);
  if ((page?.writtenAt ?? null) !== showing) {
    setShowing(page?.writtenAt ?? null);
    setCopied(false);
    setConfirming(false);
    setSaved(false);
  }

  if (!page || typeof document === "undefined") return null;

  const theme = diaryTheme(page.color, hue);
  const text = page.text?.trim() ?? "";

  /** The page as a picture, with the wordmark at its foot. */
  async function save() {
    if (!page || saving) return;
    setSaving(true);
    try {
      const blob = await renderPageImage({
        text: page.text ?? "",
        stops: pageStops(page.color, hue),
        photo: page.imageUrl ? await loadPhoto(page.imageUrl) : null,
        track: page.track ? `${page.track.title}${page.track.artist ? ` — ${page.track.artist}` : ""}` : null,
        accent:
          getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#a3e635",
      });
      if (!blob) return;
      const day = new Date(page.writtenAt).toISOString().slice(0, 10);
      const how = await savePageImage(blob, `hypefy-page-${day}.png`);
      if (how !== "failed") {
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      }
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // No clipboard (an old WebView, or permission refused): say nothing
      // rather than claiming it copied.
    }
  }

  return createPortal(
    <div
      id="past-page"
      role="dialog"
      aria-modal
      aria-label={`Page from ${dayAndTime(page.writtenAt)}`}
      className="fixed inset-0 z-[210] mx-auto flex max-w-[480px] flex-col bg-background"
      {...shieldProps}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[calc(var(--sat)+10px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close this page"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-white/[0.07] hover:text-foreground"
        >
          <X size={20} />
        </button>
      </div>

      {/* The page, in the middle of what is left. m-auto, not items-center, so
          a page taller than the space starts at the top and scrolls instead of
          losing its head. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full px-4 py-2">
          <div
            className="m-auto"
            style={{ width: `calc(${CARD_W} + ${page.track ? DISC_GUTTER : 0}px)` }}
          >
            <DiscSleeve track={page.track}>
              <article
                className="relative overflow-hidden rounded-[28px] p-4"
                style={{ background: theme.background, boxShadow: theme.shadow }}
              >
                <header className="flex items-center gap-2">
                  <Avatar name={name} hue={hue} size={32} src={avatarUrl ?? undefined} />
                  <span className="text-sm font-bold text-white">You</span>
                  {page.audience === "close" && (
                    <Star size={12} className="fill-accent text-accent" aria-label="Close friends" />
                  )}
                </header>
                {page.imageUrl && (
                  // Against the window rather than a fixed 420px, so the whole
                  // page fits the screen it is opened on.
                  <PagePhoto url={page.imageUrl} className="mt-3" maxHeight="min(38dvh, 360px)" />
                )}
                {text && (
                  <p
                    className="mt-3 break-words font-extrabold leading-[1.08] tracking-[-0.02em] text-white"
                    style={{ fontSize: fillSize(text, page.imageUrl ? 150 : 250) }}
                  >
                    {text}
                  </p>
                )}
                {page.track && (
                  <div className="mt-2">
                    <SongLine track={page.track} />
                  </div>
                )}
              </article>
            </DiscSleeve>
          </div>
        </div>
      </div>

      <div className="shrink-0 rounded-t-[28px] bg-elevated px-4 pb-[calc(var(--sab)+14px)] pt-3">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/20" aria-hidden />
        <p className="text-[15px] font-extrabold">{dayAndTime(page.writtenAt)}</p>
        <p className="pb-3 text-[12px] text-muted">
          {ENDED[page.endedHow]} · {page.audience === "close" ? "Close friends" : "Your circle"}
        </p>

        <div className="flex gap-2 pb-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label="Save this page as a picture"
            className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-[11px] font-bold disabled:opacity-60"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : saved ? (
              <Check size={18} className="text-accent" />
            ) : (
              <Download size={18} />
            )}
            {saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!text}
            aria-label="Copy the words"
            className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-[11px] font-bold disabled:opacity-40"
          >
            {copied ? <Check size={18} className="text-accent" /> : <Copy size={18} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label="Delete this page for good"
            className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-surface py-3 text-[11px] font-bold text-danger"
          >
            <Trash2 size={18} />
            Delete
          </button>
        </div>

        {confirming && (
          <div className="flex items-center gap-2 rounded-2xl bg-surface p-2.5">
            <p className="min-w-0 flex-1 pl-1.5 text-[12px] text-muted">
              Gone for good — nobody can see this page now, including you.
            </p>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="h-9 shrink-0 rounded-xl px-3 text-[13px] font-bold text-muted"
            >
              Keep
            </button>
            <button
              type="button"
              onClick={() => onDelete(page.writtenAt)}
              disabled={deleting}
              aria-label="Yes, delete this page for good"
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-danger px-3 text-[13px] font-extrabold text-white disabled:opacity-60"
            >
              {deleting && <Loader2 size={13} className="animate-spin" />}
              Delete
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
