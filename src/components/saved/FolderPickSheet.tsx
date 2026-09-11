"use client";

import { Plus } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FolderArt } from "@/components/saved/FolderArt";
import type { Folder } from "@/lib/folders";

/**
 * Choose one folder — where a selection goes. "New folder" hands back to the
 * caller, which makes one and files the selection straight into it.
 */
export function FolderPickSheet({
  open,
  onClose,
  title,
  folders,
  exclude,
  onPick,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  folders: Folder[];
  /** The folder you are moving out of, which is not somewhere to move to. */
  exclude?: string;
  onPick: (f: Folder) => void;
  onNew: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col pb-2">
        {folders
          .filter((f) => f.id !== exclude)
          .map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onPick(f)}
              className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors active:bg-white/5"
            >
              <FolderArt folder={f} variant="chip" className="w-12 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">
                  {f.emoji && <span className="mr-1.5">{f.emoji}</span>}
                  {f.name}
                </span>
                <span className="block text-xs tabular-nums text-muted">{f.itemCount}</span>
              </span>
            </button>
          ))}
        <button
          type="button"
          onClick={onNew}
          className="-mx-2 flex items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors active:bg-white/5"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-border text-muted">
            <Plus size={20} />
          </span>
          <span className="text-[15px] font-bold">New folder</span>
        </button>
      </div>
    </BottomSheet>
  );
}
