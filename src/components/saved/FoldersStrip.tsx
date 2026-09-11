"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { FolderArt } from "@/components/saved/FolderArt";
import { FolderEditor } from "@/components/saved/FolderEditor";
import { makeFolder, nextFolderColor, toFolder, type Folder } from "@/lib/folders";

/**
 * Your folders in a row, atop the profile's Saved tab — the same tiles as
 * the Saved screen, which the last one opens.
 */
export function FoldersStrip({ userId }: { userId: string }) {
  const supabase = createClient();
  const toast = useToast();
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => {
    let gone = false;
    void supabase.rpc("get_folders").then(({ data }) => {
      if (!gone) setFolders((data ?? []).map(toFolder));
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (folders === null) return null;

  return (
    <div className="px-4 pb-3">
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {folders.map((f) => (
          <Link key={f.id} href={`/collections/${f.id}`} className="w-24 shrink-0 text-left">
            <FolderArt folder={f} />
            <span className="mt-1.5 flex min-w-0 items-center gap-1 text-xs font-bold">
              {f.emoji && <span className="shrink-0">{f.emoji}</span>}
              <span className="truncate">{f.name}</span>
            </span>
            <span className="block text-[10px] tabular-nums text-muted">{f.itemCount}</span>
          </Link>
        ))}

        <button type="button" onClick={() => setMaking(true)} className="w-24 shrink-0 text-left">
          <span className="flex aspect-square items-center justify-center rounded-[22px] border-2 border-dashed border-border text-muted">
            <Plus size={22} />
          </span>
          <span className="mt-1.5 block text-xs font-bold text-muted">New folder</span>
        </button>

        <Link href="/saved" className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 self-start pt-6 text-muted">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface ring-1 ring-border">
            <ChevronRight size={18} />
          </span>
          <span className="text-[11px] font-bold">All</span>
        </Link>
      </div>

      <FolderEditor
        open={making}
        onClose={() => setMaking(false)}
        title="New folder"
        submitLabel="Make folder"
        initial={{ name: "", emoji: null, color: nextFolderColor(folders.length) }}
        onSubmit={async (draft) => {
          const made = await makeFolder(supabase, userId, draft, folders);
          if (!made) {
            toast("Couldn't make that folder", "error");
            return false;
          }
          setFolders([...folders, made]);
          return true;
        }}
      />
    </div>
  );
}
