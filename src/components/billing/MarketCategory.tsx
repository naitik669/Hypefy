"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/ToastProvider";
import { MarketItemPreview, type Me } from "@/components/billing/MarketItemPreview";
import { MarketPreviewSheet } from "@/components/billing/MarketPreviewSheet";
import {
  buildItems,
  filterAndSort,
  isOwned,
  itemAction,
  type CategoryPage,
  type MarketItem,
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
export function MarketCategory({
  page,
  configured,
  isPremium,
  owned: initialOwned,
  prices,
  me,
}: {
  page: CategoryPage;
  configured: boolean;
  isPremium: boolean;
  owned: string[];
  prices: Record<string, number>;
  me: Me;
}) {
  const router = useRouter();
  const toast = useToast();
  const native = useSyncExternalStore(noop, isNative, () => false);
  const [owned, setOwned] = useState(initialOwned);
  const [previewing, setPreviewing] = useState<MarketItem | null>(null);
  /** The item being paid for, so only its own button spins. */
  const [buying, setBuying] = useState<string | null>(null);

  const items = useMemo(
    () => filterAndSort(buildItems(prices), page.category, "featured"),
    [prices, page.category],
  );

  async function buy(item: MarketItem) {
    if (buying) return;
    if (!configured) {
      toast("Payments are coming soon", "plain");
      return;
    }
    setBuying(item.id);
    const result = await buyItem(item.id);
    setBuying(null);
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

  const small =
    "flex h-8 min-w-0 items-center justify-center gap-1 rounded-[10px] bg-accent px-2.5 text-xs font-extrabold text-accent-ink transition-transform active:scale-95 disabled:opacity-60";

  return (
    <div className="pb-24">
      <ul className={`grid gap-2.5 px-3 pt-3 ${page.columns === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
        {items.map((item) => {
          const mine = isOwned(item, owned, isPremium);
          const action = itemAction(item, { owned: mine, native });
          return (
            <li key={item.id} className="flex min-w-0 flex-col gap-2 rounded-[18px] bg-surface p-2">
              <span className={`block overflow-hidden rounded-xl ${page.columns === 3 ? "aspect-square" : "aspect-[4/3]"}`}>
                <MarketItemPreview item={item} me={me} />
              </span>
              <p className="truncate px-0.5 text-center text-xs font-semibold">{item.label}</p>
              <div className="flex items-center justify-center gap-1.5">
                {action.kind === "wear" ? (
                  <Link href={action.href} className={small}>
                    {item.category === "theme" ? "Use" : "Wear"}
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
                    onClick={() =>
                      toast(
                        action.why === "app" ? "Not in the app yet. Get it on the website." : "Coming soon",
                        "plain",
                      )
                    }
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
          native={native}
          busy={buying === previewing.id}
          onPick={setPreviewing}
          onBuy={() => void buy(previewing)}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}
