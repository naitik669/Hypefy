"use client";

import { useState } from "react";
import { Link2, Zap, Repeat2, Check } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { threads } from "@/lib/mock-messages";

export function ShareSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [sent, setSent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText("https://www.hypefy.chat/p/aman");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Share">
      {/* Send to */}
      <p className="pb-2 pt-1 text-xs font-semibold text-muted">Send to</p>
      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-4">
        {threads.slice(0, 6).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSent(sent === t.id ? null : t.id)}
            className="flex w-14 shrink-0 flex-col items-center gap-1.5"
          >
            <div
              className={`rounded-[18px] p-[2px] ${sent === t.id ? "bg-accent" : "bg-transparent"}`}
            >
              <Avatar name={t.name} hue={t.hue} size={52} className="rounded-[16px]" />
            </div>
            <span className="max-w-full truncate text-xs text-muted">{t.name}</span>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <button
          type="button"
          onClick={copyLink}
          className="flex items-center gap-3 rounded-xl px-2 py-3 text-sm font-medium transition-colors hover:bg-white/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
            {copied ? <Check size={18} className="text-accent" /> : <Link2 size={18} />}
          </span>
          {copied ? "Link copied" : "Copy link"}
        </button>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-2 py-3 text-sm font-medium transition-colors hover:bg-white/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
            <Zap size={18} className="text-hype" />
          </span>
          Share to your Shot
        </button>
        <button
          type="button"
          className="flex items-center gap-3 rounded-xl px-2 py-3 text-sm font-medium transition-colors hover:bg-white/5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface">
            <Repeat2 size={18} />
          </span>
          Repost
        </button>
      </div>
    </BottomSheet>
  );
}
