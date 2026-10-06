"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { withGlowRoom } from "@/components/ui/DisplayName";
import { MarketItemPreview, type Me } from "@/components/billing/MarketItemPreview";
import { findFont, findGlow, nameStyle } from "@/lib/cosmetics";
import { formatInr } from "@/lib/billing/plans";
import { shieldProps, useOverlayShield } from "@/lib/overlay-shield";
import {
  PLACE_LABEL,
  blockedReason,
  itemAction,
  neighbours,
  placesFor,
  type Category,
  type MarketItem,
  type Place,
} from "@/lib/marketplace";

/** One true line about where the item goes, under the picture of it. */
const WHERE: Record<Category, string> = {
  frame: "On your photo everywhere: posts, comments and chats.",
  name: "On your name, wherever it is written.",
  bubble: "On every message you send.",
  nameplate: "Behind your row in people's messages.",
  theme: "A look for one chat, set from inside it.",
};

/**
 * Your preview: the item on you, before you take it.
 *
 * A sheet over the category page rather than a page of its own, so closing
 * it puts you back exactly where you were in the grid. Where the item shows
 * in more than one place — a frame on your profile and beside your messages —
 * a switch at the top moves between them. Under the sheet is the rest of the
 * category in a row: tap one and the same sheet shows that instead, so ten
 * things can be tried without going back ten times.
 */
