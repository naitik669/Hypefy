import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateScreen, type CreateMode } from "@/components/create/CreateScreen";
import { findSound } from "@/lib/sound-lookup";

/**
 * The creator.
 *
 * This route used to be an orphaned menu of three cards that nothing linked
 * to — the (+) button had long since been replaced by CreateSheet, and this
 * page was left behind. It is now the fullscreen camera-first screen, and
 * (+) pushes straight here.
 */
const MODES = ["shot", "show"] as const;

/** Only a mode this screen actually has; anything else falls back to Shot. */
function parseMode(v: string | string[] | undefined): CreateMode {
  const s = Array.isArray(v) ? v[0] : v;
  return (MODES as readonly string[]).includes(s ?? "")
    ? (s as CreateMode)
    : "shot";
}

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[]; sound?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/signin");

  const { mode, sound } = await searchParams;

  // A post is written, not filmed. This screen is a camera, so Post never
  // belonged on it — it had a video picker and a button whose only job was to
  // leave. Old links and shortcuts still arrive here, so send them on.
  const asked = Array.isArray(mode) ? mode[0] : mode;
  if (asked === "post") redirect("/create/post");

  // Live is not built. Its shortcut still lands here, on Shot, with the note
  // that says so pointing at the Live tab.
  // "Use this sound" on a sound's page arrives with the song's id. The song
  // itself is read from something already made with it; if nothing this
  // person can see uses it any more, they simply start without one.
  const soundId = Array.isArray(sound) ? sound[0] : sound;
  const found = soundId ? await findSound(supabase, soundId) : null;

  return (
    <CreateScreen
      userId={user.id}
      initialMode={found ? "shot" : parseMode(mode)}
      askedForLive={asked === "live"}
      initialTrack={found?.track ?? null}
    />
  );
}
