"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, History, MessageCircle, Play, Repeat2, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";
import { ShotCover } from "@/components/profile/ProfileGrids";
import { setRehype } from "@/lib/rehype";
import { forgetOneView, forgetViews } from "@/lib/watched";
import { timeAgoShort } from "@/lib/time";
import type { ActivityComment, ActivityItem, ActivityTab } from "@/lib/your-activity";

const TABS: { id: ActivityTab; label: string; Icon: typeof Star }[] = [
  { id: "hypes", label: "Hypes", Icon: Star },
  { id: "comments", label: "Comments", Icon: MessageCircle },
  { id: "watched", label: "Watched", Icon: Eye },
  { id: "rehypes", label: "Rehypes", Icon: Repeat2 },
];

const EMPTY: Record<ActivityTab, { title: string; text: string }> = {
  hypes: { title: "Nothing hyped yet", text: "Hype a post or a Shot and it collects here, so you can find it again." },
  comments: { title: "Nothing said yet", text: "Comments you leave collect here, with a way back to where you left them." },
  watched: { title: "Nothing watched yet", text: "Posts and Shots you spend a moment on collect here. Only you can see this." },
  rehypes: { title: "Nothing rehyped yet", text: "Rehype something and it collects here." },
};

/** What the button on a tile does, in that tab's words. */
const UNDO: Record<Exclude<ActivityTab, "comments">, string> = {
  hypes: "Take the hype back",
  watched: "Forget this one",
  rehypes: "Undo the rehype",
};

/**
 * Everything you have done, in four lists, with the way to undo each one
 * where it is listed rather than back on the post.
 *
 * The tab is in the address, so the server loads one list and a link can
 * point straight at it.
 */
export function ActivityScreen({
  tab,
  items,
  comments,
  userId,
}: {
  tab: ActivityTab;
  items: ActivityItem[];
  comments: ActivityComment[];
  userId: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const showToast = useToast();
  /** Taken off this list here and now, so it goes without a reload. */
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const key = (i: { kind: string; id: string }) => `${i.kind}-${i.id}`;
  const shown = items.filter((i) => !gone.has(key(i)));
  const shownComments = comments.filter((c) => !gone.has(c.id));
  const nothing = tab === "comments" ? shownComments.length === 0 : shown.length === 0;

  function drop(id: string) {
    setGone((prev) => new Set(prev).add(id));
  }

  async function undo(item: ActivityItem) {
    setBusy(key(item));
    let ok = false;
    if (tab === "hypes") {
      const { error } = await supabase.rpc("toggle_hype", {
        p_target_type: item.kind,
        p_target_id: item.id,
        p_owner_id: undefined,
      });
      ok = !error;
    } else if (tab === "watched") {
      ok = await forgetOneView(supabase, item.kind, item.id);
    } else {
      const res = await setRehype(supabase as never, userId, item.kind, item.id, false);
      ok = res.ok;
    }
    setBusy(null);
    if (!ok) {
      showToast("Couldn't do that. Try again.");
      return;
    }
    drop(key(item));
  }

  async function removeComment(id: string) {
    setBusy(id);
    const { data, error } = await supabase
      .from("comments")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    setBusy(null);
    // An update matching no rows is not an error, so asking for the row back
    // is what makes "did anything change" answerable.
    if (error || !data?.length) {
      showToast("Couldn't delete that comment.");
      return;
    }
    drop(id);
    showToast("Comment deleted");
  }

  async function clearWatched() {
    setConfirmClear(false);
    setBusy("clear");
    const n = await forgetViews(supabase, "all");
    setBusy(null);
    if (n === null) {
      showToast("Couldn't clear your history. Try again.");
      return;
    }
    showToast(n === 0 ? "Nothing to clear" : "Watch history cleared");
    router.refresh();
  }

  return (
    <div className="flex flex-col pb-10">
      <div className="sticky top-14 z-10 chrome-bar border-b border-border/60 px-4 pb-2.5 pt-2">
        <div role="tablist" aria-label="Your interactions" className="flex gap-1 rounded-pill bg-surface p-1">
          {TABS.map(({ id, label, Icon }) => {
            const on = id === tab;
            return (
              <Link
                key={id}
                href={`/activity?tab=${id}`}
                role="tab"
                aria-selected={on}
                aria-label={label}
                data-activity-tab={id}
                prefetch={false}
                className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-pill px-1.5 py-2 text-xs font-bold transition-colors ${
                  on ? "bg-accent text-accent-ink" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon size={16} strokeWidth={2.2} aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {tab === "watched" && !nothing && (
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <p className="text-[11px] leading-snug text-muted">
            Clearing also lets these show in your feed again.
          </p>
          <button
            type="button"
            disabled={busy === "clear"}
            onClick={() => setConfirmClear(true)}
            className="shrink-0 rounded-pill border border-border px-3 py-1.5 text-[11px] font-bold text-muted transition-colors hover:text-foreground disabled:opacity-60"
          >
            Clear all
          </button>
        </div>
      )}

      {nothing ? (
        <div className="pt-10">
          <EmptyState
            icon={TABS.find((t) => t.id === tab)!.Icon}
            title={EMPTY[tab].title}
            text={EMPTY[tab].text}
            variant="compact"
          />
        </div>
      ) : tab === "comments" ? (
        <ul className="flex flex-col divide-y divide-border/50 pt-1" data-your-comments>
          {shownComments.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
              <Link href={c.href} prefetch={false} className="flex min-w-0 flex-1 items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted">
                  <MessageCircle size={15} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-snug">{c.body}</span>
                  <span className="mt-0.5 block text-xs text-faint">
                    On a {c.on} · {timeAgoShort(c.at)}
                  </span>
                </span>
              </Link>
              <button
                type="button"
                disabled={busy === c.id}
                onClick={() => void removeComment(c.id)}
                aria-label="Delete this comment"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-60"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-3 items-start gap-1.5 px-1.5 pt-2" data-activity-grid>
          {shown.map((item) => (
            <div key={key(item)} className="relative">
              <Link
                href={item.kind === "shot" ? `/shots/${item.id}` : `/p/${item.id}`}
                prefetch={false}
                aria-label={item.caption ?? (item.kind === "shot" ? "Shot" : "Post")}
                className="relative block aspect-[9/14] overflow-hidden rounded-xl bg-elevated"
              >
                {item.kind === "shot" ? (
                  <ShotCover poster={item.thumb} media={item.media_url ?? ""} />
                ) : item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center p-2 text-[11px] leading-snug text-muted">
                    <span className="line-clamp-6">{item.caption ?? "Post"}</span>
                  </span>
                )}
                {item.kind === "shot" && (
                  <Play size={13} className="absolute left-1.5 top-1.5 text-white drop-shadow" fill="currentColor" aria-hidden />
                )}
              </Link>
              <button
                type="button"
                disabled={busy === key(item)}
                onClick={() => void undo(item)}
                aria-label={UNDO[tab as Exclude<ActivityTab, "comments">]}
                title={UNDO[tab as Exclude<ActivityTab, "comments">]}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-60"
              >
                <X size={14} strokeWidth={2.6} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => void clearWatched()}
        icon={History}
        title="Clear your watch history?"
        body="Everything you have watched is forgotten, for you and for the people who posted it. The feed uses the same record to avoid repeating itself, so some of it will come round again."
        confirmLabel="Clear"
      />
    </div>
  );
}
