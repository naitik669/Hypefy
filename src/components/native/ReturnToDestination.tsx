"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { takeReturnPath } from "@/lib/return-path";

/**
 * Finishes the journey a sign-in interrupted.
 *
 * Password sign-in reads the noted destination itself and goes straight
 * there. Every other way in (Google, the app's own return link, a saved
 * account) ends at Home through routes that know nothing about it, so Home
 * checks once on arrival and moves on if something is waiting.
 *
 * Renders nothing. See src/lib/return-path.ts.
 */
export function ReturnToDestination() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/home") return;
    const next = takeReturnPath();
    if (next) router.replace(next);
  }, [pathname, router]);

  return null;
}
