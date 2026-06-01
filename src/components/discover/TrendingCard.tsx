import { Star } from "lucide-react";
import { formatCount } from "@/lib/mock";
import type { TrendingPost } from "@/lib/mock-discover";

/** A trending post tile for the "Blowing up" rail. */
export function TrendingCard({ post }: { post: TrendingPost }) {
  return (
    <div className="relative w-40 shrink-0 overflow-hidden rounded-card">
      <div
        className="aspect-[3/4] w-full"
        style={{
          background: `radial-gradient(120% 90% at 25% 15%, hsl(${post.from} 80% 55%), hsl(${post.to} 70% 22%))`,
        }}
      />
      <span className="absolute left-2 top-2 rounded-pill bg-black/50 px-2 py-0.5 text-[10px] font-bold text-accent backdrop-blur-sm">
        Blowing up
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2.5">
        <p className="truncate text-xs font-semibold text-white">{post.username}</p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-white/90">
          <Star size={11} className="text-hype" fill="currentColor" />
          {formatCount(post.hypes)}
        </p>
      </div>
    </div>
  );
}
