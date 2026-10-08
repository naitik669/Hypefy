"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, Loader2, Search, Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { MarketItemPreview, type Me } from "@/components/billing/MarketItemPreview";
import { MarketPreviewSheet } from "@/components/billing/MarketPreviewSheet";
import {
  filterAndSort,
  isOwned,
  isWorn,
  blockedReason,
  itemAction,
  wornColumn,
  onShelf,
  searchItems,
  tileAspect,
  CATEGORY_PAGES,
  SHELVES,
  type MarketItem,
  type Shelf,
  type Worn,
} from "@/lib/marketplace";
import { formatInr } from "@/lib/billing/plans";
import { buyItem } from "@/lib/billing/checkout";
import { isNative } from "@/lib/native";

const noop = () => () => {};

/**
 * One category of the Marketplace: everything in it as a grid.
 *
 * Each tile is the item on you, its name, and two buttons side by side: the
 * one that takes it (Claim, its price, or Wear once it is yours) and an eye
 * that opens the preview. Both are on the tile, so nothing has to be opened
 * to find out what a thing costs or to try it.
 *
 * Inside the Android app nothing can be bought (Play's rules), but everything
 * can still be previewed.
 */
export function MarketBrowse({
  items: all,
  columns,
  browse = false,
  configured,
  isPremium,
  owned: initialOwned,
  me,
  userId,
  worn: initialWorn,
}: {
  /** Everything this screen may show, before search and the chips. */
  items: MarketItem[];
  columns: 2 | 3;
  /** The front page: a search box, the shelf chips, and the kinds below. */
  browse?: boolean;
  configured: boolean;
  isPremium: boolean;
  owned: string[];
  prices: Record<string, number>;
  me: Me;
  userId: string;
  worn: Worn;
}) {
  const router = useRouter();
  const toast = useToast();
  const native = useSyncExternalStore(noop, isNative, () => false);
  const [owned, setOwned] = useState(initialOwned);
  const [previewing, setPreviewing] = useState<MarketItem | null>(null);
  /** The item being paid for, so only its own button spins. */
  const [buying, setBuying] = useState<string | null>(null);
  /** What you have on. Changed here the moment you tap, put back if it fails. */
  const [worn, setWorn] = useState(initialWorn);

  /**
   * Put an item on, or take it off, right here.
   *
   * It used to send you to Your style to do it: claim a frame, leave the
   * Marketplace, find the frame again, tap it, save. One of each kind is worn
   * at a time, so putting on a second frame replaces the first.
   */
  async function wear(item: MarketItem, on: boolean) {
    const column = wornColumn(item);
    if (!column) return;
    const before = worn;
    setWorn({ ...worn, [column]: on ? item.id : null });
    const supabase = createClient();
    const patch: Partial<Worn> = {};
    patch[column] = on ? item.id : null;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) {
      setWorn(before);
      toast(error.message.includes("Not unlocked") ? "That one isn't yours yet" : "Couldn't change that. Try again.", "error");
      return;
    }
    toast(on ? `You're wearing ${item.label}` : `${item.label} is off`, "success");
    router.refresh();
  }

  const [q, setQ] = useState("");
  const [shelf, setShelf] = useState<Shelf>("all");

  // Search and the chips narrow the same list; the order within it is the
  // curated one, so the most visual things still lead.
  const items = useMemo(() => {
    const picked = all.filter((i) => onShelf(i, shelf, owned, isPremium));
    return filterAndSort(searchItems(picked, q), "all", "featured");
  }, [all, shelf, q, owned, isPremium]);

  async function buy(item: MarketItem) {
    if (buying) return;
    setBuying(item.id);
    const result = await buyItem(item.id);
    setBuying(null);
    if (result.ok) {
      setOwned((o) => [...o, item.id]);
      toast(`${item.label} is yours`, "success");
      router.refresh();
    } else if (result.reason === "not_configured") {
      toast("Payments aren't open yet", "plain");
    } else if (result.reason === "failed") {
      toast(result.message ?? "Something went wrong", "error");
    }
  }

  const small =
    "flex h-8 min-w-0 items-center justify-center gap-1 rounded-[10px] bg-accent px-2.5 text-xs font-extrabold text-accent-ink transition-transform active:scale-95 disabled:opacity-60";

  return (
    <div className="pb-24">
      {browse && (
        <div className="px-3 pt-3">
          <div className="flex h-11 items-center gap-2 rounded-pill bg-surface px-4">
            <Search size={16} className="shrink-0 text-faint" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search frames, names, bubbles…"
              aria-label="Search the marketplace"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} aria-label="Clear" className="shrink-0 text-faint">
                <X size={15} />
              </button>
            )}
          </div>
          <div role="tablist" aria-label="Which things to show" className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
            {SHELVES.map((s) => {
              const on = shelf === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-shelf={s.id}
                  onClick={() => setShelf(s.id)}
                  className={`shrink-0 rounded-pill px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    on ? "bg-accent text-accent-ink" : "bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {browse && items.length === 0 && (
        <p className="px-6 pt-10 text-center text-sm text-faint">
          {shelf === "yours"
            ? "Nothing of yours yet. Claim something and it turns up here."
            : `Nothing matches “${q.trim()}”.`}
        </p>
      )}
      <ul className={`grid gap-2.5 px-3 pt-3 ${columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {items.map((item) => {
          const mine = isOwned(item, owned, isPremium);
          const action = itemAction(item, { owned: mine, native, configured, worn: isWorn(item, worn) });
          return (
            <li key={item.id} className="flex min-w-0 flex-col gap-2 rounded-[18px] bg-surface p-2">
              <span
                className={`block overflow-hidden rounded-xl ${
                  tileAspect(item) === "wide" ? "aspect-[4/3]" : "aspect-square"
                }`}
              >
                <MarketItemPreview item={item} me={me} />
              </span>
              <p className="truncate px-0.5 text-center text-xs font-semibold">{item.label}</p>
              <div className="flex items-center justify-center gap-1.5">
                {action.kind === "wear" ? (
                  <button type="button" onClick={() => void wear(item, true)} className={small} aria-label={`Wear ${item.label}`}>
                    Wear
                  </button>
                ) : action.kind === "wearing" ? (
                  // On already. Tapping takes it off, and it says so to a screen reader.
                  <button
                    type="button"
                    onClick={() => void wear(item, false)}
                    aria-label={`Wearing ${item.label}. Take it off`}
                    className={`${small} bg-white/10 text-accent`}
                  >
                    <Check size={13} strokeWidth={3} /> On
                  </button>
                ) : action.kind === "use" ? (
                  <Link href={action.href} className={small}>
                    Use
                  </Link>
                ) : action.kind === "premium" ? (
                  <Link href={action.href} className={small} aria-label={`Claim ${item.label} with Premium`}>
                    <Sparkles size={12} /> Claim
                  </Link>
                ) : action.kind === "buy" ? (
                  <button
                    type="button"
                    onClick={() => void buy(item)}
                    disabled={buying === item.id}
                    aria-label={`Claim ${item.label} for ${formatInr(action.pricePaise)}`}
                    className={small}
                  >
                    {buying === item.id ? <Loader2 size={13} className="animate-spin" /> : formatInr(action.pricePaise)}
                  </button>
                ) : (
                  // Cannot be bought here. It still says what it costs, and
                  // says why when asked, rather than being a dead button.
                  <button
                    type="button"
                    onClick={() => toast(blockedReason(action.why), "plain")}
                    className={`${small} bg-white/10 text-foreground`}
                  >
                    {item.pricePaise ? formatInr(item.pricePaise) : "Soon"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewing(item)}
                  aria-label={`Preview ${item.label}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/10 text-foreground transition-transform active:scale-95"
                >
                  <Eye size={15} strokeWidth={2.3} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {browse && (
        <section className="mt-8 px-3">
          <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-widest text-faint">Browse by kind</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_PAGES.map((cat) => (
              <Link
                key={cat.slug}
                href={`/marketplace/${cat.slug}`}
                className="rounded-2xl bg-surface px-4 py-3 text-sm font-bold transition-transform active:scale-[0.98]"
              >
                {cat.label}
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  {all.filter((i) => i.category === cat.category).length} to pick from
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      <p className="mt-8 px-6 text-center text-[11px] text-faint">
        Buying means you agree to the{" "}
        <Link href="/terms#paid" className="underline hover:text-muted">
          paid features terms
        </Link>
        .
      </p>

      {previewing && (
        <MarketPreviewSheet
          item={previewing}
          siblings={items}
          me={me}
          owned={isOwned(previewing, owned, isPremium)}
          worn={isWorn(previewing, worn)}
          onWear={(on) => void wear(previewing, on)}
          native={native}
          configured={configured}
          busy={buying === previewing.id}
          onPick={setPreviewing}
          onBuy={() => void buy(previewing)}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
