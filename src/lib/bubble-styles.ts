import { canShow, type Tier } from "@/lib/cosmetics";
import type { BubbleStyle, ChatTheme } from "@/lib/chat-themes";

/**
 * Bubble styles: how one person's messages look, in every chat they're in.
 *
 * A chat theme belongs to the conversation; a bubble style belongs to the
 * sender. Where both apply, the sender's bubble wins for their own messages
 * and the theme keeps the background and everyone else's bubbles — so you
 * keep your look even in a friend's Pond chat.
 *
 * Sold by the database under the same ids (public.products, kind
 * bubble_style). Premium styles show while the sender has Premium.
 */

export type BubbleStyleDef = {
  id: string;
  label: string;
  tier: Tier;
  pricePaise?: number;
  bubble: BubbleStyle;
  decor?: ChatTheme["decor"];
};

export const BUBBLE_STYLES: BubbleStyleDef[] = [
  {
    id: "bubble-glass",
    label: "Glass",
    tier: "premium",
    bubble: { background: "#2b3140", color: "#f5f7ff", meta: "rgba(245,247,255,0.55)", border: "1px solid rgba(255,255,255,0.28)" },
  },
  {
    id: "bubble-neon",
    label: "Neon",
    tier: "premium",
    bubble: { background: "#0c1406", color: "#d9ff9e", meta: "rgba(217,255,158,0.55)", border: "2px solid #a3e635" },
  },
  {
    id: "bubble-sunset",
    label: "Sunset",
    tier: "premium",
    bubble: { background: "linear-gradient(135deg, #c2410c, #be123c)", color: "#ffffff", meta: "rgba(255,255,255,0.7)" },
    decor: "sunset",
  },
  {
    id: "bubble-pond",
    label: "Pond",
    tier: "premium",
    bubble: { background: "#b9e6fb", color: "#0b2233", meta: "rgba(11,34,51,0.5)", border: "2px solid #7cc8ec" },
    decor: "pond",
  },
  {
    id: "bubble-ink",
    label: "Ink",
    tier: "premium",
    bubble: { background: "#f4f1ea", color: "#1a1a1a", meta: "rgba(26,26,26,0.5)", border: "2px solid #1a1a1a" },
  },
  {
    id: "bubble-berry",
    label: "Berry",
    tier: "premium",
    bubble: { background: "linear-gradient(135deg, #7c3aed, #be185d)", color: "#ffffff", meta: "rgba(255,255,255,0.65)" },
    decor: "galaxy",
  },
  {
    id: "bubble-kawaii",
    label: "Kawaii",
    tier: "shop",
    pricePaise: 5900,
    bubble: { background: "repeating-linear-gradient(135deg, #ff9ad5 0 10px, #ffb8e0 10px 20px)", color: "#3b0a2a", meta: "rgba(59,10,42,0.55)" },
    decor: "candy",
  },
  {
    id: "bubble-pixel",
    label: "Pixel",
    tier: "shop",
    pricePaise: 5900,
    bubble: { background: "#0b1a10", color: "#86efac", meta: "rgba(134,239,172,0.55)", border: "2px solid #22c55e" },
    decor: "arcade",
  },
  {
    id: "bubble-gold",
    label: "Gold",
    tier: "shop",
    pricePaise: 5900,
    bubble: { background: "linear-gradient(135deg, #f5cf63, #c8911c)", color: "#2a1c03", meta: "rgba(42,28,3,0.55)", border: "1px solid #fff1a8" },
  },
];

export function findBubbleStyle(id: string | null | undefined): BubbleStyleDef | null {
  return BUBBLE_STYLES.find((b) => b.id === id) ?? null;
}

/** The bubble style someone may show right now, if any. */
export function visibleBubbleStyle(p: { bubble_style?: string | null; is_premium?: boolean | null }): string | null {
  const b = findBubbleStyle(p.bubble_style);
  return b && canShow(b.tier, !!p.is_premium) ? b.id : null;
}

/**
 * How one message's bubble looks: the sender's own style, else the chat
 * theme's side, else null for the app default.
 */
export function resolveBubble(opts: {
  mine: boolean;
  senderStyleId: string | null | undefined;
  theme: ChatTheme | null;
}): { bubble: BubbleStyle; decor?: ChatTheme["decor"] } | null {
  const own = findBubbleStyle(opts.senderStyleId);
  if (own) return { bubble: own.bubble, decor: own.decor };
  if (opts.theme) return { bubble: opts.mine ? opts.theme.mine : opts.theme.theirs, decor: opts.theme.decor };
  return null;
}
