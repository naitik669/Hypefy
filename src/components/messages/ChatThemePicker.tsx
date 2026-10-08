"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { CHAT_THEMES, bubbleCss, type ChatTheme } from "@/lib/chat-themes";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { blockedReason, unlocked as isUnlocked } from "@/lib/marketplace";
import { buyItem } from "@/lib/billing/checkout";
import { isNative } from "@/lib/native";
import { formatInr } from "@/lib/billing/plans";

/**
 * Pick a theme for this chat. Everyone in it sees the change, and a notice
 * says who made it. A theme you have not unlocked shows its price, or
 * "Premium", and is taken right here — a theme belongs to a chat, so it is
 * not in the Marketplace and there is nowhere else to send you for one.
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
    isUnlocked(t.tier, t.id, owned, isPremium);

  /**
   * Take a locked theme.
   *
   * A theme belongs to a chat, so it is not in the Marketplace and there is
   * nowhere else to send someone for one — it is taken here. Premium is the
   * exception: that is a subscription, and it is bought where subscriptions
   * are. Inside the app nothing can be bought at all (Play's rules), and
   * until payments are open the price is said rather than charged.
   */
  async function claim(theme: ChatTheme) {
    if (theme.tier === "premium") {
      onClose();
      router.push("/premium");
      return;
    }
    if (isNative()) {
      toast(blockedReason("app"), "plain");
      return;
    }
    setBusy(theme.id);
    const result = await buyItem(theme.id);
    setBusy(null);
    if (result.ok) {
      toast(`${theme.label} is yours`, "success");
      router.refresh();
      return;
    }
    if (result.reason === "not_configured") toast(blockedReason("soon"), "plain");
    else toast(result.message ?? "Something went wrong", "error");
  }

  async function pick(id: string | null, theme?: ChatTheme) {
    if (busy || id === current) return;
    if (theme && !unlocked(theme)) {
      await claim(theme);
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
        style={theme ? bubbleCss(theme.theirs).style : { background: theirs.background, color: theirs.color }}
      >
        hey!
      </span>
      <span
        className="relative self-end rounded-xl rounded-br-sm px-2.5 py-1 text-[10px] font-medium"
        style={theme ? bubbleCss(theme.mine).style : { background: mine.background, color: mine.color }}
      >
        {theme?.decor && <ChatThemeDecor decor={theme.decor} mine />}
        see you at 8
      </span>
    </span>
  );
}
