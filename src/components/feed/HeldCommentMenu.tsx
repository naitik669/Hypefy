"use client";

import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ImageIcon } from "lucide-react";

/** One thing you can do to a held comment. */
export type HeldAction = {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Deleting is drawn apart from the rest. */
  danger?: boolean;
  run: () => void;
};

/** Just enough of a comment to show it again, lifted. */
export type HeldComment = {
  body: string;
  image_url: string | null;
  profiles: {
    username: string | null;
    display_name: string | null;
    avatar_hue: number | null;
    avatar_url?: string | null;
  } | null;
};

/** The widest the lifted comment and its options go, as the post peek does. */
const MAX_W = "440px";

/**
 * A held comment, lifted out of the thread.
 *
 * Built like the peek a held post opens: the screen darkens, the thing you
 * held sits in the middle at the full width it can have, and the options are
 * bare — icon and word on the dark, with nothing drawn around them. An
 * earlier version boxed each option in its own tile, which left most of the
 * screen empty around a small grid and made six options read as a keypad.
 *
 * Down a column rather than across, because the options are words of
 * different lengths: in a row they either wrap raggedly or get cut to fit,
 * and a column lets each one say what it is.
 *
 * Nothing depends on where the press was. A comment held near the bottom of
 * the sheet used to open a menu that ran off the screen and covered the very
 * comment it was about.
 */
export function HeldCommentMenu({
  comment,
  actions,
  onClose,
}: {
  comment: HeldComment;
  actions: HeldAction[];
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const name = comment.profiles?.display_name || comment.profiles?.username || "Someone";
  const body = comment.body.trim();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comment options"
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
    >
      {/* The thread is still there, just out of focus — which is what says
          this is about one comment rather than a new screen. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-scrim-in absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      <div className="animate-held-lift relative flex w-full flex-col gap-4" style={{ maxWidth: MAX_W }}>
        <div className="rounded-[20px] bg-elevated p-4 shadow-[0_18px_44px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-2.5">
            <Avatar
              name={name}
              hue={comment.profiles?.avatar_hue ?? 200}
              src={comment.profiles?.avatar_url ?? undefined}
              size={30}
            />
            <span className="min-w-0 truncate text-sm font-bold">{name}</span>
          </div>

          {comment.image_url && (
            // The picture itself, not a placeholder: a held comment that is
            // only a photo would otherwise lift as an empty card.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.image_url}
              alt=""
              className="mt-3 max-h-[34vh] w-full rounded-[14px] object-cover"
            />
          )}

          {body !== "" ? (
            <p className="mt-2.5 max-h-[32vh] overflow-y-auto whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
              {body}
            </p>
          ) : (
            !comment.image_url && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[15px] italic text-faint">
                <ImageIcon size={15} /> A picture
              </p>
            )
          )}
        </div>

        <div className="flex flex-col">
          {actions.map((a, i) => (
            <button
              key={a.key}
              type="button"
              onClick={a.run}
              style={{ animationDelay: `${40 + i * 22}ms` }}
              className={`animate-held-tile flex items-center gap-4 rounded-2xl px-2 py-3 text-left text-[15px] font-semibold transition-transform active:scale-[0.98] ${
                a.danger ? "text-danger" : "text-white/90"
              }`}
            >
              <a.icon size={21} strokeWidth={2.1} className="shrink-0" />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
