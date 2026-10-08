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
  /** Deleting and reporting are drawn apart from the rest. */
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

/**
 * A held comment, lifted out of the thread.
 *
 * The thread blurs away behind it and the comment itself settles in the
 * middle of the screen with its actions beneath — so the thing being acted
 * on is in front of you, rather than a menu covering it. A comment held near
 * the bottom of the sheet used to open a menu that ran off the screen and
 * hid the comment it was about; nothing here depends on where the press was.
 *
 * Actions are icons with their words under them, three to a row. Which ones
 * there are is the caller's business — this only draws them, and marks the
 * dangerous ones.
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
      className="fixed inset-0 z-[220] flex items-center justify-center px-7"
    >
      {/* The thread is still there, just out of focus — which is what says
          this is about one comment rather than a new screen. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="animate-scrim-in absolute inset-0 bg-black/55 backdrop-blur-md"
      />

      <div className="animate-held-lift relative w-full max-w-[340px]">
        <div className="rounded-[20px] bg-elevated p-3.5 shadow-[0_18px_44px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-2">
            <Avatar
              name={name}
              hue={comment.profiles?.avatar_hue ?? 200}
              src={comment.profiles?.avatar_url ?? undefined}
              size={26}
            />
            <span className="min-w-0 truncate text-[13px] font-bold">{name}</span>
          </div>

          {comment.image_url && (
            // The picture itself, not a placeholder: a held comment that is
            // only a photo would otherwise lift as an empty card.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={comment.image_url}
              alt=""
              className="mt-2.5 max-h-[38vh] w-full rounded-[14px] object-cover"
            />
          )}

          {body !== "" ? (
            <p className="mt-2 max-h-[30vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-snug text-foreground/90">
              {body}
            </p>
          ) : (
            !comment.image_url && (
              <p className="mt-2 flex items-center gap-1.5 text-sm italic text-faint">
                <ImageIcon size={14} /> A picture
              </p>
            )
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {actions.map((a, i) => (
            <button
              key={a.key}
              type="button"
              onClick={a.run}
              style={{ animationDelay: `${40 + i * 22}ms` }}
              className={`animate-held-tile flex h-[66px] flex-col items-center justify-center gap-1 rounded-[16px] bg-elevated text-[10.5px] font-bold transition-transform active:scale-[0.94] ${
                a.danger ? "text-danger" : "text-muted"
              }`}
            >
              <a.icon size={19} strokeWidth={2.1} />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
