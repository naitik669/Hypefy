"use client";

import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { PreviewBubbles } from "@/components/messages/ChatThemePicker";
import { bubbleCss, findChatTheme } from "@/lib/chat-themes";
import { findBubbleStyle } from "@/lib/bubble-styles";
import { findFont, findGlow, nameStyle } from "@/lib/cosmetics";
import { NameplateRow } from "@/components/ui/Nameplate";
import type { MarketItem } from "@/lib/marketplace";

export type Me = { name: string; avatarUrl: string | null; hue: number };

/**
 * The item, shown on you: frames on your own photo, fonts on your own name,
 * bubbles saying something. Fills its box; `large` is the sheet's version.
 */
export function MarketItemPreview({ item, me, large = false }: { item: MarketItem; me: Me; large?: boolean }) {
  switch (item.category) {
    case "frame": {
      const size = large ? 120 : 68;
      return (
        <Stage glow="radial-gradient(60% 60% at 50% 45%, rgba(255,255,255,0.07), transparent 70%)">
          <AvatarFrame id={item.id} size={size}>
            <Avatar name={me.name} hue={me.hue} size={size} src={me.avatarUrl ?? undefined} />
          </AvatarFrame>
        </Stage>
      );
    }
    case "bubble": {
      const b = findBubbleStyle(item.id);
      if (!b) return <Stage />;
      return (
        <Stage>
          <span className={`flex w-full flex-col ${large ? "gap-3 px-8 text-sm" : "gap-2 px-3 text-[11px]"}`}>
            <span className="self-start rounded-2xl rounded-bl-md bg-surface px-2.5 py-1 text-foreground/80">wyd</span>
            <span
              className={`relative mt-2 self-end rounded-2xl rounded-br-md px-2.5 py-1 font-medium ${bubbleCss(b.bubble).className}`}
              style={bubbleCss(b.bubble).style}
            >
              {b.decor && <ChatThemeDecor decor={b.decor} mine />}
              being iconic
            </span>
          </span>
        </Stage>
      );
    }
    case "theme": {
      const t = findChatTheme(item.id);
      if (!t) return <Stage />;
      return (
        <div
          className={`flex h-full w-full flex-col justify-center ${large ? "px-8" : "px-3"}`}
          style={{ background: t.background }}
        >
          <span className={large ? "origin-center scale-[1.35]" : undefined}>
            <PreviewBubbles theme={t} />
          </span>
        </div>
      );
    }
    case "name": {
      const font = findFont(item.id);
      const glow = findGlow(item.id);
      const style = nameStyle({ name_font: font?.id ?? null, name_glow: glow?.id ?? null, is_premium: true });
      const first = me.name.split(" ")[0] || "You";
      return (
        <Stage>
          <span className={`max-w-full truncate px-3 font-bold ${large ? "text-4xl" : "text-xl"}`} style={style}>
            {first}
          </span>
        </Stage>
      );
    }
    case "nameplate":
      return (
        <Stage>
          <span className={`flex w-full flex-col ${large ? "gap-2 px-6" : "gap-1 px-2"}`}>
            <span className="opacity-40"><NameplateRow id={null} name="···" avatarUrl={null} hue={0} small={!large} preview="" /></span>
            <NameplateRow id={item.id} name={me.name} avatarUrl={me.avatarUrl} hue={me.hue} small={!large} />
            <span className="opacity-40"><NameplateRow id={null} name="···" avatarUrl={null} hue={0} small={!large} preview="" /></span>
          </span>
        </Stage>
      );
  }
}

function Stage({ children, glow }: { children?: React.ReactNode; glow?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0f0f10]" style={glow ? { backgroundImage: glow } : undefined}>
      {children}
    </div>
  );
}
