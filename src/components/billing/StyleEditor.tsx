"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import {
  DECORATIONS,
  NAME_FONTS,
  NAME_GLOWS,
  PREMIUM_BANNERS,
  canShow,
  nameStyle,
  type Tier,
} from "@/lib/cosmetics";
import { formatInr } from "@/lib/billing/plans";
import { BUBBLE_STYLES, findBubbleStyle, type BubbleStyleDef } from "@/lib/bubble-styles";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";

type Me = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  avatar_hue: number | null;
  banner_id: string | null;
  banner_url: string | null;
  is_premium: boolean;
  is_verified: boolean;
  name_font: string | null;
  name_glow: string | null;
  avatar_decoration: string | null;
  bubble_style: string | null;
};

type Field = "name_font" | "name_glow" | "avatar_decoration" | "banner_id" | "bubble_style";

/** A locked item shown on your preview without being saved. */
type TryOn = { field: Field; id: string; tier: Tier; label: string; pricePaise?: number };

/**
 * Pick your name font, glow, avatar decoration, chat bubble and a Premium
 * banner, with a live preview of how you look. Every tap on something you
 * own saves; the database refuses anything you don't.
 *
 * A locked item is tried on instead: it shows on the preview, nothing is
 * saved, and a bar offers the way to unlock it. Seeing yourself in it sells
 * it far better than a price tag on a grey tile.
 */
