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
  currentVibe: string | null;
  interests: string[];
  profileCompleted: boolean;
};

export type Banner = { id: string; label: string; gradient: string };

export const BANNERS: Banner[] = [
  {
    id: "lime-pulse",
    label: "Lime Pulse",
    gradient:
      "radial-gradient(120% 150% at 25% -20%, rgba(200,255,0,0.40), transparent 55%), #0d0d0d",
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
      "repeating-linear-gradient(0deg, transparent 0 21px, rgba(200,255,0,0.10) 21px 22px), repeating-linear-gradient(90deg, transparent 0 21px, rgba(200,255,0,0.10) 21px 22px), #0a0a0a",
  },
  {
    id: "creator-mode",
    label: "Creator Mode",
    gradient:
      "linear-gradient(120deg, #3a1a5a 0%, #1a2a6a 45%, #0a4a4a 100%)",
  },
];

export const DEFAULT_BANNER_ID = "lime-pulse";

export function bannerGradient(id?: string | null): string {
  return (
    BANNERS.find((b) => b.id === id)?.gradient ??
    BANNERS.find((b) => b.id === DEFAULT_BANNER_ID)!.gradient
  );
}

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
    currentVibe: row.current_vibe,
    interests: row.interests ?? [],
    profileCompleted: row.profile_completed ?? false,
  };
}

/** Fetch the signed-in user's profile (server or client supabase client). */
export async function getProfile(
  supabase: SupabaseClient,
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
