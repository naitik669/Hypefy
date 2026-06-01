import { Star, Play } from "lucide-react";
import { PostPreviewCard } from "@/components/messages/PostPreviewCard";
import type { ChatMessage } from "@/lib/mock-messages";

export function ChatBubble({ m }: { m: ChatMessage }) {
  return (
    <div className={`flex w-full ${m.mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[78%] flex-col gap-1 ${
          m.mine ? "items-end" : "items-start"
        }`}
      >
        {m.kind === "text" && (
          <div
            className={`rounded-2xl px-3.5 py-2 text-sm ${
              m.mine
                ? "rounded-br-md border border-accent/30 bg-elevated text-foreground"
                : "rounded-bl-md bg-surface text-foreground"
            }`}
          >
            {m.text}
          </div>
        )}

        {m.kind === "voice" && (
          <div
            className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${
              m.mine ? "rounded-br-md border border-accent/30 bg-elevated" : "rounded-bl-md bg-surface"
            }`}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink">
              <Play size={14} fill="currentColor" />
            </span>
            <span className="flex items-end gap-0.5">
              {[6, 12, 8, 16, 10, 14, 7, 11, 5].map((h, i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-muted"
                  style={{ height: h }}
                />
              ))}
            </span>
            <span className="text-xs text-muted">0:{String(m.seconds).padStart(2, "0")}</span>
          </div>
        )}

        {m.kind === "hype" && (
          <div className="flex items-center gap-1.5 rounded-pill border border-hype/30 bg-hype/10 px-3 py-1.5 text-xs font-semibold text-hype">
            <Star size={14} fill="currentColor" />
            Hyped the post
          </div>
        )}

        {m.kind === "post" && <PostPreviewCard post={m.post} />}

        <span className="px-1 text-[10px] text-faint">{m.time}</span>
      </div>
    </div>
  );
}
