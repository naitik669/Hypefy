"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FolderArt } from "@/components/saved/FolderArt";
import { cleanFolderName, FOLDER_COLORS, FOLDER_EMOJI, folderFill, type Folder } from "@/lib/folders";

export type FolderDraft = { name: string; emoji: string | null; color: string };

/**
 * Make a folder, or change one: its name, emoji and colour, with the tile
 * redrawn as you choose so you see what you are making.
 *
 * `onSubmit` resolves true when it worked, which closes the sheet; false
 * leaves it open with what was typed, for another go. Given `onDelete`, the
 * sheet also offers to delete the folder (the caller confirms).
 */
export function FolderEditor({
  open,
  onClose,
  title,
  submitLabel,
  initial,
  preview,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  submitLabel: string;
  initial: FolderDraft;
  /** The folder being edited, so the preview keeps its pictures. */
  preview?: Pick<Folder, "id" | "coverUrl" | "covers">;
  onSubmit: (draft: FolderDraft) => Promise<boolean>;
  onDelete?: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {/* Mounted only while open, so each opening starts from `initial`. */}
      {open && (
        <EditorForm
          initial={initial}
          preview={preview}
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          onDone={onClose}
          onDelete={onDelete}
        />
      )}
    </BottomSheet>
  );
}

function EditorForm({
  initial,
  preview,
  submitLabel,
  onSubmit,
  onDone,
  onDelete,
}: {
  initial: FolderDraft;
  preview?: Pick<Folder, "id" | "coverUrl" | "covers">;
  submitLabel: string;
  onSubmit: (draft: FolderDraft) => Promise<boolean>;
  onDone: () => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const clean = cleanFolderName(draft.name);

  async function submit() {
    if (!clean || busy) return;
    setBusy(true);
    const ok = await onSubmit({ ...draft, name: clean });
    setBusy(false);
    if (ok) onDone();
  }

  return (
    <form
      className="flex flex-col gap-5 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center gap-4">
        <FolderArt
          folder={{
            id: preview?.id ?? "new",
            emoji: draft.emoji,
            color: draft.color,
            coverUrl: preview?.coverUrl ?? null,
            covers: preview?.covers ?? [],
          }}
          variant="tile"
          className="w-20 shrink-0"
        />
        <input
          autoFocus={!preview}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 40) })}
          placeholder="Folder name"
          aria-label="Folder name"
          className="min-w-0 flex-1 border-b-2 border-border bg-transparent pb-1.5 text-lg font-extrabold outline-none transition-colors placeholder:font-bold placeholder:text-faint focus:border-accent"
        />
      </div>

      <fieldset>
        <legend className="sr-only">Colour</legend>
        <div className="flex flex-wrap gap-2.5">
          {FOLDER_COLORS.map((c) => {
            const on = draft.color === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setDraft({ ...draft, color: c.key })}
                aria-label={c.label}
                aria-pressed={on}
                className={`h-9 w-9 rounded-full transition-transform ${
                  on ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-elevated" : "active:scale-95"
                }`}
                style={{ background: folderFill(c.key).background }}
              />
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="sr-only">Emoji</legend>
        <div className="grid grid-cols-7 gap-1">
          <button
            type="button"
            onClick={() => setDraft({ ...draft, emoji: null })}
            aria-label="No emoji"
            aria-pressed={draft.emoji === null}
            className={`flex aspect-square items-center justify-center rounded-full text-xs font-bold text-muted transition-colors ${
              draft.emoji === null ? "bg-white/15 ring-2 ring-accent" : "hover:bg-white/5"
            }`}
          >
            None
          </button>
          {FOLDER_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setDraft({ ...draft, emoji: e })}
              aria-label={`Emoji ${e}`}
              aria-pressed={draft.emoji === e}
              className={`flex aspect-square items-center justify-center rounded-full text-xl transition-colors ${
                draft.emoji === e ? "bg-white/15 ring-2 ring-accent" : "hover:bg-white/5"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        disabled={!clean || busy}
        className="flex h-12 items-center justify-center rounded-pill bg-accent text-sm font-extrabold text-accent-ink transition-opacity active:scale-[0.99] disabled:opacity-40"
      >
        {busy ? <Loader2 size={18} className="animate-spin" /> : submitLabel}
      </button>

      {onDelete && (
        <button type="button" onClick={onDelete} className="-mt-2 h-10 text-sm font-bold text-danger">
          Delete folder
        </button>
      )}
    </form>
  );
}
