"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/ToastProvider";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarFrame } from "@/components/ui/AvatarFrame";
import { VerifiedStar } from "@/components/ui/VerifiedStar";
import { ProfileBanner } from "@/components/profile/ProfileBanner";
import { ChatThemeDecor } from "@/components/messages/ChatThemeDecor";
import { DECORATIONS, NAME_FONTS, NAME_GLOWS, NAME_SIZE_ADJUST, nameStyle, type Tier } from "@/lib/cosmetics";
import { withGlowRoom } from "@/components/ui/DisplayName";
import { NAMEPLATES } from "@/lib/nameplates";
import { NameplateRow } from "@/components/ui/Nameplate";
import { BUBBLE_STYLES, findBubbleStyle } from "@/lib/bubble-styles";
import { bubbleCss } from "@/lib/chat-themes";

export type StyleMe = {
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
  nameplate: string | null;
};

// The banner is not here: it comes from your own gallery, in Edit profile.
type Look = Pick<StyleMe, "name_font" | "name_glow" | "avatar_decoration" | "bubble_style" | "nameplate">;
const FIELDS = ["avatar_decoration", "name_font", "name_glow", "bubble_style", "nameplate"] as const;

type Tab = "frames" | "names" | "bubbles" | "nameplates";
const TABS: { id: Tab; label: string }[] = [
  { id: "frames", label: "Frames" },
  { id: "names", label: "Names" },
  { id: "bubbles", label: "Bubbles" },
  { id: "nameplates", label: "Nameplates" },
];

/**
 * Your style, as a wardrobe: your profile card on top showing exactly what
 * people will see, Save right under it, and below that only the things you
 * own. Picking changes the card at once; nothing is stored until Save.
 * Finding new things is the Marketplace's job, one tap away.
 */
