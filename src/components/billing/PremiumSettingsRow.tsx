import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { VerifiedStar } from "@/components/ui/VerifiedStar";

/** Top of Settings: the way into Premium, or into managing it. */
export async function PremiumSettingsRow() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("profiles").select("is_premium, is_verified").eq("id", user.id).maybeSingle()
    : { data: null };

  const member = !!me?.is_premium || !!me?.is_verified;
  const href = member ? "/settings/subscription" : "/premium";
  const title = me?.is_premium ? "Hypefy Premium" : me?.is_verified ? "Verified" : "Get Hypefy Premium";
  const sub = member ? "Manage your plan" : "Badge, name styles, chat themes · 7 days free";

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-verified/25 bg-[linear-gradient(110deg,rgba(56,151,240,0.16),rgba(163,230,53,0.06))] px-3 py-3.5 transition-colors active:bg-white/[0.05]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-verified/15">
        <VerifiedStar className="h-6 w-6 text-verified" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-faint" />
    </Link>
  );
}
