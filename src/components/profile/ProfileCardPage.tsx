"use client";

import { useRouter } from "next/navigation";
import { ProfileCard, type ProfileCardData } from "@/components/profile/ProfileCard";
import { safeBack } from "@/lib/safe-back";

/**
 * The profile card, as a page.
 *
 * The card is a full-screen portal with its own chrome, so it needs no
 * re-skinning to be a route — only somewhere sensible to go when it closes.
 * Closing falls back to the profile rather than /home, because arriving here
 * from a shared link means the card IS the first history entry and back would
 * otherwise leave the person entirely.
 */
export function ProfileCardPage({ data, startEditing = false }: { data: ProfileCardData; startEditing?: boolean }) {
  const router = useRouter();
  const fallback = data.username ? `/u/${data.username}` : "/home";
  return <ProfileCard data={data} startEditing={startEditing} onClose={() => safeBack(router, fallback)} />;
}
