import Link from "next/link";
import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import type { Thread } from "@/lib/mock-messages";

export function MessageListItem({ thread }: { thread: Thread }) {
  return (
    <Link
      href={`/messages/${thread.id}`}
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] ${
        thread.unread > 0 ? "bg-accent/[0.04]" : ""
      }`}
    >
      <div className="relative shrink-0">
        <Avatar name={thread.name} hue={thread.hue} size={52} />
        {thread.online && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-accent ring-2 ring-background" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm font-semibold">{thread.name}</span>
          {thread.verified && (
            <VerifiedStar className="h-5 w-5 shrink-0 text-verified" />
          )}
          {thread.isRoom && (
            <span className="ml-1 flex shrink-0 items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
              <Users size={10} />
              Room
            </span>
          )}
        </div>
        <p
          className={`truncate text-sm ${
            thread.unread > 0 ? "font-medium text-foreground" : "text-muted"
          }`}
        >
          {thread.preview}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-faint">{thread.time}</span>
        {thread.unread > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">
            {thread.unread}
          </span>
        )}
      </div>
    </Link>
  );
}
