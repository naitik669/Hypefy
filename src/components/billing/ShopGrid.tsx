"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { useToast } from "@/components/ui/ToastProvider";
import { PreviewBubbles } from "@/components/messages/ChatThemePicker";
import { DECORATIONS } from "@/lib/cosmetics";
import { CHAT_THEMES } from "@/lib/chat-themes";
import { BUBBLE_STYLES } from "@/lib/bubble-styles";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { formatInr } from "@/lib/billing/plans";
import { buyItem } from "@/lib/billing/checkout";
import { isNative } from "@/lib/native";

const noop = () => () => {};

type Item = { id: string; label: string; kind: "decoration" | "theme" | "bubble"; tier: string };

/**
 * One-off items you keep forever, whether or not you have Premium: the Shop
 * decorations and chat themes, previewed on your own avatar and in a chat.
 * Premium's own items sit below, marked as included, so the two ways to get
 * something are side by side.
 *
 * Prices shown come from the database, the same place checkout charges from.
 * In the Android app there is nothing to buy (Play's rules), only what you own.
 */
export function ShopGrid({
  configured,
  isPremium,
  owned,
  prices,
  me,
}: {
  configured: boolean;
  isPremium: boolean;
  owned: string[];
  prices: Record<string, number>;
  me: { name: string; avatarUrl: string | null; hue: number };
}) {
  const router = useRouter();
  const toast = useToast();
  const native = useSyncExternalStore(noop, isNative, () => false);
  const [busy, setBusy] = useState<string | null>(null);
  const [justBought, setJustBought] = useState<string[]>([]);

  const items: Item[] = [
    ...DECORATIONS.map((d) => ({ id: d.id, label: d.label, kind: "decoration" as const, tier: d.tier })),
    ...CHAT_THEMES.filter((t) => t.tier !== "free").map((t) => ({ id: t.id, label: t.label, kind: "theme" as const, tier: t.tier })),
    ...BUBBLE_STYLES.map((b) => ({ id: b.id, label: b.label, kind: "bubble" as const, tier: b.tier })),
  ];
  const has = (id: string) => owned.includes(id) || justBought.includes(id);

  async function buy(item: Item) {
    if (busy) return;
    setBusy(item.id);
    const result = await buyItem(item.id);
    setBusy(null);
    if (result.ok) {
      setJustBought((b) => [...b, item.id]);
      toast(`${item.label} is yours`, "success");
      router.refresh();
    } else if (result.reason === "not_configured") {
      toast("Payments are coming soon", "plain");
    } else if (result.reason === "failed") {
      toast(result.message ?? "Something went wrong", "error");
    }
  }

  const group = (tier: string, kind: Item["kind"]) => items.filter((i) => i.tier === tier && i.kind === kind);

  function shopAction(item: Item) {
    const price = prices[item.id];
    if (has(item.id)) {
      return (
        <Link
          href={item.kind === "theme" ? "/messages" : "/settings/style"}
          className="flex h-9 items-center justify-center gap-1 rounded-xl bg-white/10 text-xs font-bold"
        >
          <Check size={13} /> {item.kind === "theme" ? "Owned" : "Wear"}
        </Link>
      );
    }
    if (native || !price) {
      return <span className="flex h-9 items-center justify-center text-[11px] text-muted">{native ? "Not in the app yet" : "Soon"}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => (configured ? buy(item) : toast("Payments are coming soon", "plain"))}
        disabled={!!busy}
        aria-label={`Buy ${item.label} for ${formatInr(price)}`}
        className="flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-accent text-xs font-extrabold text-accent-ink transition active:scale-95 disabled:opacity-60"
      >
        {busy === item.id && <Loader2 size={13} className="animate-spin" />}
        {formatInr(price)}
      </button>
    );
  }

  function premiumAction(item: Item) {
    return isPremium ? (
      <Link
        href={item.kind === "theme" ? "/messages" : "/settings/style"}
        className="flex h-9 items-center justify-center gap-1 rounded-xl bg-white/10 text-xs font-bold"
      >
        <Check size={13} /> Yours
      </Link>
    ) : (
      <Link
        href="/premium"
        className="flex h-9 items-center justify-center gap-1 rounded-xl border border-verified/30 text-xs font-bold text-verified"
      >
        <Sparkles size={12} /> Premium
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-7 px-4 pb-12 pt-3">
      <section className="flex flex-col gap-3">
        <Heading title="Yours to keep" sub="Buy once, keep forever — Premium or not." />
        <div className="grid grid-cols-3 gap-2.5">
          {group("shop", "decoration").map((item) => (
            <Card key={item.id} item={item} me={me}>{shopAction(item)}</Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {group("shop", "theme").map((item) => (
            <Card key={item.id} item={item} me={me}>{shopAction(item)}</Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {group("shop", "bubble").map((item) => (
            <Card key={item.id} item={item} me={me}>{shopAction(item)}</Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Heading title="Included in Premium" sub={isPremium ? "All of these are yours." : "Unlock them all with Premium."} />
        <div className="grid grid-cols-3 gap-2.5">
          {group("premium", "decoration").map((item) => (
            <Card key={item.id} item={item} me={me}>{premiumAction(item)}</Card>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {group("premium", "theme").map((item) => (
            <Card key={item.id} item={item} me={me}>{premiumAction(item)}</Card>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {group("premium", "bubble").map((item) => (
            <Card key={item.id} item={item} me={me}>{premiumAction(item)}</Card>
          ))}
        </div>
      </section>

      <p className="px-1 text-center text-[11px] leading-snug text-faint">
        By buying you agree to the{" "}
        <Link href="/terms#paid" className="underline hover:text-muted">paid features terms</Link>.
      </p>
    </div>
  );
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-1">
      <p className="text-xs font-bold uppercase tracking-widest text-faint">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function Card({
  item,
  me,
  children,
}: {
  item: Item;
  me: { name: string; avatarUrl: string | null; hue: number };
  children: React.ReactNode;
}) {
  const theme = item.kind === "theme" ? CHAT_THEMES.find((t) => t.id === item.id) : undefined;
  const bubble = item.kind === "bubble" ? BUBBLE_STYLES.find((b) => b.id === item.id) : undefined;
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-elevated p-2.5">
      {bubble ? (
        <div className="flex h-24 items-center justify-center rounded-xl bg-background">
          <span
            className="relative mt-2 rounded-2xl rounded-br-md px-3 py-1.5 text-xs font-medium"
            style={{ background: bubble.bubble.background, color: bubble.bubble.color, border: bubble.bubble.border }}
          >
            {bubble.decor && <ChatThemeDecor decor={bubble.decor} mine />}
            hey 👋
          </span>
        </div>
      ) : theme ? (
        <div className="flex h-28 flex-col justify-center overflow-hidden rounded-xl px-2.5" style={{ background: theme.background }}>
          <PreviewBubbles theme={theme} />
        </div>
      ) : (
        <div className="flex h-24 items-center justify-center rounded-xl bg-background">
          <AvatarFrame id={item.id} size={48}>
            <Avatar name={me.name} hue={me.hue} size={48} src={me.avatarUrl ?? undefined} />
          </AvatarFrame>
        </div>
      )}
      <p className="px-0.5 text-sm font-bold">{item.label}</p>
      {children}
    </div>
  );
}
