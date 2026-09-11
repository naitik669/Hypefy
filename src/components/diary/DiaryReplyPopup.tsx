"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Music, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Plane } from "@/components/ui/Plane";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useOverlayBackButton } from "@/lib/overlay-stack";
import { diaryTheme } from "@/components/diary/DiaryPage";
import type { DiaryEntry } from "@/lib/diary";
import type { ReplyStatus } from "@/components/diary/useDiaryActions";

/**
 * Replying to a page: the page, small and tilted, above a field to answer
 * it — so you can see what you are replying to while you type, with the
 * keyboard up and the card list out of view.
 *
 * Opened by the reply arrow on a card. The reply goes to your DMs with them
 * as an embed of the page; the popup closes once it has gone.
 */
export function DiaryReplyPopup({
  entry,
  open,
  onClose,
  reply,
  status,
  error,
}: {
  entry: DiaryEntry;
  open: boolean;
  onClose: () => void;
  reply: (text: string) => Promise<boolean>;
  status: ReplyStatus;
  error: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
  useEffect(() => setMounted(true), []);
  const trap = useFocusTrap<HTMLDivElement>(mounted && open);
  useOverlayBackButton(mounted && open, onClose);
  // Straight into the field. After the focus trap, which focuses its
  // container first — effects run in order, so this one wins.
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (mounted && open) field.current?.focus();
  }, [mounted, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;
  const theme = diaryTheme(entry.color, entry.hue);
  const first = entry.name.split(" ")[0];

  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex flex-col items-center justify-end bg-black/65 px-4 pb-[max(env(safe-area-inset-bottom),16px)] backdrop-blur-md sm:justify-center"
      onClick={onClose}
    >
      <div
        ref={trap}
        role="dialog"
        aria-modal="true"
        aria-label={`Reply to ${first}'s page`}
        onClick={(e) => e.stopPropagation()}
        className="animate-modal-pop flex w-full max-w-[420px] flex-col gap-4"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center self-end rounded-full bg-white/10 text-white/80 hover:bg-white/15"
        >
          <X size={18} />
        </button>

        {/* What you are replying to. */}
        <div
          className="mx-6 -rotate-2 rounded-[24px] p-4 text-white"
          style={{ background: theme.background, boxShadow: theme.shadow }}
        >
          <div className="flex items-center gap-2">
            <Avatar name={entry.name} hue={entry.hue} size={26} src={entry.avatarUrl ?? undefined} />
            <span className="truncate text-sm font-bold">{entry.name}</span>
          </div>
          <p className="mt-2.5 break-words text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em]">{entry.text}</p>
          {entry.track && (
            <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-white/65">
              <Music size={11} /> {entry.track.title}
            </p>
          )}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (await reply(draft)) {
              setDraft("");
              onClose();
            }
          }}
          className="flex h-13 items-center gap-2 rounded-full bg-elevated pl-5 pr-1.5 shadow-[0_18px_40px_-16px_rgb(0_0_0/0.9)]"
        >
          <input
            ref={field}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Reply to ${first}…`}
            aria-label={`Reply to ${first}`}
            maxLength={500}
            enterKeyHint="send"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/40"
          />
          <button
            type="submit"
            disabled={!draft.trim() || status === "sending"}
            aria-label="Send reply"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity disabled:opacity-35"
          >
            {status === "sending" ? <Loader2 size={16} className="animate-spin" /> : <Plane size={16} />}
          </button>
        </form>
        {status === "error" && error && <p className="-mt-2 text-center text-xs font-semibold text-danger">{error}</p>}
      </div>
    </div>,
    document.body
  );
}
