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
};

type Field = "name_font" | "name_glow" | "avatar_decoration" | "banner_id";

/**
 * Pick your name font, glow, avatar decoration and a Premium banner, with a
 * live preview of how you look. Every tap saves; the database refuses
 * anything you don't own, so a locked item leads to Premium or the Shop
 * instead of being tried.
 */
export function StyleEditor({ me: initial, owned }: { me: Me; owned: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();
  const [me, setMe] = useState(initial);

  const premium = me.is_premium;
  const name = me.display_name ?? me.username ?? "You";
  const unlocked = (id: string, tier: Tier) =>
    tier === "free" || (tier === "premium" ? premium : owned.includes(id));

  async function choose(field: Field, id: string | null, tier: Tier = "free") {
    if (id && !unlocked(id, tier)) {
      router.push(tier === "premium" ? "/premium" : "/shop");
      return;
    }
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

  const deco = DECORATIONS.find((d) => d.id === me.avatar_decoration);
  const previewDeco = deco && canShow(deco.tier, premium) ? deco.id : null;

  return (
    <div className="flex flex-col gap-6 px-4 pb-12 pt-3">
      {/* Live preview */}
      <section className="overflow-hidden rounded-2xl border border-border bg-elevated">
        <ProfileBanner bannerId={me.banner_id} bannerUrl={me.banner_url} isPremium={premium} />
        <div className="flex items-end gap-3 px-4 pb-4">
          <div className="-mt-8 rounded-[22px] ring-4 ring-elevated">
            <AvatarFrame id={previewDeco} size={64}>
              <Avatar name={name} hue={me.avatar_hue ?? 200} size={64} src={me.avatar_url ?? undefined} className="rounded-[20px]" />
            </AvatarFrame>
          </div>
          <div className="min-w-0 pb-1">
            <p className="flex items-center gap-1 text-lg font-bold leading-tight">
              <span className="truncate" style={nameStyle(me)}>{name}</span>
              {me.is_verified && <VerifiedStar className="h-4 w-4 shrink-0 text-verified" />}
            </p>
            {me.username && <p className="text-xs text-muted">@{me.username}</p>}
          </div>
        </div>
      </section>

      {!premium && (
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
              locked={!unlocked(f.id, f.tier)}
              onClick={() => choose("name_font", f.id, f.tier)}
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
              locked={!unlocked(g.id, g.tier)}
              onClick={() => choose("name_glow", g.id, g.tier)}
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
                locked={!open}
                onClick={() => choose("avatar_decoration", d.id, d.tier)}
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

      <Section title="Premium banners">
        <div className="grid grid-cols-3 gap-2">
          {PREMIUM_BANNERS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => choose("banner_id", b.id, b.tier)}
              className="flex flex-col items-center gap-1.5"
            >
              <span
                className={`relative block aspect-[3/1] w-full rounded-xl border-2 ${me.banner_id === b.id ? "border-accent" : "border-border"}`}
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
    </div>
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
  locked = false,
  onClick,
  children,
}: {
  selected: boolean;
  locked?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border bg-elevated transition active:scale-95 ${
        selected ? "border-accent" : "border-border"
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
  locked = false,
  onClick,
  label,
  children,
}: {
  selected: boolean;
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
        selected ? "border-accent" : "border-border"
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
