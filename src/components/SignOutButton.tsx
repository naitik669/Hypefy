"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex h-11 items-center justify-center rounded-pill border border-white/10 bg-white/[0.06] px-6 text-sm font-semibold text-foreground transition hover:bg-white/[0.1] active:scale-[0.99]"
    >
      Sign out
    </button>
  );
}
