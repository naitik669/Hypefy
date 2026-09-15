"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Check, Loader2, Sparkles, X } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { PreviewBubbles } from "@/components/messages/ChatThemePicker";
import { MarketItemPreview, type Me } from "@/components/billing/MarketItemPreview";
import {
  CATEGORIES,
  SORTS,
  buildItems,
  filterAndSort,
  isOwned,
  type Category,
  type MarketItem,
  type SortId,
} from "@/lib/marketplace";
import { findFont, findGlow, findPremiumBanner, nameStyle } from "@/lib/cosmetics";
import { findBubbleStyle } from "@/lib/bubble-styles";
import { bubbleCss, findChatTheme } from "@/lib/chat-themes";
import { formatInr } from "@/lib/billing/plans";
import { buyItem } from "@/lib/billing/checkout";
import { isNative } from "@/lib/native";

const noop = () => () => {};

/**
 * The Marketplace: a quiet gallery, and a try-on dock.
 *
 * The grid is only previews, names and one tag each. Tapping a tile doesn't
 * leave the page — the dock at the bottom shows the item on you with a
 * single action, so ten things can be tried in ten taps.
 *
 * Prices come from the catalogue checkout charges from. Inside the Android
 * app nothing can be bought (Play's rules), but everything can be tried.
 */
