"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Music, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { diaryTheme } from "@/components/diary/DiaryPage";
import { toArchive, type ArchivedDiary } from "@/lib/diary";

const ENDED: Record<ArchivedDiary["endedHow"], string> = {
  expired: "Ran its 24 hours",
  replaced: "Replaced by a newer one",
  taken_down: "You took it down",
};

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}

/**
 * Your past Diaries. Only you can open this — the archive table has no
 * policy that lets anyone else read a row — and it says so at the top,
 * because "where did my old Diary go, and who can see it" is the first thing
 * anyone wonders.
 */
export function DiaryArchiveSheet({
  open,
  onClose,
  hue,
}: {
  open: boolean;
  onClose: () => void;
  /** Your hue, for past pages in the default colour. */
  hue: number;
}) {
  const [items, setItems] = useState<ArchivedDiary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    createClient()
      .rpc("get_diary_archive", { p_limit: 200 })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setFailed(true);
        else setItems(toArchive(data as never));
      });
    return () => {
      live = false;
    };
  }, [open]);

  async function forget(writtenAt: string) {
    setForgetting(writtenAt);
    const { error } = await createClient().rpc("forget_diary", { p_written_at: writtenAt });
    setForgetting(null);
    if (error) {
      setFailed(true);
      return;
    }
    setItems((prev) => (prev ?? []).filter((i) => i.writtenAt !== writtenAt));
  }


  return (
    <BottomSheet open={open} onClose={onClose} title="Past Diaries">
      <p className="flex items-center gap-1.5 px-1 pb-3 text-xs text-muted">
        <Lock size={12} /> Only you can see these.
      </p>

      {failed && (
        <p className="px-1 pb-3 text-xs font-semibold text-danger">
          Couldn&apos;t load your past Diaries. Close this and try again.
        </p>
      )}

      {items === null && !failed ? (
        <div className="flex justify-center py-10 text-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items && items.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted">
          Nothing here yet. When a Diary ends, it’s kept here for you.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 pb-4">
          {(items ?? []).map((d) => (
            <li
              key={d.writtenAt}
              className="relative overflow-hidden rounded-2xl p-3.5"
              style={{ background: diaryTheme(d.color, hue).background, boxShadow: diaryTheme(d.color, hue).shadow }}
            >
              <div className="flex items-center gap-2 text-[11px] text-white/55">
                <span className="font-semibold text-white/80">{when(d.writtenAt)}</span>
                <span>· {ENDED[d.endedHow]}</span>
                <button
                  type="button"
                  onClick={() => forget(d.writtenAt)}
                  disabled={forgetting === d.writtenAt}
                  aria-label="Delete this Diary for good"
                  className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-white/55 hover:bg-white/10 hover:text-danger disabled:opacity-50"
                >
                  {forgetting === d.writtenAt ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
              <p className="mt-1 break-words text-lg font-extrabold leading-snug tracking-[-0.02em] text-white">
                {d.text}
              </p>
              {d.track && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/65">
                  <Music size={11} /> {d.track.title}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
}