export function StyleEditor({ me: initial, owned }: { me: Me; owned: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState(initial);
  const [tryOn, setTryOn] = useState<TryOn | null>(null);

  const premium = me.is_premium;
  const name = me.display_name ?? me.username ?? "You";
  const unlocked = (id: string, tier: Tier) =>
    tier === "free" || (tier === "premium" ? premium : owned.includes(id));

  async function choose(field: Field, id: string | null, tier: Tier = "free", label = "", pricePaise?: number) {
    if (id && !unlocked(id, tier)) {
      setTryOn(tryOn?.id === id ? null : { field, id, tier, label, pricePaise });
      return;
    }
    setTryOn(null);
    const before = me;
    const patch: Partial<Me> = { [field]: id };
    // A banner theme draws in place of an uploaded banner image.
    if (field === "banner_id" && id) patch.banner_url = null;
    setMe({ ...me, ...patch });
    const { error } = await supabase.from("profiles").update(patch).eq("id", me.id);
    if (error) {
      setMe(before);
      toast(error.message.includes("Not unlocked") ? "That one isn't unlocked yet" : "Couldn't save", "error");
    } else {
      router.refresh();
    }
  }

  // What the preview draws: your saved look, with anything being tried on
  // laid over it as though you already had it.
  const view: Me = tryOn ? { ...me, [tryOn.field]: tryOn.id, is_premium: premium || tryOn.tier === "premium" } : me;
  const deco = DECORATIONS.find((d) => d.id === view.avatar_decoration);
  const previewDeco = deco && canShow(deco.tier, view.is_premium) ? deco.id : null;
  const bubble = findBubbleStyle(view.bubble_style);
  const bubbleShown = bubble && canShow(bubble.tier, view.is_premium) ? bubble : null;
  const isTrying = (id: string) => tryOn?.id === id;

  return (
    <div className="flex flex-col gap-6 px-4 pb-12 pt-3">
      {/* Live preview */}
      <section className="overflow-hidden rounded-2xl border border-border bg-elevated">
        <ProfileBanner bannerId={view.banner_id} bannerUrl={tryOn?.field === "banner_id" ? null : view.banner_url} isPremium={view.is_premium} />
        <div className="flex items-end gap-3 px-4 pb-4">
          <div className="-mt-8 rounded-[22px] ring-4 ring-elevated">
            <AvatarFrame id={previewDeco} size={64}>
              <Avatar name={name} hue={me.avatar_hue ?? 200} size={64} src={me.avatar_url ?? undefined} className="rounded-[20px]" />
            </AvatarFrame>
          </div>
          <div className="min-w-0 pb-1">
            <p className="flex items-center gap-1 text-lg font-bold leading-tight">
              <span className="truncate" style={nameStyle(view)}>{name}</span>
              {me.is_verified && <VerifiedStar className="h-4 w-4 shrink-0 text-verified" />}
            </p>
            {me.username && <p className="text-xs text-muted">@{me.username}</p>}
          </div>
        </div>
        {/* How your messages look */}
        <div className="flex flex-col gap-2 border-t border-border/60 bg-background/60 px-4 pb-4 pt-5">
          <span className="self-start rounded-2xl rounded-bl-md bg-surface px-3 py-1.5 text-xs">are you coming?</span>
          <MiniBubble style={bubbleShown} text="on my way 🏃" />
        </div>
      </section>

      {!premium && !tryOn && (
        <button
          type="button"
          onClick={() => router.push("/premium")}
          className="rounded-2xl border border-verified/25 bg-verified/10 px-4 py-3 text-left text-sm"
        >
          <span className="font-bold">Unlock everything with Premium</span>
          <span className="block text-xs text-muted">Fonts, glows, decorations and banners — first month free.</span>
        </button>
      )}

      <Section title="Name font">
        <div className="grid grid-cols-4 gap-2">
          <Tile selected={!me.name_font} onClick={() => choose("name_font", null)}>
            <span className="text-lg font-bold">Aa</span>
            <Label>Default</Label>
          </Tile>
          {NAME_FONTS.map((f) => (
            <Tile
              key={f.id}
              selected={me.name_font === f.id}
              trying={isTrying(f.id)}
              locked={!unlocked(f.id, f.tier)}
              onClick={() => choose("name_font", f.id, f.tier, `${f.label} font`)}
            >
              <span className="text-lg" style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.italic ? "italic" : undefined, fontSize: `${1.125 * f.scale}rem` }}>
                Aa
              </span>
              <Label>{f.label}</Label>
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Name glow">
        <div className="grid grid-cols-7 gap-2">
          <Swatch selected={!me.name_glow} onClick={() => choose("name_glow", null)} label="No glow">
            <span className="h-1 w-4 rotate-45 rounded bg-faint" />
          </Swatch>
          {NAME_GLOWS.map((g) => (
            <Swatch
              key={g.id}
              selected={me.name_glow === g.id}
              trying={isTrying(g.id)}
              locked={!unlocked(g.id, g.tier)}
              onClick={() => choose("name_glow", g.id, g.tier, `${g.label} glow`)}
              label={g.label}
            >
              <span className="h-5 w-5 rounded-full" style={{ background: g.color, boxShadow: `0 0 12px ${g.color}` }} />
            </Swatch>
          ))}
        </div>
      </Section>

      <Section title="Avatar decoration">
        <div className="grid grid-cols-4 gap-2">
          <Tile selected={!me.avatar_decoration} onClick={() => choose("avatar_decoration", null)}>
            <Avatar name={name} hue={me.avatar_hue ?? 200} size={36} src={me.avatar_url ?? undefined} />
            <Label>None</Label>
          </Tile>
          {DECORATIONS.map((d) => {
            const open = unlocked(d.id, d.tier);
            return (
              <Tile
                key={d.id}
                selected={me.avatar_decoration === d.id}
                trying={isTrying(d.id)}
                locked={!open}
                onClick={() => choose("avatar_decoration", d.id, d.tier, d.label, d.pricePaise)}
              >
                <AvatarFrame id={d.id} size={36}>
                  <Avatar name={name} hue={me.avatar_hue ?? 200} size={36} src={me.avatar_url ?? undefined} />
                </AvatarFrame>
                <Label>{!open && d.tier === "shop" && d.pricePaise ? formatInr(d.pricePaise) : d.label}</Label>
              </Tile>
            );
          })}
        </div>
      </Section>

      <Section title="Chat bubble">
        <p className="-mt-1 mb-2 px-1 text-[11px] text-muted">Your messages look like this in every chat — even ones with a theme.</p>
        <div className="grid grid-cols-2 gap-2">
          <Tile selected={!me.bubble_style} onClick={() => choose("bubble_style", null)}>
            <MiniBubble style={null} text="hey 👋" />
            <Label>Default</Label>
          </Tile>
          {BUBBLE_STYLES.map((b) => {
            const open = unlocked(b.id, b.tier);
            return (
              <Tile
                key={b.id}
                selected={me.bubble_style === b.id}
                trying={isTrying(b.id)}
                locked={!open}
                onClick={() => choose("bubble_style", b.id, b.tier, `${b.label} bubble`, b.pricePaise)}
              >
                <MiniBubble style={b} text="hey 👋" />
                <Label>{!open && b.tier === "shop" && b.pricePaise ? `${b.label} · ${formatInr(b.pricePaise)}` : b.label}</Label>
              </Tile>
            );
          })}
        </div>
      </Section>

      <Section title="Premium banners">
        <div className="grid grid-cols-3 gap-2">
          {PREMIUM_BANNERS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => choose("banner_id", b.id, b.tier, `${b.label} banner`)}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`relative block aspect-[3/1] w-full rounded-xl border-2 ${me.banner_id === b.id ? "border-accent" : isTrying(b.id) ? "border-dashed border-verified" : "border-border"}`}
                style={{ background: b.gradient }}
              >
                {!unlocked(b.id, b.tier) && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-[10px] bg-black/35">
                    <Lock size={14} />
                  </span>
                )}
              </span>
              <Label>{b.label}</Label>
            </button>
          ))}
        </div>
        {me.banner_url && (
          <p className="mt-2 text-[11px] text-faint">Picking one replaces your uploaded banner photo.</p>
        )}
      </Section>

      {tryOn && (
        <div className="sticky bottom-[calc(96px+var(--sab))] z-30 flex items-center gap-3 rounded-2xl border border-verified/30 bg-elevated/95 p-3 shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">Trying {tryOn.label}</p>
            <p className="text-xs text-muted">Only you can see this preview.</p>
          </div>
          <button type="button" onClick={() => setTryOn(null)} className="h-9 rounded-xl px-3 text-xs font-semibold text-muted">
            Undo
          </button>
          <button
            type="button"
            onClick={() => router.push(tryOn.tier === "premium" ? "/premium" : "/marketplace")}
            className="h-9 shrink-0 rounded-xl bg-accent px-3.5 text-xs font-extrabold text-accent-ink"
          >
            {tryOn.tier === "premium" ? "Get Premium" : tryOn.pricePaise ? `Buy · ${formatInr(tryOn.pricePaise)}` : "Shop"}
          </button>
        </div>
      )}
    </div>
  );
}

