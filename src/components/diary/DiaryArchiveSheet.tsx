"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, Music } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { diaryTheme, fillSize } from "@/components/diary/DiaryPage";
import { PastPageView } from "@/components/diary/PastPageView";
import { archivePeriods, toArchive, type ArchivedDiary } from "@/lib/diary";

const ENDED: Record<ArchivedDiary["endedHow"], string> = {
  expired: "",
  replaced: "Replaced",
  taken_down: "Taken down",
};

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
}

/** A page on the shelf, px. Three and a bit fit across a phone. */
const CARD = 132;
/** The covers on a closed pile. */
const COVER = 54;

/**
 * Your past pages, kept in piles.
 *
 * A pile per period — today, this week, this month, the month before, older —
 * closed, showing its top few pages fanned like covers. Open one and it lays
 * out sideways, each page as the page it was: its own colour, its photo, its
 * note at the size it was written. Pages are what you remember these by, not
 * rows of text, and a year of them has to fit somewhere.
 *
 * Only you can open this — the archive table has no policy that lets anyone
 * else read a row — and it says so at the top, because "where did my old page
 * go, and who can see it" is the first thing anyone wonders.
 */
export function DiaryArchiveSheet({
  open,
  onClose,
  hue,
  name = "You",
  avatarUrl = null,
}: {
  open: boolean;
  onClose: () => void;
  /** Your hue, for past pages in the default colour. */
  hue: number;
  /** You, for the header on an opened page. */
  name?: string;
  avatarUrl?: string | null;
}) {
  const [items, setItems] = useState<ArchivedDiary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);
  /** Which pile is open. The newest one starts open, since it is why you came. */
  const [opened, setOpened] = useState<string | null>(null);
  /** The page you tapped, shown full screen over the archive. */
  const [reading, setReading] = useState<ArchivedDiary | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    createClient()
      .rpc("get_diary_archive", { p_limit: 200 })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) setFailed(true);
        else {
          const archive = toArchive(data as never);
          setItems(archive);
          setOpened(archivePeriods(archive)[0]?.label ?? null);
        }
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
    // Deleted from the page you were reading: there is nothing left to read.
    setReading((r) => (r?.writtenAt === writtenAt ? null : r));
  }

  const piles = archivePeriods(items ?? []);

  return (
    <BottomSheet open={open} onClose={onClose} title="Past pages" size="tall">
      <p className="flex items-center gap-1.5 px-1 pb-3 text-xs text-muted">
        <Lock size={12} /> Only you
      </p>

      {failed && (
        <p className="px-1 pb-3 text-xs font-semibold text-danger">
          Couldn&apos;t load. Try again.
        </p>
      )}

      {items === null && !failed ? (
        <div className="flex justify-center py-10 text-muted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : items && items.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-muted">
          Pages you write end up here.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5 pb-4">
          {piles.map((pile) => {
            const isOpen = opened === pile.label;
            return (
              <section key={pile.label}>
                <button
                  type="button"
                  onClick={() => setOpened(isOpen ? null : pile.label)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 rounded-2xl bg-surface/60 p-2.5 text-left transition-colors active:bg-surface"
                >
                  <span className="relative shrink-0" style={{ width: COVER + 14, height: COVER * 1.25 }}>
                    {pile.items.slice(0, 3).map((d, i) => (
                      <span
                        key={d.writtenAt}
                        className="absolute left-0 top-0"
                        style={{
                          width: COVER,
                          transform: `translateX(${i * 7}px) rotate(${(i - 1) * 6}deg)`,
                          zIndex: 3 - i,
                        }}
                      >
                        <MiniPage page={d} hue={hue} width={COVER} cover />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-extrabold tracking-[-0.01em]">{pile.label}</span>
                    <span className="block text-[11px] text-muted">
                      {pile.items.length} page{pile.items.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-faint">
                    {isOpen ? "Close" : "Open"}
                  </span>
                </button>

                {isOpen && (
                  <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 pt-2.5">
                    {pile.items.map((d) => (
                      <button
                        key={d.writtenAt}
                        type="button"
                        onClick={() => setReading(d)}
                        aria-label={`Open the page from ${when(d.writtenAt)}`}
                        className="shrink-0 text-left"
                        style={{ width: CARD }}
                      >
                        <MiniPage page={d} hue={hue} width={CARD} />
                        <span className="flex items-center gap-1 px-0.5 pt-1.5 text-[10px] text-muted">
                          <span className="truncate font-semibold">{when(d.writtenAt)}</span>
                          {ENDED[d.endedHow] && <span className="truncate text-faint">· {ENDED[d.endedHow]}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <PastPageView
        page={reading}
        hue={hue}
        name={name}
        avatarUrl={avatarUrl}
        onClose={() => setReading(null)}
        onDelete={forget}
        deleting={forgetting === reading?.writtenAt}
      />
    </BottomSheet>
  );
}

/**
 * One past page, small: the page it was, shrunk. A cover is the same thing
 * without its words — on a pile you are reading the colours, not the notes,
 * and three lots of tiny text stacked at angles is a mess.
 */
function MiniPage({
  page,
  hue,
  width,
  cover = false,
}: {
  page: ArchivedDiary;
  hue: number;
  width: number;
  cover?: boolean;
}) {
  const theme = diaryTheme(page.color, hue);
  const text = page.text?.trim() ?? "";
  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{ aspectRatio: "4 / 5", background: theme.background, boxShadow: theme.shadow }}
    >
      {page.imageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={page.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        </>
      )}
      {!cover && text && (
        <div className="absolute inset-0 flex items-center justify-center p-2.5">
          <p
            className="line-clamp-5 break-words text-center font-extrabold leading-tight tracking-[-0.02em] text-white"
            style={{ fontSize: Math.max(10, Math.round(fillSize(text, width - 20) * 0.62)) }}
          >
            {text}
          </p>
        </div>
      )}
      {!cover && page.track && (
        <span className="absolute bottom-1.5 left-2 text-white/70" aria-hidden>
          <Music size={10} />
        </span>
      )}
    </div>
  );
}
