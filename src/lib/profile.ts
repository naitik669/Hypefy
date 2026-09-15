import type { SupabaseClient } from "@supabase/supabase-js";

export type MascotMood =
  | "hype"
  | "curious"
  | "friendly"
  | "confused"
  | "proud"
  | "watching"
  | "calm"
  | "shocked"
  | "sleepy"
  | "thinking"
  | "welcome";

export type Profile = {
  id: string;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarHue: number | null;
  bannerId: string | null;
  bannerUrl: string | null;
  /** Two hex colours mixed into your own background — Premium. */
  profileColors: string[] | null;
  anthem: unknown;
  interests: string[];
  /** Profile-surface accent; see ./profile-accent.ts. */
  accentId: string | null;
  profileTags: string[];
  profileCompleted: boolean;
  isVerified: boolean;
  isPremium: boolean;
  nameFont: string | null;
  nameGlow: string | null;
  avatarDecoration: string | null;
  isAdmin: boolean;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  suspensionReason: string | null;
  /** Recorded server-side; null means we never asked. See migration 0053. */
  dateOfBirth: string | null;
};

export type Banner = { id: string; label: string; gradient: string };

export const BANNERS: Banner[] = [
  {
    id: "lime-pulse",
    label: "Lime Pulse",
    gradient:
      "radial-gradient(120% 150% at 25% -20%, rgba(163,230,53,0.40), transparent 55%), #0d0d0d",
  },
  {
    id: "purple-night",
    label: "Purple Night",
    gradient: "linear-gradient(135deg, #2a1a4a 0%, #140f24 60%, #0b0b14 100%)",
  },
  {
    id: "blue-signal",
    label: "Blue Signal",
    gradient:
      "radial-gradient(120% 150% at 80% -20%, rgba(56,151,240,0.45), transparent 55%), #0a0f1a",
  },
  {
    id: "neon-grid",
    label: "Neon Grid",
    gradient:
      "repeating-linear-gradient(0deg, transparent 0 21px, rgba(163,230,53,0.10) 21px 22px), repeating-linear-gradient(90deg, transparent 0 21px, rgba(163,230,53,0.10) 21px 22px), #0a0a0a",
  },
  {
    id: "creator-mode",
    label: "Creator Mode",
    gradient: "linear-gradient(120deg, #3a1a5a 0%, #1a2a6a 45%, #0a4a4a 100%)",
  },
  {
    id: "rainbow-glow",
    label: "Rainbow Glow",
    gradient:
      "radial-gradient(90% 140% at 15% -20%, rgba(255,255,255,0.18), transparent 55%), " +
      "linear-gradient(100deg, #ff2e63 0%, #ff9a3c 16%, #ffe45e 32%, #4ade80 48%, #38bdf8 64%, #a855f7 80%, #ff2e63 100%), " +
      "#0a0a0a",
  },
];

export const DEFAULT_BANNER_ID = "lime-pulse";

/** A colour someone picked: #rrggbb only, so it can go straight into CSS. */
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
}

/**
 * The background someone mixed themselves, top colour to bottom, or null.
 * Premium draws it; without Premium the profile falls back to its preset.
 */
export function customGradient(colors: unknown, isPremium = false): string | null {
  if (!isPremium || !Array.isArray(colors) || colors.length !== 2) return null;
  const [top, bottom] = colors;
  if (!isHexColor(top) || !isHexColor(bottom)) return null;
  return `linear-gradient(160deg, ${top} 0%, ${bottom} 100%)`;
}

/** An uploaded banner that is a GIF — animated banners come with Premium. */
export function isGifBanner(url: string | null | undefined): boolean {
  return !!url && /\.gif(\?|#|$)/i.test(url);
}

/**
 * The wash behind someone's whole profile — their own two colours, while
 * they have Premium. Null means the app's own background, as before.
 *
 * The stops are in pixels, not percentages, and end transparent: the colour
 * starts under the banner (which is opaque, so anything drawn behind it is
 * wasted), holds through the name and buttons, and has faded out by the
 * bottom of the header however tall that is. As the element's own
 * background it needs no extra layer that something could paint over.
 */
export function profileBackground(
  p: { profile_colors?: unknown; is_premium?: boolean | null },
): string | null {
  if (!customGradient(p.profile_colors, !!p.is_premium)) return null;
  const [top, bottom] = p.profile_colors as [string, string];
  return `linear-gradient(180deg, ${top} 96px, ${bottom} 72%, transparent 100%)`;
}

/** The preset gradient for a banner id, or the default for an unknown one. */
export function bannerGradient(id?: string | null): string {
  return (
    BANNERS.find((b) => b.id === id)?.gradient ??
    BANNERS.find((b) => b.id === DEFAULT_BANNER_ID)!.gradient
  );
}

/** Selectable identity/role tags shown as pills on profile. */
export const PROFILE_TAGS = [
  "Developer",
  "Designer",
  "Creator",
  "Gamer",
  "Founder",
  "Student",
  "Artist",
  "Photographer",
  "Animator",
  "Editor",
  "Writer",
  "Musician",
  "Meme Creator",
] as const;

export const INTERESTS = [
  "Memes",
  "Music",
  "Gaming",
  "Design",
  "Startups",
  "Coding",
  "Anime",
  "Editing",
  "Art",
  "Fitness",
  "Study",
  "Tech",
  "Creators",
  "Movies",
] as const;

/**
 * Keep only real interests, deduped and capped.
 *
 * These reach the feed ranker, so an arbitrary client string would become
 * a ranking input nobody can see or audit. Unknown values are dropped
 * rather than rejected — a stale client sending a retired interest should
 * save the rest, not fail the whole edit.
 */
export function sanitizeInterests(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = INTERESTS as readonly string[];
  return [...new Set(input.filter((i): i is string => typeof i === "string"))]
    .filter((i) => allowed.includes(i))
    .slice(0, INTERESTS.length);
}

/** Deterministic avatar hue from a string id so users get a stable color. */
export function hueFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProfile(row: any): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    avatarHue: row.avatar_hue,
    bannerId: row.banner_id,
    bannerUrl: row.banner_url,
    profileColors: (row.profile_colors as string[] | null) ?? null,
    anthem: row.anthem ?? null,
    interests: row.interests ?? [],
    accentId: (row as { accent_id?: string | null }).accent_id ?? null,
    profileTags: row.profile_tags ?? [],
    profileCompleted: row.profile_completed ?? false,
    isVerified: row.is_verified ?? false,
    isPremium: row.is_premium ?? false,
    nameFont: row.name_font ?? null,
    nameGlow: row.name_glow ?? null,
    avatarDecoration: row.avatar_decoration ?? null,
    isAdmin: row.is_admin ?? false,
    suspendedAt: row.suspended_at ?? null,
    suspendedUntil: row.suspended_until ?? null,
    suspensionReason: row.suspension_reason ?? null,
    dateOfBirth: row.date_of_birth ?? null,
  };
}

/** Fetch the signed-in user's profile (server or client supabase client). */
export async function getProfile(
  supabase: SupabaseClient
): Promise<Profile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data ? mapProfile(data) : null;
}
