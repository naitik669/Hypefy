"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, Globe, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AudiencePicker, type AudienceOption } from "@/components/diary/AudiencePicker";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Avatar } from "@/components/ui/Avatar";
import { SHOW_AUDIENCES, type ShowAudience } from "@/lib/show-audience";

/**
 * Who a Show goes to, on the screen where it is posted.
 *
 * Two controls that answer two different questions. The picker is the
 * room: everybody, or your Hypers. "Hide from" is the exception, which
 * is the one people actually reach for and which no list can express —
 * you do not want a list of everybody-except-one, you want this one
 * post kept from one person.
 *
 * The exclusion list is drawn from whoever the room currently holds, so
 * switching to Hypers narrows what there is to hide from. Anybody
 * already picked who is no longer in the room is dropped rather than
 * kept invisibly: a hidden-from entry for somebody who cannot see it
 * anyway is a promise about nothing.
 */

const OPTIONS: readonly AudienceOption<ShowAudience>[] = [
  { value: "everyone", label: "Everyone", hint: "Anybody who can already see you", Icon: Globe },
  { value: "hypers", label: "Hype buddies", hint: "Only your closest people", Icon: Star, narrow: true },
];

/** Somebody who would otherwise see it. */
export type Candidate = { id: string; name: string; username: string | null; hue: number; avatarUrl: string | null };

export function ShowAudienceBar({
  userId,
  audience,
  onAudience,
  hidden,
  onHidden,
  compact = false,
}: {
  userId: string;
  audience: ShowAudience;
  onAudience: (next: ShowAudience) => void;
  /** Ids kept from seeing it. */
  hidden: string[];
  onHidden: (next: string[]) => void;
  /**
   * Only the "Hide from" control, as a small square: the Show preview
   * chooses the room with its two share buttons instead of a picker.
   */
  compact?: boolean;
}) {
  const [supabase] = useState(createClient);
  const [sheet, setSheet] = useState(false);
  /**
   * Who is in the room, and which room they were read for.
   *
   * Kept together rather than blanking the list the moment the
   * audience changes: clearing it in the effect body is a setState
   * during render by another name, and the lint rule that catches it
   * is right — the loading state is derivable, so it is derived.
   */
  const [found, setFound] = useState<{ room: ShowAudience; people: Candidate[] } | null>(null);
  const people = found?.room === audience ? found.people : null;

  const load = useCallback(async () => {
    const rows =
      audience === "hypers"
        ? await supabase
            .from("close_friends")
            .select("profile:profiles!close_friends_friend_id_fkey(id, display_name, username, avatar_hue, avatar_url)")
            .eq("user_id", userId)
            .limit(500)
        : await supabase
            .from("follows")
            .select("profile:profiles!follows_follower_id_fkey(id, display_name, username, avatar_hue, avatar_url)")
            .eq("following_id", userId)
            .limit(500);

    return (rows.data ?? []).flatMap((r) => {
      const raw = (r as { profile: unknown }).profile;
      const p = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | null;
      if (!p) return [];
      return [
        {
          id: p.id as string,
          name: (p.display_name as string) ?? (p.username as string) ?? "User",
          username: (p.username as string) ?? null,
          hue: (p.avatar_hue as number) ?? 280,
          avatarUrl: (p.avatar_url as string) ?? null,
        },
      ];
    });
  }, [supabase, userId, audience]);

  // Reloaded whenever the room changes, because the room is what there
  // is to hide from.
  useEffect(() => {
    let dropped = false;
    void load().then((room) => {
      if (dropped) return;
      setFound({ room: audience, people: room });
      // Anybody no longer in the room stops being an exclusion.
      const inRoom = new Set(room.map((p) => p.id));
      const kept = hidden.filter((id) => inRoom.has(id));
      if (kept.length !== hidden.length) onHidden(kept);
    });
    return () => {
      dropped = true;
    };
    // `hidden` and `onHidden` are read, not watched: this runs when the
    // room changes, and watching the list it prunes would re-run it on
    // its own result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, audience]);

  const count = hidden.length;

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label={count ? `Hidden from ${count} ${count === 1 ? "person" : "people"}` : "Hide from somebody"}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-white/[0.09] text-white transition active:scale-95"
        >
          <EyeOff size={18} className={count ? "text-accent" : ""} />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-accent-ink">
              {count}
            </span>
          )}
        </button>
      ) : (
      <div className="flex items-center gap-2">
        <AudiencePicker<ShowAudience> value={audience} onChange={onAudience} options={OPTIONS} />
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label={count ? `Hidden from ${count} ${count === 1 ? "person" : "people"}` : "Hide from somebody"}
          className="flex h-12 items-center gap-2 rounded-2xl bg-white/[0.07] px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.1]"
        >
          <EyeOff size={15} className={count ? "text-accent" : "text-white/75"} />
          {count ? `Hidden from ${count}` : "Hide from"}
        </button>
      </div>
      )}

      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Hide this Show from" size="tall">
        <div className="space-y-1 px-4 pb-4">
          <p className="pb-2 text-xs text-muted">
            {audience === "hypers"
              ? "Your Hype buddies are the only people this Show goes to. Leave any of them out."
              : "Anybody here could see this Show. Leave any of them out."}
          </p>
          {people === null && <p className="py-8 text-center text-sm text-muted">Finding them…</p>}
          {people !== null && people.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              {audience === "hypers" ? "You have no Hype buddies yet." : "Nobody follows you yet."}
            </p>
          )}
          {(people ?? []).map((person) => {
            const off = hidden.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                aria-pressed={off}
                onClick={() =>
                  onHidden(off ? hidden.filter((id) => id !== person.id) : [...hidden, person.id])
                }
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
              >
                <Avatar name={person.name} hue={person.hue} size={36} src={person.avatarUrl ?? undefined} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{person.name}</span>
                  {person.username && (
                    <span className="block truncate text-xs text-muted">@{person.username}</span>
                  )}
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    off ? "border-accent bg-accent text-accent-ink" : "border-border text-transparent"
                  }`}
                >
                  <EyeOff size={13} />
                </span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}

/** Guard against a value from somewhere other than the picker. */
export function isShowAudience(value: unknown): value is ShowAudience {
  return SHOW_AUDIENCES.some((a) => a === value);
}
