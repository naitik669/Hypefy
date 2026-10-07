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

/** An uploaded banner that is a GIF — animated banners come with Premium. */
export function isGifBanner(url: string | null | undefined): boolean {
  return !!url && /\.gif(\?|#|$)/i.test(url);
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

/**
 * Every column of `profiles` the app may read off the table, its own row or
 * anyone's. The rest (date of birth, admin, why an account is suspended, who
 * referred whom, notification preferences) are not readable there at all,
 * by anyone: see migration 0130. Their owner gets them from
 * getPrivateProfile.
 *
 * A new column has to be added here AND granted in a migration before it can
 * be read. `select("*")` on profiles is refused by the database.
 */
export const PUBLIC_PROFILE_COLUMNS =
  "id, username, display_name, bio, avatar_url, avatar_hue, banner_id, banner_url, current_vibe, interests, profile_completed, created_at, updated_at, profile_tags, is_private, dm_privacy, last_seen_at, show_activity, is_verified, anthem, hide_read_receipts, card_layout, card_theme, accent_id, suspended_at, suspended_until, is_premium, badge_revoked, name_font, name_glow, avatar_decoration, bubble_style, nameplate, banner_color_1, banner_color_2, profile_colors, show_hypes";

/** The signed-in person's own private fields. */
export type PrivateProfile = {
  dateOfBirth: string | null;
  isAdmin: boolean;
  suspensionReason: string | null;
  notifPrefs: Record<string, unknown>;
  /** How many people joined with their invite. */
  referralCount: number;
};

/** What my_private_profile() hands back, read without trusting its shape. */
export function parsePrivateProfile(raw: unknown): PrivateProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const prefs = r.notif_prefs;
  return {
    dateOfBirth: typeof r.date_of_birth === "string" ? r.date_of_birth : null,
    isAdmin: r.is_admin === true,
    suspensionReason: typeof r.suspension_reason === "string" ? r.suspension_reason : null,
    notifPrefs: prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Record<string, unknown>) : {},
    referralCount: typeof r.referral_count === "number" ? r.referral_count : 0,
  };
}

/** The signed-in person's private fields, or null when signed out or it failed. */
export async function getPrivateProfile(supabase: SupabaseClient): Promise<PrivateProfile | null> {
  const { data, error } = await supabase.rpc("my_private_profile");
  if (error) return null;
  return parsePrivateProfile(data);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapProfile(row: any, mine: PrivateProfile | null): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    avatarHue: row.avatar_hue,
    bannerId: row.banner_id,
    bannerUrl: row.banner_url,
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
    isAdmin: mine?.isAdmin ?? false,
    suspendedAt: row.suspended_at ?? null,
    suspendedUntil: row.suspended_until ?? null,
    suspensionReason: mine?.suspensionReason ?? null,
    dateOfBirth: mine?.dateOfBirth ?? null,
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

  const [{ data }, mine] = await Promise.all([
    supabase.from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", user.id).maybeSingle(),
    getPrivateProfile(supabase),
  ]);

  return data ? mapProfile(data, mine) : null;
}
