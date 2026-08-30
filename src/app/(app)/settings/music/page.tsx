import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SpotifyConnect } from "@/components/settings/SpotifyConnect";

export default async function MusicSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ spotify?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { spotify } = await searchParams;

  const { data } = await supabase.rpc("spotify_connection_status");
  const status = Array.isArray(data) ? data[0] : data;

  return (
    <>
      <PageHeader title="Music" showBack />
      <div className="flex flex-col gap-6 px-4 pb-10 pt-3">
        <section>
          <p className="mb-1 px-1 text-xs font-bold uppercase tracking-widest text-faint">
            Spotify
          </p>
          <SpotifyConnect
            connected={!!status?.connected}
            isPremium={!!status?.is_premium}
            displayName={status?.display_name ?? null}
            result={spotify ?? null}
          />
        </section>
      </div>
    </>
  );
}
