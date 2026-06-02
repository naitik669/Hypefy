"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Phone,
  MoreHorizontal,
  Camera,
  Image as ImageIcon,
  Mic,
  Send,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ChatBubble } from "@/components/messages/ChatBubble";
import type { Thread, ChatMessage } from "@/lib/mock-messages";

export function ChatView({
  thread,
  messages,
}: {
  thread: Thread;
  messages: ChatMessage[];
}) {
  const router = useRouter();
  const [list, setList] = useState<ChatMessage[]>(messages);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [list]);

  function send() {
    const t = text.trim();
    if (!t) return;
    setList((l) => [
      ...l,
      {
        id: `local-${l.length}`,
        kind: "text",
        mine: true,
        text: t,
        time: "now",
      },
    ]);
    setText("");
  }

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-[480px] flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 items-center gap-2 border-b border-border/60 bg-background/90 px-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="relative">
          <Avatar name={thread.name} hue={thread.hue} size={36} />
          {thread.online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-accent ring-2 ring-background" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="truncate text-sm font-semibold">{thread.name}</span>
            {thread.verified && (
              <VerifiedStar className="h-4.5 w-4.5 shrink-0 text-verified" />
            )}
          </div>
          <p className="text-xs text-muted">
            {thread.online ? "active now" : `active ${thread.time} ago`}
          </p>
        </div>
        <button
          type="button"
          aria-label="Call"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <Phone size={20} />
        </button>
        <button
          type="button"
          aria-label="More"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground hover:bg-white/5"
        >
          <MoreHorizontal size={20} />
        </button>
      </header>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {list.map((m) => (
          <ChatBubble key={m.id} m={m} />
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/60 bg-background px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Camera"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <Camera size={22} />
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-pill bg-surface px-3 py-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message..."
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            <button
              type="button"
              aria-label="Image"
              className="text-muted hover:text-foreground"
            >
              <ImageIcon size={20} />
            </button>
          </div>
          {text.trim() ? (
            <button
              type="button"
              onClick={send}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition-transform active:scale-90"
            >
              <Send size={18} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Voice message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <Mic size={22} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
