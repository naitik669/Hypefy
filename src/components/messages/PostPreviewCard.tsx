import { Star } from "lucide-react";
import { formatCount } from "@/lib/format";

/** A shared post rendered inside a chat bubble â€” links messaging to the feed. */
export function PostPreviewCard({
  post,
}: {
  post: { username: string; caption: string; hypes: number; from: number; to: number };
}) {
  return (
    <div className="w-56 overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className="aspect-[4/3] w-full"
        style={{
          background: `radial-gradient(120% 90% at 20% 10%, hsl(${post.from} 80% 55%), hsl(${post.to} 70% 22%))`,
        }}
      />
      <div className="p-3">
        <p className="text-xs font-semibold">{post.username}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{post.caption}</p>
        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-hype">
          <Star size={12} fill="currentColor" />
          {formatCount(post.hypes)}
        </div>
      </div>
    </div>
  );
}
