"use client";

import { useState } from "react";
import { Star, Send } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { comments as initialComments, formatCount, type Comment } from "@/lib/mock";

export function CommentsSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [list, setList] = useState<Comment[]>(initialComments);
  const [text, setText] = useState("");

  function add() {
    const t = text.trim();
    if (!t) return;
    setList((l) => [
      {
        id: `local-${l.length}`,
        name: "you",
        handle: "@you",
        hue: 280,
        verified: false,
        text: t,
        hypes: 0,
        time: "now",
      },
      ...l,
    ]);
    setText("");
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`Comments · ${list.length}`}>
      <div className="flex flex-col gap-4 pb-3 pt-1">
        {list.map((c) => (
          <div key={c.id} className="flex gap-3">
            <Avatar name={c.name} hue={c.hue} size={36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold">{c.name}</span>
                {c.verified && <VerifiedStar className="h-3 w-3 text-verified" />}
                <span className="text-xs text-faint">· {c.time}</span>
              </div>
              <p className="text-sm text-foreground/90">{c.text}</p>
            </div>
            <button
              type="button"
              aria-label="Hype comment"
              className="flex flex-col items-center gap-0.5 text-faint"
            >
              <Star size={15} />
              <span className="text-[10px]">{formatCount(c.hypes)}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-border bg-elevated px-5 py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a comment…"
          className="h-10 flex-1 rounded-pill bg-surface px-4 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="button"
          onClick={add}
          aria-label="Send comment"
          disabled={!text.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink transition active:scale-90 disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>
    </BottomSheet>
  );
}