/** One chat bubble in a bubble style, or the app default when none. */
function MiniBubble({ style, text }: { style: BubbleStyleDef | null; text: string }) {
  return (
    <span
      className={`relative mt-2 self-end rounded-2xl rounded-br-md px-3 py-1.5 text-xs font-medium ${style ? "" : "bg-accent text-accent-ink"}`}
      style={style ? { background: style.bubble.background, color: style.bubble.color, border: style.bubble.border } : undefined}
    >
      {style?.decor && <ChatThemeDecor decor={style.decor} mine />}
      {text}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 px-1 text-xs font-bold uppercase tracking-widest text-faint">{title}</p>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-muted">{children}</span>;
}

function Tile({
  selected,
  trying = false,
  locked = false,
  onClick,
  children,
}: {
  selected: boolean;
  trying?: boolean;
  locked?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-elevated px-1 py-2 transition active:scale-95 ${
        selected ? "border-accent" : trying ? "border-dashed border-verified" : "border-border"
      }`}
    >
      {children}
      {selected && (
        <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-ink">
          <Check size={10} strokeWidth={3} />
        </span>
      )}
      {locked && (
        <span className="absolute right-1.5 top-1.5 text-faint">
          <Lock size={12} />
        </span>
      )}
    </button>
  );
}

function Swatch({
  selected,
  trying = false,
  locked = false,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  trying?: boolean;
  locked?: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      className={`relative flex aspect-square items-center justify-center rounded-2xl border bg-elevated transition active:scale-95 ${
        selected ? "border-accent" : trying ? "border-dashed border-verified" : "border-border"
      }`}
    >
      {children}
      {locked && (
        <span className="absolute bottom-1 right-1 text-faint">
          <Lock size={10} />
        </span>
      )}
    </button>
  );
}