export function MarketplaceView({
  configured,
  isPremium,
  owned: initialOwned,
  prices,
  me,
}: {
  configured: boolean;
  isPremium: boolean;
  owned: string[];
  prices: Record<string, number>;
  me: Me;
}) {
  const router = useRouter();
  const toast = useToast();
  const native = useSyncExternalStore(noop, isNative, () => false);

  const [category, setCategory] = useState<Category | "all">("all");
  const [sort, setSort] = useState<SortId>("featured");
  const [sortOpen, setSortOpen] = useState(false);
  const [picked, setPicked] = useState<MarketItem | null>(null);
  const [owned, setOwned] = useState(initialOwned);
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => buildItems(prices), [prices]);
  const items = useMemo(() => filterAndSort(all, category, sort), [all, category, sort]);

  async function buy(item: MarketItem) {
    if (busy) return;
    if (!configured) {
      toast("Payments are coming soon", "plain");
      return;
    }
    setBusy(true);
    const result = await buyItem(item.id);
    setBusy(false);
    if (result.ok) {
      setOwned((o) => [...o, item.id]);
      toast(`${item.label} is yours`, "success");
      router.refresh();
    } else if (result.reason === "not_configured") {
      toast("Payments are coming soon", "plain");
    } else if (result.reason === "failed") {
      toast(result.message ?? "Something went wrong", "error");
    }
  }

  return (
    <div className={picked ? "pb-44" : "pb-16"}>
      {/* Filters */}
      <div className="sticky top-[calc(3.5rem+var(--sat))] z-10 flex items-center gap-2 chrome-bar py-2.5 pl-4 pr-2">
        <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto" data-hswipe="">
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                aria-pressed={on}
                className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors ${
                  on ? "bg-foreground text-background" : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setSortOpen(true)}
          aria-label={`Sort: ${SORTS.find((s) => s.id === sort)?.label}`}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${sort === "featured" ? "text-muted" : "bg-accent/15 text-accent"}`}
        >
          <ArrowUpDown size={16} />
        </button>
      </div>

      {/* Gallery */}
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-5 px-4">
        {items.map((item) => {
          const on = picked?.id === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setPicked(on ? null : item)}
                aria-pressed={on}
                className="group flex w-full flex-col gap-2 text-left"
              >
                <span
                  className={`block aspect-square overflow-hidden rounded-2xl border-2 transition group-active:scale-[0.97] ${
                    on ? "border-accent" : "border-transparent"
                  }`}
                >
                  <MarketItemPreview item={item} me={me} />
                </span>
                <span className="flex items-center justify-between gap-2 px-0.5">
                  <span className="truncate text-[13px] font-semibold">{item.label}</span>
                  <Tag item={item} owned={isOwned(item, owned, isPremium)} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-10 px-6 text-center text-[11px] text-faint">
        Buying means you agree to the{" "}
        <Link href="/terms#paid" className="underline hover:text-muted">
          paid features terms
        </Link>
        .
      </p>

      {/* Try-on dock */}
      {picked && (
        <Dock
          item={picked}
          me={me}
          owned={isOwned(picked, owned, isPremium)}
          native={native}
          busy={busy}
          onBuy={() => buy(picked)}
          onClose={() => setPicked(null)}
        />
      )}

      {/* Sort */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <ul className="-mx-2 pb-3">
          {SORTS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setSort(s.id);
                  setSortOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold hover:bg-white/[0.04]"
              >
                {s.label}
                {sort === s.id && <Check size={16} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  );
}

function Tag({ item, owned }: { item: MarketItem; owned: boolean }) {
  if (owned) {
    return (
      <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-bold text-accent">
        <Check size={12} strokeWidth={3} /> Yours
      </span>
    );
  }
  if (item.tier === "premium") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-verified">
        <Sparkles size={11} /> Premium
      </span>
    );
  }
  return <span className="shrink-0 text-[12px] font-bold tabular-nums">{item.pricePaise ? formatInr(item.pricePaise) : "Soon"}</span>;
}

/**
 * The picked item on you — framed photo, styled name, your bubble, a themed
 * chat or a banner behind you — with the one thing to do next.
 */
function Dock({
  item,
  me,
  owned,
  native,
  busy,
  onBuy,
  onClose,
}: {
  item: MarketItem;
  me: Me;
  owned: boolean;
  native: boolean;
  busy: boolean;
  onBuy: () => void;
  onClose: () => void;
}) {
  const first = me.name.split(" ")[0] || "You";
  const frame = item.category === "frame" ? item.id : null;
  const style =
    item.category === "name"
      ? nameStyle({ name_font: findFont(item.id)?.id ?? null, name_glow: findGlow(item.id)?.id ?? null, is_premium: true })
      : undefined;
  const bubble = item.category === "bubble" ? findBubbleStyle(item.id) : null;
  const theme = item.category === "theme" ? findChatTheme(item.id) : null;
  const banner = item.category === "banner" ? findPremiumBanner(item.id) : null;

  const cta = "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-5 text-sm font-extrabold transition active:scale-[0.97]";
  let action: React.ReactNode;
  if (owned) {
    action = (
      <Link href={item.category === "theme" ? "/messages" : `/settings/style?wear=${encodeURIComponent(item.id)}`} className={`${cta} bg-accent text-accent-ink`}>
        {item.category === "theme" ? "Use" : "Wear"}
      </Link>
    );
  } else if (item.tier === "premium") {
    action = (
      <Link href="/premium" className={`${cta} bg-accent text-accent-ink`}>
        <Sparkles size={15} /> Premium
      </Link>
    );
  } else if (native || !item.pricePaise) {
    action = <span className="shrink-0 px-2 text-xs text-muted">{native ? "Not in the app yet" : "Soon"}</span>;
  } else {
    action = (
      <button type="button" onClick={onBuy} disabled={busy} className={`${cta} bg-accent text-accent-ink disabled:opacity-60`}>
        {busy && <Loader2 size={15} className="animate-spin" />}
        Get · {formatInr(item.pricePaise)}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(84px+var(--sab))] z-30 mx-auto w-full max-w-[480px] px-3">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-elevated shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]">
        {banner && <div className="absolute inset-x-0 top-0 h-14 opacity-90" style={{ background: banner.gradient }} />}
        {theme && <div className="absolute inset-0 opacity-95" style={{ background: theme.background }} />}

        <div className="relative flex items-center gap-3 p-3 pr-4">
          {theme ? (
            <span className="w-28 shrink-0">
              <PreviewBubbles theme={theme} />
            </span>
          ) : (
            <AvatarFrame id={frame} size={52}>
              <Avatar name={me.name} hue={me.hue} size={52} src={me.avatarUrl ?? undefined} className={banner ? "ring-2 ring-elevated" : undefined} />
            </AvatarFrame>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold" style={style}>
              {item.category === "name" ? first : item.label}
            </p>
            {bubble ? (
              <span
                className={`relative mt-2 inline-block rounded-2xl rounded-br-md px-2.5 py-1 text-xs font-medium ${bubbleCss(bubble.bubble).className}`}
                style={bubbleCss(bubble.bubble).style}
              >
                {bubble.decor && <ChatThemeDecor decor={bubble.decor} mine />}
                being iconic
              </span>
            ) : (
              <p className={`truncate text-xs ${theme ? "text-white/70" : "text-muted"}`}>
                {owned ? "Yours" : item.tier === "premium" ? "Included in Premium" : "Yours to keep"}
              </p>
            )}
          </div>

          {action}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full ${theme ? "bg-black/40 text-white" : "bg-white/10 text-muted"}`}
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
