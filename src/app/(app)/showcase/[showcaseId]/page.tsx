import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ShowViewer, type ShowItem } from "@/components/shows/ShowViewer";

/**
 * Playing a Showcase board.
 *
 * Reuses ShowViewer rather than growing a second story player: the progress
 * bars, the tap-to-advance, the hold-to-pause and the timing are all already
 * built and already correct here, and a board item is the same shape as a
 * Show once resolved — media, caption, author.
 *
 * The ⋯ menu is hidden (hideMenu). Every action in it writes to a row in
 * `shows`, so on a board entry it would act on the source rather than the
 * entry — and on an uploaded item, which has no `shows` row at all, it would
 * silently do nothing. Managing a board belongs to the board.
 *
 * RLS does the access control: a private account's boards are invisible to a
 * non-follower, so an empty result and a board that does not exist are the
 * same 404 here on purpose. Saying "this is private" would confirm it exists.
 */
export default async function ShowcasePage({
  params,
}: {
  params: Promise<{ showcaseId: string }>;
}) {
  const { showcaseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: board } = await supabase
    .from("showcases")
    .select("id, user_id, title")
    .eq("id", showcaseId)
    .maybeSingle();
  if (!board) notFound();

  const [{ data: rows }, { data: owner }] = await Promise.all([
    supabase
      .from("showcase_items")
      .select(
        "id, kind, media_url, poster_url, caption, position, created_at, shows(id, media_url, caption, created_at, track), shots(id, media_url, poster_url, caption, created_at, track)"
      )
      .eq("showcase_id", showcaseId)
      .order("position")
      .order("created_at"),
    supabase
      .from("profiles")
      .select("display_name, username, avatar_hue, avatar_url")
      .eq("id", board.user_id)
      .maybeSingle(),
  ]);

  const items: ShowItem[] = ((rows ?? []) as Record<string, unknown>[]).flatMap(
    (r): ShowItem[] => {
      const show = r.shows as Record<string, unknown> | null;
      const shot = r.shots as Record<string, unknown> | null;
      const src = show ?? shot;

      // A referenced Show or Shot that has been deleted or moderated away
      // comes back null through the embed, and the board must not render a
      // gap where it was. This is the reason items are references rather than
      // copies of the media.
      const media =
        (r.media_url as string | null) ??
        (src?.media_url as string | null) ??
        null;
      if (!media) return [];

      return [
        {
          // The ITEM's id, not the source's: two boards can hold the same Show,
          // and ShowViewer keys its screens on this.
          id: r.id as string,
          user_id: board.user_id as string,
          media_url: media,
          caption:
            (r.caption as string | null) ??
            (src?.caption as string | null) ??
            null,
          created_at:
            (src?.created_at as string | null) ?? (r.created_at as string),
          track: src?.track ?? null,
          profiles: (owner as ShowItem["profiles"]) ?? null,
        },
      ];
    }
  );

  if (items.length === 0) notFound();

  return <ShowViewer shows={items} currentUserId={user?.id ?? null} hideMenu />;
}
