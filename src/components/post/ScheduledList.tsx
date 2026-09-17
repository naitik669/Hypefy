"use client";

import { useState } from "react";
import { CalendarClock, Trash2, ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/ToastProvider";
import { scheduleUndoable } from "@/lib/undoable";

export type ScheduledPost = {
  id: string;
  caption: string | null;
  body: string | null;
  image: string | null;
  scheduledAt: string;
};

function whenLabel(iso: string) {
  const d = new Date(iso);
  const now = Date.now();
  const mins = Math.round((d.getTime() - now) / 60000);
  const rel =
    mins <= 0 ? "publishing now" :
    mins < 60 ? `in ${mins}m` :
    mins < 1440 ? `in ${Math.round(mins / 60)}h` :
    `in ${Math.round(mins / 1440)}d`;
  return `${d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${rel}`;
}

/** The viewer's pending scheduled posts — cancel removes the row before it publishes. */
export function ScheduledList({ posts }: { posts: ScheduledPost[] }) {
  const supabase = createClient();
  const toast = useToast();
  const [list, setList] = useState(posts);

  /** Put a cancelled post back where it was: the list is soonest first. */
  function putBack(post: ScheduledPost) {
    setList((l) => [...l.filter((p) => p.id !== post.id), post].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
  }

  function cancel(id: string) {
    const post = list.find((p) => p.id === id);
    if (!post) return;
    setList((l) => l.filter((p) => p.id !== id));
    // Held for five seconds so Undo can stop it.
    const stop = scheduleUndoable(async () => {
      const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
      if (error) {
        putBack(post);
        toast("Couldn't cancel", "error");
      }
    });
    toast("Scheduled post cancelled", "plain", {
      label: "Undo",
      detail: post.caption || post.body || "Post",
      thumb: { src: post.image, name: post.caption || post.body || "Post" },
      onClick: () => {
        stop();
        putBack(post);
      },
    });
  }

  if (list.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Nothing scheduled"
        text="Schedule a post from the composer and it'll wait here until it's due."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-2 pb-10">
      {list.map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-elevated">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={18} className="text-faint" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.caption || p.body || "Post"}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">
              <CalendarClock size={12} className="text-accent" />
              {whenLabel(p.scheduledAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => cancel(p.id)}
            aria-label="Cancel scheduled post"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
