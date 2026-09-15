"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { CHAT_THEMES, type ChatTheme } from "@/lib/chat-themes";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { formatInr } from "@/lib/billing/plans";

/**
 * Pick a theme for this chat. Everyone in it sees the change, and a notice
 * says who made it. Themes you haven't unlocked show their price or
 * "Premium" and lead there instead.
 */
export function ChatThemePicker({
  open,
  onClose,
  conversationId,
  current,
  isPremium,
  owned,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  current: string | null;
  isPremium: boolean;
  owned: string[];
  onChanged: (id: string | null) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const unlocked = (t: ChatTheme) =>
    t.tier === "free" || (t.tier === "premium" ? isPremium : owned.includes(t.id));

  async function pick(id: string | null, theme?: ChatTheme) {
    if (busy || id === current) return;
    if (theme && !unlocked(theme)) {
      onClose();
      router.push(theme.tier === "premium" ? "/premium" : "/marketplace");
      return;
    }
    setBusy(id ?? "none");
    const { error } = await createClient().rpc("set_chat_theme", {
      p_conversation_id: conversationId,
      p_theme: id,
    });
    setBusy(null);
    if (error) {
      toast(error.message.includes("Not unlocked") ? "That theme isn't unlocked yet" : "Couldn't change the theme", "error");
      return;
    }
    onChanged(id);
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Chat theme">
      <p className="-mt-1 mb-3 text-xs text-muted">Everyone in this chat sees the theme you pick.</p>
      <div className="grid grid-cols-2 gap-3 pb-4">
        <button
          type="button"
          onClick={() => pick(null)}
          className={`relative flex h-32 flex-col justify-end overflow-hidden rounded-2xl border-2 bg-background p-2.5 text-left ${
            current === null ? "border-accent" : "border-border"
          }`}
        >
          <PreviewBubbles />
          <span className="mt-2 text-xs font-bold">Default</span>
          {current === null && <Selected />}
        </button>

        {CHAT_THEMES.map((t) => {
          const open = unlocked(t);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pick(t.id, t)}
              aria-pressed={current === t.id}
              className={`relative flex h-32 flex-col justify-end overflow-hidden rounded-2xl border-2 p-2.5 text-left transition active:scale-[0.98] ${
                current === t.id ? "border-accent" : "border-border"
              } ${busy === t.id ? "opacity-60" : ""}`}
              style={{ background: t.background }}
            >
              <PreviewBubbles theme={t} />
              <span className="mt-2 flex items-center justify-between text-xs font-bold text-white">
                {t.label}
                {!open && (
                  <span className="flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold">
                    <Lock size={9} />
                    {t.tier === "premium" ? "Premium" : t.pricePaise ? formatInr(t.pricePaise) : ""}
                  </span>
                )}
              </span>
              {current === t.id && <Selected />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

function Selected() {
  return (
    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
      <Check size={12} strokeWidth={3} />
    </span>
  );
}

/** Two tiny bubbles in the theme's colours. */
export function PreviewBubbles({ theme }: { theme?: ChatTheme }) {
  const theirs = theme ? theme.theirs : { background: "var(--color-surface)", color: "var(--color-foreground)", border: undefined };
  const mine = theme ? theme.mine : { background: "var(--color-accent)", color: "var(--color-accent-ink)", border: undefined };
  return (
    <span className="flex flex-col gap-3 pt-4">
      <span
        className="relative self-start rounded-xl rounded-bl-sm px-2.5 py-1 text-[10px] font-medium"
        style={{ background: theirs.background, color: theirs.color, border: theirs.border }}
      >
        hey!
      </span>
      <span
        className="relative self-end rounded-xl rounded-br-sm px-2.5 py-1 text-[10px] font-medium"
        style={{ background: mine.background, color: mine.color, border: mine.border }}
      >
        {theme?.decor && <ChatThemeDecor decor={theme.decor} mine />}
        see you at 8
      </span>
    </span>
  );
}
