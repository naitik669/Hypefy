"use client";

import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Plane } from "@/components/ui/Plane";
import { getThreadHint } from "@/lib/thread-hints";

const noop = () => () => {};

/**
 * The chat as it opens, before its messages arrive: the same full-screen
 * frame, the header with the name and picture you just tapped, and the
 * composer. No grey placeholder boxes, so the swap to the real chat changes
 * only the messages.
 */
export default function ThreadLoading() {
  const { threadId } = useParams<{ threadId: string }>();
  // The server has no hints; reading them as a store keeps hydration clean.
  const hint = useSyncExternalStore(noop, () => getThreadHint(threadId), () => null);

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background" data-thread-loading>
      <header className="flex h-[calc(3.5rem+var(--sat))] items-center gap-2 border-b border-border/60 chrome-bar px-2 pt-[var(--sat)]">
        <span className="flex h-10 w-10 items-center justify-center text-foreground">
          <ChevronLeft size={24} />
        </span>
        {hint ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {hint.isGroup ? (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[30%]"
                style={{ background: "linear-gradient(140deg, hsl(210 70% 52%), hsl(260 65% 42%))" }}
              >
                <Users size={18} className="text-white/95" />
              </span>
            ) : (
              <Avatar name={hint.name} hue={hint.hue} size={36} src={hint.avatarUrl ?? undefined} />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{hint.name}</p>
              {hint.isGroup && hint.memberCount ? (
                <p className="truncate text-xs text-muted">{hint.memberCount} members</p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}
      </header>

      <div className="flex flex-1 items-end justify-center pb-6">
        <span className="flex gap-1" aria-label="Loading messages">
          {[0, 0.15, 0.3].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-dot-bounce rounded-full bg-muted/60" style={{ animationDelay: `${d}s` }} />
          ))}
        </span>
      </div>

      <div className="border-t border-border/60 bg-background px-3 py-2 pb-[calc(var(--sab)+8px)]">
        <div className="flex items-center gap-1.5">
          <span className="h-11 w-10" />
          <div className="h-11 flex-1 rounded-2xl bg-surface px-4 text-sm leading-[44px] text-faint">Message…</div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted">
            <Plane size={18} weight="fill" />
          </span>
        </div>
      </div>
    </div>
  );
}
