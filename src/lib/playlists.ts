import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTrack, type Track } from "@/lib/track";

/**
 * Playlists: what used to be folders, now able to hold sounds and to be
 * shared. The database rules are in 0128; this is the reading of its rows
 * and the calls the screens make.
 *
 * Who is what:
 *   owner    made it. Can delete it, and invite or remove people.
 *   editor   accepted an invitation. Can add and remove things, and change
 *            its name and look. Can leave.
 */

type Db = Pick<SupabaseClient, "from" | "rpc">;

export type PlaylistRole = "owner" | "editor";

export type PlaylistPerson = {
  id: string;
  name: string;
  username: string | null;
  hue: number;
  avatarUrl: string | null;
};

export type PlaylistMember = PlaylistPerson & { status: "joined" | "invited"; isOwner: boolean };

export type PlaylistInvite = {
  playlistId: string;
  name: string;
  emoji: string | null;
  itemCount: number;
  owner: PlaylistPerson;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);

function person(r: Row, p = ""): PlaylistPerson {
  const username = str(r[`${p}username`]);
  return {
    id: String(r.id ?? ""),
    name: str(r[`${p}name`]) ?? username ?? "User",
    username,
    hue: Number(r[p ? `${p}hue` : "avatar_hue"]) || 280,
    avatarUrl: str(r[p ? `${p}avatar` : "avatar_url"]),
  };
}

export function toMembers(data: unknown): PlaylistMember[] {
  if (!Array.isArray(data)) return [];
  const rows = (data as Row[]).map((r) => ({
    ...person(r),
    status: r.status === "invited" ? ("invited" as const) : ("joined" as const),
    isOwner: r.is_owner === true,
  }));
  // The owner, then who joined, then who has yet to answer.
  const rank = (m: PlaylistMember) => (m.isOwner ? 0 : m.status === "joined" ? 1 : 2);
  return rows.sort((a, b) => rank(a) - rank(b));
}

export function toInvites(data: unknown): PlaylistInvite[] {
  if (!Array.isArray(data)) return [];
  return (data as Row[]).flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const playlistId = str(r.collection_id);
    const name = str(r.name);
    if (!playlistId || !name) return [];
    return [
      {
        playlistId,
        name,
        emoji: str(r.emoji),
        itemCount: Number(r.item_count) || 0,
        owner: { ...person(r, "owner_"), id: "" },
      },
    ];
  });
}

/** "@maya" where there is a handle, the name where there is not. */
export function whoIs(p: { username: string | null; name: string }): string {
  return p.username ? `@${p.username}` : p.name;
}

/** "Shared with 2", "Shared by @maya", or nothing for a playlist of your own. */
export function sharedLine(f: { isOwner: boolean; memberCount: number; ownerUsername: string | null }): string | null {
  if (!f.isOwner) return f.ownerUsername ? `Shared by @${f.ownerUsername}` : "Shared with you";
  return f.memberCount > 0 ? `Shared with ${f.memberCount}` : null;
}

/** What the database said, where it is written to be read; else one plain line. */
const SAYABLE = [
  "Only the playlist's owner can invite",
  "You can invite people you follow who follow you back",
  "This playlist is full",
  "That invitation is gone",
  "Only the playlist's owner can remove people",
];
export function playlistError(message: string | null | undefined, fallback: string): string {
  return SAYABLE.find((m) => message?.includes(m)) ?? fallback;
}

// ── Sounds in a playlist ───────────────────────────────────────────────

export type PlaylistSound = { track: Track; addedAt: string };

/** The sound rows of a playlist, newest first. */
export async function loadPlaylistSounds(supabase: Db, playlistId: string): Promise<PlaylistSound[]> {
  const { data } = await supabase
    .from("collection_items")
    .select("track, created_at")
    .eq("collection_id", playlistId)
    .not("track_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as Row[]).flatMap((r) => {
    const track = parseTrack(r.track);
    return track ? [{ track, addedAt: String(r.created_at ?? "") }] : [];
  });
}

export async function removePlaylistSound(supabase: Db, playlistId: string, trackId: string): Promise<boolean> {
  const { error } = await supabase
    .from("collection_items")
    .delete()
    .eq("collection_id", playlistId)
    .eq("track_id", trackId);
  return !error;
}

/** Which of these playlists already hold this sound. */
export async function playlistsHolding(supabase: Db, trackId: string): Promise<Set<string>> {
  const { data } = await supabase.from("collection_items").select("collection_id").eq("track_id", trackId);
  return new Set(((data ?? []) as Row[]).map((r) => String(r.collection_id)));
}

/** Put a sound in exactly these playlists (and keep it in your Library). */
export async function setSoundPlaylists(supabase: Db, track: Track, playlistIds: string[]): Promise<boolean> {
  const { error } = await supabase.rpc("set_sound_playlists", { p_track: track, p_folders: playlistIds });
  return !error;
}

// ── People ─────────────────────────────────────────────────────────────

export async function loadMembers(supabase: Db, playlistId: string): Promise<PlaylistMember[]> {
  const { data } = await supabase.rpc("playlist_members", { p_collection: playlistId });
  return toMembers(data);
}

export async function loadCandidates(supabase: Db, playlistId: string): Promise<PlaylistPerson[]> {
  const { data } = await supabase.rpc("playlist_invite_candidates", { p_collection: playlistId });
  return Array.isArray(data) ? (data as Row[]).map((r) => person(r)) : [];
}

/** Null when it worked; otherwise what to say. */
export async function invite(supabase: Db, playlistId: string, userId: string): Promise<string | null> {
  const { error } = await supabase.rpc("invite_to_playlist", { p_collection: playlistId, p_user: userId });
  return error ? playlistError(error.message, "Couldn't invite them. Try again.") : null;
}

export async function answerInvite(supabase: Db, playlistId: string, accept: boolean): Promise<string | null> {
  const { error } = await supabase.rpc("respond_playlist_invite", { p_collection: playlistId, p_accept: accept });
  return error ? playlistError(error.message, "Couldn't do that. Try again.") : null;
}

/** Leave (no `userId`), or as the owner remove someone or take back an invitation. */
export async function removeMember(supabase: Db, playlistId: string, userId?: string): Promise<string | null> {
  const { error } = await supabase.rpc("remove_playlist_member", {
    p_collection: playlistId,
    ...(userId ? { p_user: userId } : {}),
  });
  return error ? playlistError(error.message, "Couldn't do that. Try again.") : null;
}

// ── Playing a playlist's sounds, one after another ─────────────────────

/**
 * Which sound comes next, given what just stopped. Null at the end: a
 * playlist plays through once and stops, it does not go round.
 */
export function nextInQueue(ids: string[], justPlayed: string | null): string | null {
  if (!justPlayed) return ids[0] ?? null;
  const at = ids.indexOf(justPlayed);
  return at >= 0 && at < ids.length - 1 ? ids[at + 1] : null;
}
