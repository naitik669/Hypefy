"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isHexColor, sanitizeInterests } from "@/lib/profile";
import { ACCENTS, DEFAULT_ACCENT_ID } from "@/lib/profile-accent";

export type UpdateProfileInput = {
  username: string;
  displayName: string;
  bio: string;
  profileTags: string[];
  interests?: string[];
  accentId?: string | null;
  avatarHue: number;
  avatarUrl?: string | null;
  bannerId?: string | null;
  bannerUrl?: string | null;
  /** [top, bottom] hex colours for your own background — Premium. */
  bannerColors?: string[] | null;
};

export async function updateProfile(
  input: UpdateProfileInput
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Sign in and try again." };

  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) {
    return { error: "Pick a valid username (3–20 chars, a–z 0–9 . _)." };
  }
  if (!input.displayName.trim()) {
    return { error: "Add a display name." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      display_name: input.displayName.trim(),
      bio: input.bio.trim() || null,
      profile_tags: input.profileTags,
      interests: sanitizeInterests(input.interests ?? []),
      // Fall back rather than reject: a stale client sending a retired
      // accent should still save the rest of the edit.
      accent_id: ACCENTS.some((a) => a.id === input.accentId)
        ? (input.accentId as string)
        : DEFAULT_ACCENT_ID,
      avatar_hue: input.avatarHue,
      avatar_url: input.avatarUrl ?? null,
      banner_id: input.bannerId ?? null,
      banner_url: input.bannerUrl ?? null,
      // Two hex colours or nothing. The database checks the shape too, and a
      // trigger refuses them outright without Premium.
      banner_colors:
        Array.isArray(input.bannerColors) &&
        input.bannerColors.length === 2 &&
        input.bannerColors.every(isHexColor)
          ? input.bannerColors
          : null,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { error: "That username is taken. Try another." };
    }
    return { error: error.message };
  }

  revalidatePath("/profile");
  revalidatePath(`/u/${username}`);
  // Home is the RSC that turns interests into the ranker's interest set.
  revalidatePath("/home");
  return { ok: true };
}

/**
 * Interests on their own, for the in-feed nudge.
 *
 * A server action rather than a client update, and not for tidiness: only
 * a server action can revalidatePath("/home"), and /home is where
 * interests are read and handed to feedScore. Writing this from the client
 * would save the row and leave the cached feed exactly as it was, so the
 * whole feature would appear to do nothing.
 */
export async function updateInterests(
  interests: string[]
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Sign in and try again." };

  const { error } = await supabase
    .from("profiles")
    .update({ interests: sanitizeInterests(interests) })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/home");
  revalidatePath("/profile");
  return { ok: true };
}
