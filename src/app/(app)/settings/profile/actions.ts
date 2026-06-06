"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type UpdateProfileInput = {
  username: string;
  displayName: string;
  bio: string;
  profileTags: string[];
  avatarHue: number;
  avatarUrl?: string | null;
  bannerId?: string | null;
  bannerUrl?: string | null;
};

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
      avatar_hue: input.avatarHue,
      avatar_url: input.avatarUrl ?? null,
      banner_id: input.bannerId ?? null,
      banner_url: input.bannerUrl ?? null,
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
  return { ok: true };
}
