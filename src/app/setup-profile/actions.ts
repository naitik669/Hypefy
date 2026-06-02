"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SaveProfileInput = {
  username: string;
  displayName: string;
  bio: string;
  currentVibe: string;
  avatarHue: number;
};

export async function saveProfile(
  input: SaveProfileInput,
): Promise<{ error: string } | void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

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
      current_vibe: input.currentVibe.trim() || null,
      avatar_hue: input.avatarHue,
      // Banner not set during onboarding — uses default lime-pulse
      profile_completed: true,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return { error: "That username is taken. Try another." };
    }
    return { error: error.message };
  }

  redirect("/home");
}

export async function checkUsername(
  username: string,
  userId: string,
): Promise<"available" | "taken" | "invalid"> {
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) return "invalid";

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (data && data.id !== userId) return "taken";
  return "available";
}