export function StyleEditor({ me, owned, wear }: { me: StyleMe; owned: string[]; wear?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();

  const premium = me.is_premium;
  const has = (id: string, tier: Tier) => tier === "free" || (tier === "premium" ? premium : owned.includes(id));

  const initial: Look = {
    name_font: me.name_font,
    name_glow: me.name_glow,
    avatar_decoration: me.avatar_decoration,
    bubble_style: me.bubble_style,
    nameplate: me.nameplate,
  };
  const [saved, setSaved] = useState<Look>(initial);
  const [draft, setDraft] = useState<Look>(() => withWorn(initial, wear, has));
  const [tab, setTab] = useState<Tab>(() => tabFor(wear));
  const [saving, setSaving] = useState(false);

  const changed = FIELDS.filter((f) => draft[f] !== saved[f]);
  const changeCount = changed.length;
  const dirty = changeCount > 0;
  const set = (patch: Partial<Look>) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    const patch: Partial<Look> = {};
    for (const f of changed) Object.assign(patch, { [f]: draft[f] });
    const { error } = await supabase.from("profiles").update(patch).eq("id", me.id);
    setSaving(false);
    if (error) {
      toast(error.message.includes("Not unlocked") ? "One of these isn't yours yet" : "Couldn't save. Try again.", "error");
      return;
    }
    setSaved(draft);
    toast("Saved", "success");
    router.refresh();
  }

  const name = me.display_name ?? me.username ?? "You";
  const view = { ...draft, is_premium: premium };

  return (
    <div className="flex flex-col gap-6 px-4 pb-16 pt-3">
      {/* Your card, as others will see it */}
      <section className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-3xl border border-white/[0.07] bg-elevated">
          <ProfileBanner bannerId={me.banner_id} bannerUrl={me.banner_url} isPremium={premium} />
          <div className="px-5 pb-5">
            <div className="-mt-9 flex items-end justify-between">
              <span className="rounded-[26px] bg-elevated p-1">
                <AvatarFrame id={draft.avatar_decoration} size={76}>
                  <Avatar name={name} hue={me.avatar_hue ?? 200} size={76} src={me.avatar_url ?? undefined} className="rounded-[22px]" />
                </AvatarFrame>
              </span>
              {dirty && <span className="mb-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-muted">Preview</span>}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-lg font-bold leading-tight">
              <span className="truncate" style={withGlowRoom(nameStyle(view))}>{name}</span>
              {me.is_verified && <VerifiedStar className="h-4 w-4 shrink-0 text-verified" />}
            </p>
            {me.username && <p className="text-[13px] text-muted">@{me.username}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <span className="self-start rounded-2xl rounded-bl-md bg-surface px-3 py-1.5 text-[13px]">new look?</span>
              <MiniBubble id={draft.bubble_style} text="always" className="self-end" />
            </div>
            {draft.nameplate && (
              <div className="mt-4">
                <p className="mb-1.5 text-[11px] font-semibold text-faint">In Messages</p>
                <NameplateRow id={draft.nameplate} name={name} avatarUrl={me.avatar_url} hue={me.avatar_hue ?? 200} />
              </div>
            )}
          </div>
        </div>

        {dirty ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDraft(saved)}
              className="h-12 rounded-2xl bg-surface px-5 text-sm font-semibold text-muted transition active:scale-[0.98]"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={save}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-accent text-sm font-extrabold text-accent-ink transition active:scale-[0.98]"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              {changeCount === 1 ? "Save change" : `Save ${changeCount} changes`}
            </button>
          </div>
        ) : (
          <div className="flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-surface text-sm font-semibold text-faint">
            <Check size={15} /> Saved
          </div>
        )}
      </section>

      {/* What you own */}
      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-[15px] font-bold">Your items</h2>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" data-hswipe="">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={`h-8 shrink-0 rounded-full px-3.5 text-xs font-bold transition-colors ${
                tab === t.id ? "bg-foreground text-background" : "bg-surface text-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "frames" && (
          <Shelf empty={DECORATIONS.every((d) => !has(d.id, d.tier)) ? "frames" : null}>
            <Tile on={!draft.avatar_decoration} label="None" onClick={() => set({ avatar_decoration: null })}>
              <Avatar name={name} hue={me.avatar_hue ?? 200} size={40} src={me.avatar_url ?? undefined} />
            </Tile>
            {DECORATIONS.filter((d) => has(d.id, d.tier)).map((d) => (
              <Tile key={d.id} on={draft.avatar_decoration === d.id} label={d.label} onClick={() => set({ avatar_decoration: d.id })}>
                <AvatarFrame id={d.id} size={44}>
                  <Avatar name={name} hue={me.avatar_hue ?? 200} size={44} src={me.avatar_url ?? undefined} />
                </AvatarFrame>
              </Tile>
            ))}
          </Shelf>
        )}

        {tab === "names" && (
          <div className="flex flex-col gap-4">
            <Shelf empty={NAME_FONTS.every((f) => !has(f.id, f.tier)) ? "name styles" : null}>
              <Tile on={!draft.name_font} label="Default" onClick={() => set({ name_font: null })}>
                <span className="text-xl font-bold">Aa</span>
              </Tile>
              {NAME_FONTS.filter((f) => has(f.id, f.tier)).map((f) => (
                <Tile key={f.id} on={draft.name_font === f.id} label={f.label} onClick={() => set({ name_font: f.id })}>
                  <span style={{ fontFamily: f.family, fontWeight: f.weight, fontStyle: f.italic ? "italic" : undefined, fontSize: "1.25rem", fontSizeAdjust: NAME_SIZE_ADJUST }}>Aa</span>
                </Tile>
              ))}
            </Shelf>
            {NAME_GLOWS.some((g) => has(g.id, g.tier)) && (
              <div className="flex flex-wrap gap-2.5">
                <Swatch on={!draft.name_glow} label="No glow" onClick={() => set({ name_glow: null })}>
                  <span className="h-0.5 w-4 rotate-45 rounded bg-faint" />
                </Swatch>
                {NAME_GLOWS.filter((g) => has(g.id, g.tier)).map((g) => (
                  <Swatch key={g.id} on={draft.name_glow === g.id} label={`${g.label} glow`} onClick={() => set({ name_glow: g.id })}>
                    <span className="h-5 w-5 rounded-full" style={{ background: g.color, boxShadow: `0 0 10px ${g.color}` }} />
                  </Swatch>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "bubbles" && (
          <Shelf wide empty={BUBBLE_STYLES.every((b) => !has(b.id, b.tier)) ? "bubbles" : null}>
            <Tile on={!draft.bubble_style} label="Default" onClick={() => set({ bubble_style: null })}>
              <MiniBubble id={null} text="hey" />
            </Tile>
            {BUBBLE_STYLES.filter((b) => has(b.id, b.tier)).map((b) => (
              <Tile key={b.id} on={draft.bubble_style === b.id} label={b.label} onClick={() => set({ bubble_style: b.id })}>
                <MiniBubble id={b.id} text="hey" />
              </Tile>
            ))}
          </Shelf>
        )}

        {tab === "nameplates" && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <PlateOption on={!draft.nameplate} label="None" onClick={() => set({ nameplate: null })}>
                <NameplateRow id={null} name={name} avatarUrl={me.avatar_url} hue={me.avatar_hue ?? 200} small />
              </PlateOption>
              {NAMEPLATES.filter((n) => has(n.id, n.tier)).map((n) => (
                <PlateOption key={n.id} on={draft.nameplate === n.id} label={n.label} onClick={() => set({ nameplate: n.id })}>
                  <NameplateRow id={n.id} name={name} avatarUrl={me.avatar_url} hue={me.avatar_hue ?? 200} small />
                </PlateOption>
              ))}
            </div>
            {NAMEPLATES.every((n) => !has(n.id, n.tier)) && (
              <p className="px-1 text-[13px] text-muted">
                No nameplates yet.{" "}
                <Link href="/marketplace" className="font-semibold text-foreground underline-offset-2 hover:underline">
                  Find some
                </Link>
              </p>
            )}
          </div>
        )}

      </section>

      <Link
        href="/marketplace"
        className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 transition active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <ShoppingBag size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Explore the Marketplace</span>
          <span className="block text-xs text-muted">New frames, bubbles, nameplates and themes</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </Link>
    </div>
  );
}

/** Put an owned item from the Marketplace's "Wear" straight onto the draft. */
export function withWorn(look: Look, id: string | null | undefined, has: (id: string, tier: Tier) => boolean): Look {
  if (!id) return look;
  const d = DECORATIONS.find((x) => x.id === id);
  if (d && has(d.id, d.tier)) return { ...look, avatar_decoration: d.id };
  const f = NAME_FONTS.find((x) => x.id === id);
  if (f && has(f.id, f.tier)) return { ...look, name_font: f.id };
  const g = NAME_GLOWS.find((x) => x.id === id);
  if (g && has(g.id, g.tier)) return { ...look, name_glow: g.id };
  const b = BUBBLE_STYLES.find((x) => x.id === id);
  if (b && has(b.id, b.tier)) return { ...look, bubble_style: b.id };
  const n = NAMEPLATES.find((x) => x.id === id);
  if (n && has(n.id, n.tier)) return { ...look, nameplate: n.id };
  return look;
}

function tabFor(id: string | null | undefined): Tab {
  if (!id) return "frames";
  if (id.startsWith("font-") || id.startsWith("glow-")) return "names";
  if (id.startsWith("bubble-")) return "bubbles";
  if (id.startsWith("plate-")) return "nameplates";
  return "frames";
}

function Shelf({ children, wide = false, empty = null }: { children: React.ReactNode; wide?: boolean; empty?: string | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-2.5 ${wide ? "grid-cols-3" : "grid-cols-4"}`}>{children}</div>
      {empty && (
        <p className="px-1 text-[13px] text-muted">
          No {empty} yet.{" "}
          <Link href="/marketplace" className="font-semibold text-foreground underline-offset-2 hover:underline">
            Find some
          </Link>
        </p>
      )}
    </div>
  );
}

