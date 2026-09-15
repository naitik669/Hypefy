import type { Tier } from "@/lib/cosmetics";

/**
 * Chat themes: how a conversation's background and text bubbles look.
 * The database sells them under the same ids (public.products, kind
 * chat_theme) and stores the choice on the conversation, so everyone in the
 * chat sees it.
 *
 * Only text bubbles are themed. Photos, videos, voice notes and shared posts
 * keep their own look — a pink tint over someone's photo is not a theme.
 */

export type BubbleStyle = {
  background: string;
  color: string;
  /** Time and ticks inside the bubble. */
  meta: string;
  border?: string;
};

export type ChatTheme = {
  id: string;
  label: string;
  tier: Tier;
  pricePaise?: number;
  /** The chat's scrolling background. */
  background: string;
  mine: BubbleStyle;
  theirs: BubbleStyle;
  /** Drawn on the last bubble of each run (see ChatThemeDecor). */
  decor?: "pond" | "sakura" | "galaxy" | "sunset" | "arcade" | "candy";
};

export const CHAT_THEMES: ChatTheme[] = [
  {
    id: "theme-midnight",
    label: "Midnight",
    tier: "free",
    background: "linear-gradient(180deg, #0b0d1f 0%, #0a0a12 100%)",
    mine: { background: "#5b5bd6", color: "#ffffff", meta: "rgba(255,255,255,0.6)" },
    theirs: { background: "#1c1e36", color: "#e6e7ff", meta: "rgba(230,231,255,0.45)" },
  },
  {
    id: "theme-lime",
    label: "Lime",
    tier: "free",
    background: "radial-gradient(120% 60% at 50% 0%, rgba(163,230,53,0.10), transparent 70%), #0a0a0a",
    mine: { background: "#a3e635", color: "#10170a", meta: "rgba(16,23,10,0.5)" },
    theirs: { background: "#1a2310", color: "#eaffcf", meta: "rgba(234,255,207,0.45)" },
  },
  {
    id: "theme-ocean",
    label: "Ocean",
    tier: "free",
    background: "linear-gradient(180deg, #04202b 0%, #061318 100%)",
    mine: { background: "#0f766e", color: "#ffffff", meta: "rgba(255,255,255,0.65)" },
    theirs: { background: "#0e3340", color: "#d6f7ff", meta: "rgba(214,247,255,0.45)" },
  },
  {
    id: "theme-pond",
    label: "Pond",
    tier: "premium",
    background:
      "radial-gradient(90% 50% at 50% 100%, rgba(125,211,252,0.18), transparent 70%), linear-gradient(180deg, #071a2a 0%, #0a2238 100%)",
    mine: { background: "#b9e6fb", color: "#0b2233", meta: "rgba(11,34,51,0.5)", border: "2px solid #7cc8ec" },
    theirs: { background: "#e6f6fe", color: "#0b2233", meta: "rgba(11,34,51,0.45)", border: "2px solid #a7dbf3" },
    decor: "pond",
  },
  {
    id: "theme-sakura",
    label: "Sakura",
    tier: "premium",
    background: "linear-gradient(180deg, #1f0d17 0%, #140a10 100%)",
    mine: { background: "#ffb7d5", color: "#3a0e24", meta: "rgba(58,14,36,0.5)" },
    theirs: { background: "#fff0f6", color: "#3a0e24", meta: "rgba(58,14,36,0.45)" },
    decor: "sakura",
  },
  {
    id: "theme-galaxy",
    label: "Galaxy",
    tier: "premium",
    background:
      "radial-gradient(1.5px 1.5px at 20% 30%, #fff8, transparent), radial-gradient(1px 1px at 70% 60%, #fff6, transparent), radial-gradient(1.5px 1.5px at 40% 80%, #fff5, transparent), radial-gradient(80% 60% at 80% 0%, rgba(168,85,247,0.3), transparent 70%), #07051a",
    mine: { background: "linear-gradient(135deg, #7c3aed, #db2777)", color: "#ffffff", meta: "rgba(255,255,255,0.65)" },
    theirs: { background: "#1d1640", color: "#efe9ff", meta: "rgba(239,233,255,0.5)" },
    decor: "galaxy",
  },
  {
    id: "theme-sunset",
    label: "Sunset",
    tier: "premium",
    background: "linear-gradient(180deg, #2a1024 0%, #1a0b12 60%, #120808 100%)",
    mine: { background: "linear-gradient(135deg, #c2410c, #be123c)", color: "#ffffff", meta: "rgba(255,255,255,0.7)" },
    theirs: { background: "#3a1a22", color: "#ffe4d6", meta: "rgba(255,228,214,0.5)" },
    decor: "sunset",
  },
  {
    id: "theme-arcade",
    label: "Arcade",
    tier: "shop",
    pricePaise: 7900,
    background:
      "repeating-linear-gradient(0deg, transparent 0 23px, rgba(34,211,238,0.07) 23px 24px), repeating-linear-gradient(90deg, transparent 0 23px, rgba(34,211,238,0.07) 23px 24px), #05060a",
    mine: { background: "#0b1a10", color: "#86efac", meta: "rgba(134,239,172,0.55)", border: "2px solid #22c55e" },
    theirs: { background: "#0a1420", color: "#a5f3fc", meta: "rgba(165,243,252,0.5)", border: "2px solid #22d3ee" },
    decor: "arcade",
  },
  {
    id: "theme-candy",
    label: "Candy",
    tier: "shop",
    pricePaise: 7900,
    background: "linear-gradient(180deg, #1c0f24 0%, #120a18 100%)",
    mine: { background: "repeating-linear-gradient(135deg, #ff9ad5 0 10px, #ffb8e0 10px 20px)", color: "#3b0a2a", meta: "rgba(59,10,42,0.55)" },
    theirs: { background: "repeating-linear-gradient(135deg, #b8f2e6 0 10px, #d3f8f0 10px 20px)", color: "#073b33", meta: "rgba(7,59,51,0.5)" },
    decor: "candy",
  },
];

export function findChatTheme(id: string | null | undefined): ChatTheme | null {
  return CHAT_THEMES.find((t) => t.id === id) ?? null;
}
