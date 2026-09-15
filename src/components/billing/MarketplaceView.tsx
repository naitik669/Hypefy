"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpDown, Check, Loader2, Sparkles } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/ToastProvider";
import { MarketItemPreview, type Me } from "@/components/billing/MarketItemPreview";
import {
  CATEGORIES,
  CATEGORY_PITCH,
  SORTS,
  buildItems,
  filterAndSort,
  isOwned,
  type Category,
  type MarketItem,
  type SortId,
} from "@/lib/marketplace";
import { formatInr } from "@/lib/billing/plans";
import { findChatTheme } from "@/lib/chat-themes";
import { PreviewBubbles } from "@/components/messages/ChatThemePicker";
import { buyItem } from "@/lib/billing/checkout";
import { isNative } from "@/lib/native";

const noop = () => () => {};

/**
 * The Marketplace. Browse by category, sort, tap anything to see it on
 * yourself and get it. The grid carries only a preview, a name and one tag;
 * everything else waits in the item's sheet.
 *
 * Prices come from the catalogue checkout charges from. Inside the Android
 * app nothing can be bought (Play's rules), but everything can be browsed.
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
  const [open, setOpen] = useState<MarketItem | null>(null);
  const [owned, setOwned] = useState(initialOwned);
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => buildItems(prices), [prices]);
  const items = useMemo(() => filterAndSort(all, category, sort), [all, category, sort]);
  const featured = all.find((i) => i.id === "theme-pond");
  const featuredTheme = findChatTheme("theme-pond");
  const premiumCount = all.filter((i) => i.tier === "premium").length;

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
    <div className="pb-12">
      {/* Featured: words on the left, the thing itself on the right */}
      {featured && featuredTheme && category === "all" && (
        <button
          type="button"
          onClick={() => setOpen(featured)}
          className="mx-4 mt-3 flex h-40 w-[calc(100%-2rem)] items-stretch overflow-hidden rounded-3xl border border-white/10 text-left transition active:scale-[0.99]"
          style={{ background: featuredTheme.background }}
        >
          <span className="flex flex-1 flex-col justify-end p-4">
            <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-accent-ink">
              Featured
            </span>
            <span className="mt-2 text-2xl font-black leading-none tracking-tight text-white">Pond</span>
            <span className="mt-1 text-[13px] leading-snug text-white/70 [text-wrap:balance]">Chats, but make it a pond.</span>
          </span>
          <span className="flex w-[44%] shrink-0 items-center pr-4">
            <PreviewBubbles theme={featuredTheme} />
          </span>
        </button>
      )}

      {/* Filters */}
      <div className="sticky top-[calc(3.5rem+var(--sat))] z-10 mt-3 flex items-center gap-2 chrome-bar py-2.5 pl-4 pr-2">
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

      {/* Premium nudge — one line, only when it is news */}
      {!isPremium && category === "all" && (
        <Link
          href="/premium"
          className="mx-4 mt-3 flex items-center gap-2 rounded-2xl bg-verified/10 px-3 py-2.5 text-xs"
        >
          <Sparkles size={14} className="shrink-0 text-verified" />
          <span className="flex-1">
            <span className="font-bold">Premium unlocks {premiumCount} of these.</span>{" "}
            <span className="text-muted">First month on us.</span>
          </span>
          <span aria-hidden className="text-faint">›</span>
        </Link>
      )}

      {/* Grid */}
      <ul className="mt-3 grid grid-cols-2 gap-3 px-4">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => setOpen(item)}
              className="group flex w-full flex-col gap-2 text-left"
            >
              <span className="block aspect-square overflow-hidden rounded-2xl border border-white/[0.06] transition-transform group-active:scale-[0.97]">
                <MarketItemPreview item={item} me={me} />
              </span>
              <span className="flex items-center justify-between gap-2 px-0.5">
                <span className="truncate text-sm font-semibold">{item.label}</span>
                <Tag item={item} owned={isOwned(item, owned, isPremium)} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Item sheet */}
      <BottomSheet open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <ItemSheet
            item={open}
            me={me}
            owned={isOwned(open, owned, isPremium)}
            native={native}
            busy={busy}
            onBuy={() => buy(open)}
            onClose={() => setOpen(null)}
          />
        )}
      </BottomSheet>

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

      <p className="mt-8 px-6 text-center text-[11px] text-faint">
        Buying means you agree to the{" "}
        <Link href="/terms#paid" className="underline hover:text-muted">
          paid features terms
        </Link>
        .
      </p>
    </div>
  );
}

function Tag({ item, owned }: { item: MarketItem; owned: boolean }) {
  if (owned) {
    return (
      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
        <Check size={11} strokeWidth={3} /> Yours
      </span>
    );
  }
  if (item.tier === "premium") {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-verified/15 px-2 py-0.5 text-[11px] font-bold text-verified">
        <Sparkles size={10} /> Premium
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold tabular-nums">
      {item.pricePaise ? formatInr(item.pricePaise) : "Soon"}
    </span>
  );
}

function ItemSheet({
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
  const wearable = item.category !== "theme";
  const primary = "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-extrabold transition active:scale-[0.98]";

  let action: React.ReactNode;
  if (owned) {
    action = (
      <Link href={wearable ? "/settings/style" : "/messages"} onClick={onClose} className={`${primary} bg-accent text-accent-ink`}>
        {wearable ? "Wear it" : "Use it in a chat"}
      </Link>
    );
  } else if (item.tier === "premium") {
    action = (
      <Link href="/premium" onClick={onClose} className={`${primary} bg-accent text-accent-ink`}>
        <Sparkles size={16} /> Unlock with Premium
      </Link>
    );
  } else if (native) {
    action = <p className="py-3 text-center text-sm text-muted">Not available in the app yet.</p>;
  } else {
    action = (
      <button type="button" onClick={onBuy} disabled={busy || !item.pricePaise} className={`${primary} bg-accent text-accent-ink disabled:opacity-60`}>
        {busy && <Loader2 size={16} className="animate-spin" />}
        {item.pricePaise ? `Buy · ${formatInr(item.pricePaise)}` : "Coming soon"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-3">
      <div className="aspect-[4/3] overflow-hidden rounded-3xl border border-white/[0.06]">
        <MarketItemPreview item={item} me={me} large />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black tracking-tight">{item.label}</h2>
          <Tag item={item} owned={owned} />
        </div>
        <p className="mt-1 text-sm text-muted">{CATEGORY_PITCH[item.category]}</p>
      </div>
      {action}
      {!owned && wearable && (
        <Link href="/settings/style" onClick={onClose} className="-mt-1 text-center text-xs font-semibold text-muted hover:text-foreground">
          Try it on first
        </Link>
      )}
    </div>
  );
}
