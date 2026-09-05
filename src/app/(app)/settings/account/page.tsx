import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SignOutButton } from "@/components/SignOutButton";
import { AccountForms } from "@/components/settings/AccountForms";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { DataExport } from "@/components/settings/DataExport";
import { SpotifyConnect } from "@/components/settings/SpotifyConnect";
import { spotifyEnv } from "@/lib/spotify";

export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  // SpotifyConnect was fully written and imported by nothing, while every API
  // route it needs already existed. It is mounted here — but only when the
  // credentials are actually configured, since without them the connect
  // button opens a flow that cannot finish.
  const spotifyConfigured = !!spotifyEnv().clientId;
  let spotify: { connected: boolean; is_premium: boolean; display_name: string | null } | null =
    null;
  if (spotifyConfigured) {
    const { data } = await supabase.rpc("spotify_connection_status");
    spotify = (Array.isArray(data) ? data[0] : data) ?? null;
  }

  const result = (await searchParams).spotify;

  return (
    <>
      <PageHeader title="Account" showBack />
      <div className="flex flex-col gap-6 px-5 pb-10 pt-4">
        <AccountForms currentEmail={user.email ?? ""} />
        {spotifyConfigured && (
          <SpotifyConnect
            connected={!!spotify?.connected}
            isPremium={!!spotify?.is_premium}
            displayName={spotify?.display_name ?? null}
            result={typeof result === "string" ? result : null}
          />
        )}
        <DataExport />
        <SignOutButton />
        <DeleteAccount username={(profile as any)?.username ?? null} />
      </div>
    </>
  );
}
