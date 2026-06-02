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
      className="flex h-10 items-center justify-center rounded-xl border border-border/60 bg-surface px-4 text-sm font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger active:scale-[0.99]"
    >
      Sign out
    </button>
  );
}