export function MarketPreviewSheet({
  item,
  siblings,
  me,
  owned,
  worn,
  native,
  configured,
  busy,
  onPick,
  onBuy,
  onWear,
  onClose,
}: {
  item: MarketItem;
  /** Everything in the same category, in the order the page shows it. */
  siblings: MarketItem[];
  me: Me;
  owned: boolean;
  /** It is on you right now. */
  worn: boolean;
  native: boolean;
  /** Whether this deployment can take a payment. */
  configured: boolean;
  busy: boolean;
  onPick: (item: MarketItem) => void;
  onBuy: () => void;
  /** Put it on (true) or take it off (false), without leaving. */
  onWear: (on: boolean) => void;
  onClose: () => void;
}) {
  useOverlayShield(true, onClose);
  const places = placesFor(item.category);
  const [place, setPlace] = useState<Place>(places[0]);
  // A different category has different places; never show one it lacks.
  const at = places.includes(place) ? place : places[0];
  const index = Math.max(0, siblings.findIndex((s) => s.id === item.id));
  const action = itemAction(item, { owned, native, worn, configured });

  if (typeof document === "undefined") return null;

  const cta =
    "flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[15px] font-extrabold text-accent-ink transition-transform active:scale-[0.98] disabled:opacity-60";

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col items-center justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview of ${item.label}`}
      {...shieldProps}
    >
      <button type="button" aria-label="Close preview" onClick={onClose} className="absolute inset-0 bg-black/60" />

      <div className="animate-rise relative flex w-full max-w-[480px] flex-col gap-3 px-3 pb-[calc(var(--sab,0px)+14px)]">
        <div className="flex flex-col gap-3 rounded-[28px] bg-elevated p-3 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-foreground"
            >
              <ChevronDown size={18} strokeWidth={2.6} />
            </button>
            {places.length > 1 ? (
              <div className="flex flex-1 rounded-xl bg-white/[0.07] p-[3px]" role="group" aria-label="Where it shows">
                {places.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={p === at}
                    onClick={() => setPlace(p)}
                    className={`h-8 flex-1 rounded-[9px] text-xs font-bold transition-colors ${
                      p === at ? "bg-accent text-accent-ink" : "text-muted"
                    }`}
                  >
                    {PLACE_LABEL[p]}
                  </button>
                ))}
              </div>
            ) : (
              <p className="flex-1 pr-9 text-center text-xs font-bold text-muted">Your preview</p>
            )}
          </div>

          <Scene item={item} place={at} me={me} />

          <p className="rounded-2xl bg-black/25 px-3 py-2.5 text-[12.5px] leading-snug text-foreground/80">
            {WHERE[item.category]}
          </p>

          <div className="flex items-center justify-between gap-3 px-1">
            <p className="min-w-0 truncate text-[15px] font-bold">{item.label}</p>
            <MarketTag item={item} owned={owned} />
          </div>

          {action.kind === "wear" ? (
            <button type="button" onClick={() => onWear(true)} className={cta}>
              Wear it
            </button>
          ) : action.kind === "wearing" ? (
            <button
              type="button"
              onClick={() => onWear(false)}
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-white/10 text-[15px] font-extrabold text-foreground transition-transform active:scale-[0.98]"
            >
              <Check size={17} strokeWidth={3} className="text-accent" /> You&rsquo;re wearing it · Take it off
            </button>
          ) : action.kind === "use" ? (
            <Link href={action.href} className={cta}>
              Use it in a chat
            </Link>
          ) : action.kind === "premium" ? (
            <Link href={action.href} className={cta}>
              <Sparkles size={16} /> Hell yeah, claim it
            </Link>
          ) : action.kind === "buy" ? (
            <button type="button" onClick={onBuy} disabled={busy} className={cta}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              Hell yeah, claim it · {formatInr(action.pricePaise)}
            </button>
          ) : (
            <p className="flex h-[52px] items-center justify-center rounded-2xl bg-white/[0.06] text-sm font-semibold text-muted">
              {blockedReason(action.why)}
            </p>
          )}
        </div>

        {/* The rest of the category, to flick through without going back. */}
        {siblings.length > 1 && (
          <div className="flex items-center justify-center gap-2.5" role="group" aria-label="More like this">
            {neighbours(siblings, index).map((s) => {
              const on = s.id === item.id;
              const size = on ? 56 : 42;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPick(s)}
                  aria-label={s.label}
                  aria-current={on || undefined}
                  className={`shrink-0 overflow-hidden rounded-full bg-[#0f0f10] transition-all ${
                    on ? "ring-2 ring-accent" : "opacity-60"
                  }`}
                  style={{ width: size, height: size }}
                >
                  {/* The same small preview the grid draws, shrunk to fit a dot. */}
                  <span
                    className="pointer-events-none block origin-top-left"
                    style={{ width: 96, height: 96, transform: `scale(${size / 96})` }}
                  >
                    <MarketItemPreview item={s} me={me} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The item, where it will be seen. */
function Scene({ item, place, me }: { item: MarketItem; place: Place; me: Me }) {
  const first = me.name.split(" ")[0] || "You";
  const frame = item.category === "frame" ? item.id : null;
  const styled =
    item.category === "name"
      ? withGlowRoom(
          nameStyle({ name_font: findFont(item.id)?.id ?? null, name_glow: findGlow(item.id)?.id ?? null, is_premium: true }),
        )
      : undefined;
  const face = (size: number) => (
    <AvatarFrame id={frame} size={size}>
      <Avatar name={me.name} hue={me.hue} size={size} src={me.avatarUrl ?? undefined} />
    </AvatarFrame>
  );

  if (place === "profile") {
    return (
      <div className="overflow-hidden rounded-2xl bg-background ring-1 ring-white/[0.06]" aria-hidden>
        <div
          className="h-16"
          style={{ background: `linear-gradient(120deg, hsl(${me.hue} 45% 26%), hsl(${(me.hue + 60) % 360} 45% 20%))` }}
        />
        <div className="-mt-7 flex items-end gap-3 px-3">
          <span className="rounded-[30%] ring-4 ring-background">{face(64)}</span>
          <div className="min-w-0 pb-1">
            <p className="truncate text-[17px] font-bold leading-tight" style={styled}>
              {item.category === "name" ? first : me.name}
            </p>
            {me.username && <p className="truncate text-xs text-muted">@{me.username}</p>}
          </div>
        </div>
        <div className="flex flex-col gap-2.5 p-3">
          <div className="flex gap-2 text-xs font-bold">
            <span className="flex h-8 flex-1 items-center justify-center rounded-xl bg-accent text-accent-ink">Follow</span>
            <span className="flex h-8 flex-1 items-center justify-center rounded-xl bg-surface">Message</span>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="aspect-square rounded-lg bg-surface" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (place === "feed") {
    return (
      <div className="overflow-hidden rounded-2xl bg-background p-3 ring-1 ring-white/[0.06]" aria-hidden>
        <div className="flex items-center gap-2.5">
          {face(36)}
          <p className="min-w-0 truncate text-sm font-semibold" style={styled}>
            {first}
          </p>
          <span className="text-xs text-faint">· 2h</span>
        </div>
        <span className="mt-3 block h-36 rounded-xl bg-surface" />
      </div>
    );
  }

  if (place === "chat" && item.category === "frame") {
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl bg-background p-3 ring-1 ring-white/[0.06]" aria-hidden>
        <span className="self-end rounded-2xl rounded-br-md bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-ink">
          you coming tonight?
        </span>
        <div className="flex items-end gap-2.5">
          {face(32)}
          <span className="rounded-2xl rounded-bl-md bg-surface px-3 py-1.5 text-[13px]">obviously</span>
        </div>
        <div className="flex items-end gap-2.5">
          <span className="w-8" />
          <span className="rounded-2xl rounded-bl-md bg-surface px-3 py-1.5 text-[13px]">save me a seat</span>
        </div>
      </div>
    );
  }

  // Bubbles, chat themes and nameplates already have a faithful large preview.
  return (
    <div className="h-52 overflow-hidden rounded-2xl ring-1 ring-white/[0.06]" aria-hidden>
      <MarketItemPreview item={item} me={me} large />
    </div>
  );
}

/** Yours, Premium, or what it costs. */
export function MarketTag({ item, owned }: { item: MarketItem; owned: boolean }) {
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
  return (
    <span className="shrink-0 text-[12px] font-bold tabular-nums">
      {item.pricePaise ? formatInr(item.pricePaise) : "Soon"}
    </span>
  );
}
