"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Turn creator mode on or off.
 *
 * It unlocks the dashboard and changes nothing anybody else can see — no
 * badge, no category, no difference to how your profile reads. Turning it
 * off hides the dashboard and deletes nothing: the numbers carry on being
 * recorded because they are recorded about everybody, and come straight
 * back if it is turned on again. Said here because "off" implying "and
 * stop counting" would be a reasonable thing to assume and is not true.
 */
export async function setCreatorMode(on: boolean): Promise<{ error: string } | { ok: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Sign in and try again." };

  const { error } = await supabase
    .from("profiles")
    .update({ creator_mode: on })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/creator");
  revalidatePath("/settings");
  return { ok: true };
}