function PlateOption({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`flex items-center gap-2 rounded-2xl border-2 p-0.5 text-left transition active:scale-[0.99] ${on ? "border-accent" : "border-transparent"}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <span className={`w-20 shrink-0 truncate pr-2 text-right text-[11px] ${on ? "font-semibold text-foreground" : "text-muted"}`}>{label}</span>
    </button>
  );
}

function Tile({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex min-w-0 flex-col items-center gap-1.5">
      <span
        className={`flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl border-2 bg-surface p-1.5 transition active:scale-95 ${
          on ? "border-accent" : "border-transparent"
        }`}
      >
        {children}
      </span>
      <span className={`w-full truncate text-center text-[11px] ${on ? "font-semibold text-foreground" : "text-muted"}`}>{label}</span>
    </button>
  );
}

function Swatch({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`flex h-11 w-11 items-center justify-center rounded-full border-2 bg-surface transition active:scale-95 ${
        on ? "border-accent" : "border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

/** One chat bubble in a bubble style, or the app's own when `id` is null. */
function MiniBubble({ id, text, className = "" }: { id: string | null; text: string; className?: string }) {
  const b = findBubbleStyle(id);
  const css = b ? bubbleCss(b.bubble) : null;
  return (
    <span
      className={`relative rounded-2xl rounded-br-md px-3 py-1.5 text-[13px] font-medium ${css ? css.className : "bg-accent text-accent-ink"} ${
        b?.decor ? "mt-3" : ""
      } ${className}`}
      style={css?.style}
    >
      {b?.decor && <ChatThemeDecor decor={b.decor} mine />}
      {text}
    </span>
  );
}
