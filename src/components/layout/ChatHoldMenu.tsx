"use client";

import { useCallback, useRef, useState } from "react";
import { MessageSquarePlus, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NavHoldMenu, type HoldAction } from "@/components/layout/NavHoldMenu";

/** How many faces the stack shows. Five is the reach of a thumb, not a limit. */
const MAX_RECENTS = 5;
/** Refetch after this long — a stack of stale chats is worse than a slow one. */
const STALE_MS = 60_000;

/**
 * Nothing to jump to yet. Shown only when there are genuinely no
 * conversations, so the gesture teaches itself instead of dead-ending.
 */
const EMPTY_FALLBACK: HoldAction[] = [
  { icon: MessageSquarePlus, label: "New chat", href: "/messages/new" },
  { icon: Phone, label: "Calls", href: "/calls" },
];

/**
 * Hold the chat tab to jump straight into a conversation.
 *
 * Ranked pins first, then recency. Recency alone is the wrong order for a
 * shortcut: the people you talk to constantly are already at the top of the
 * inbox, so a shortcut that repeats that ordering saves nothing, while the
 * thread you pinned is the one you decided you keep coming back to. Five pins
 * fill the stack on their own; fewer, and the newest threads take the rest.
 *
 * The same hold-and-slide as Home and the profile tab, so the nav bar has one
 * idiom rather than three. What differs is the payload: these are people, and
 * they are fetched, not hardcoded.
 *
 * Fetching is deferred to the first press — NavHoldMenu's `onArm` fires at
 * touch-down, which buys the whole HOLD_MS before the stack is on screen, and
 * that is usually enough for three small indexed reads on a warm connection. A
 * session that never holds the tab never pays for the query at all. If it does
 * lose the race the menu simply doesn't open, which reads as a plain tap
 * through to the inbox — the destination the person was heading for anyway.
 */
export function ChatHoldMenu({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: React.ReactNode;
}) {
  const [actions, setActions] = useState<HoldAction[]>([]);
  const fetchedAt = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    if (Date.now() - fetchedAt.current < STALE_MS) return;
    inFlight.current = true;
    try {
      const supabase = createClient();

      // What I have pinned, and what is merely recent. Two independent reads,
      // so they go together — the hold buys about 320ms and this is round one
      // of two.
      //
      // RLS already restricts both to conversations I belong to. The recent
      // page over-fetches: blocked threads, unaccepted requests and pins
      // filtered out below would otherwise eat into the five.
      const [pinnedRes, recentRes] = await Promise.all([
        supabase
          .from("conversation_members")
          .select("conversation_id, pinned_at")
          .eq("user_id", currentUserId)
          .not("pinned_at", "is", null)
          .order("pinned_at", { ascending: false })
          .limit(MAX_RECENTS),
        supabase
          .from("conversations")
          .select("id, type, title, last_message_at")
          .order("last_message_at", { ascending: false })
          .limit(MAX_RECENTS + 5),
      ]);

      type Conv = {
        id: string;
        type: string | null;
        title: string | null;
        last_message_at: string | null;
      };
      const byId = new Map<string, Conv>();
      ((recentRes.data ?? []) as Conv[]).forEach((c) => byId.set(c.id, c));

      const pinnedIds = (pinnedRes.data ?? []).map((r) => r.conversation_id);
      // A pinned thread can be quiet enough to fall outside the recent page,
      // and pinning it is exactly the statement that it should not have to
      // compete on recency. Fetch the ones that page missed.
      const missingIds = pinnedIds.filter((id) => !byId.has(id));

      // Pins first, in the order they were pinned; recency fills whatever is
      // left. So five pins leave no room for anything else, and two pins are
      // followed by the three newest threads — which is the ranking someone
      // pinning a chat is asking for.
      const ordered = [
        ...pinnedIds,
        ...(recentRes.data ?? [])
          .map((c) => c.id)
          .filter((id) => !pinnedIds.includes(id)),
      ];

      if (ordered.length === 0) {
        setActions(EMPTY_FALLBACK);
        fetchedAt.current = Date.now();
        return;
      }

      // Round two. The member reads only need ids, which round one already
      // settled, so the top-up for missed pins rides alongside them rather
      // than adding a third trip.
      const [missingRes, peersRes, mineRes] = await Promise.all([
        missingIds.length > 0
          ? supabase
              .from("conversations")
              .select("id, type, title, last_message_at")
              .in("id", missingIds)
          : Promise.resolve({ data: [] as Conv[] }),
        supabase
          .from("conversation_members")
          .select(
            "conversation_id, profiles(display_name, username, avatar_hue, avatar_url)"
          )
          .in("conversation_id", ordered)
          .neq("user_id", currentUserId),
        supabase
          .from("conversation_members")
          .select("conversation_id, last_read_at, request_accepted, blocked_at")
          .in("conversation_id", ordered)
          .eq("user_id", currentUserId),
      ]);

      ((missingRes.data ?? []) as Conv[]).forEach((c) => byId.set(c.id, c));

      type Peer = { name: string; hue: number; src: string | null };
      const peers = new Map<string, Peer[]>();
      (peersRes.data ?? []).forEach((m) => {
        // PostgREST hands back an object or a one-element array depending on
        // how it resolves the embed; the inbox page normalises the same way.
        const raw = m.profiles as unknown;
        const p = (Array.isArray(raw) ? raw[0] : raw) as {
          display_name: string | null;
          username: string | null;
          avatar_hue: number | null;
          avatar_url: string | null;
        } | null;
        if (!p) return;
        const arr = peers.get(m.conversation_id) ?? [];
        arr.push({
          name: p.display_name ?? p.username ?? "User",
          hue: p.avatar_hue ?? 280,
          src: p.avatar_url ?? null,
        });
        peers.set(m.conversation_id, arr);
      });

      const hidden = new Set<string>();
      const readAt = new Map<string, string | null>();
      (mineRes.data ?? []).forEach((m) => {
        // A blocked thread or a request you have not accepted is not something
        // to surface one thumb-slide from the inbox.
        if (m.blocked_at || m.request_accepted === false)
          hidden.add(m.conversation_id);
        readAt.set(m.conversation_id, m.last_read_at);
      });

      // Unread by timestamp rather than by counting messages: the pip only has
      // to say "something happened here", and this needs no extra query.
      // It can read as unread for a thread whose last message is your own,
      // which is a far cheaper mistake than a query per conversation.
      const isUnread = (id: string, lastAt: string | null) => {
        if (!lastAt) return false;
        const seen = readAt.get(id);
        return !seen || new Date(lastAt) > new Date(seen);
      };

      const next: HoldAction[] = [];
      for (const id of ordered) {
        const c = byId.get(id);
        if (!c) continue; // pinned row the top-up did not return
        if (hidden.has(c.id)) continue;
        const members = peers.get(c.id) ?? [];
        if (members.length === 0) continue; // empty or self-only thread
        const isGroup = c.type === "group";
        next.push({
          label: isGroup
            ? c.title ||
              members
                .slice(0, 2)
                .map((m) => m.name)
                .join(", ") +
                (members.length > 2 ? ` +${members.length - 2}` : "")
            : members[0].name,
          href: `/messages/${c.id}`,
          avatar: isGroup
            ? { name: c.title || "Group", hue: 210 }
            : {
                name: members[0].name,
                hue: members[0].hue,
                src: members[0].src,
              },
          unread: isUnread(c.id, c.last_message_at),
        });
        if (next.length === MAX_RECENTS) break;
      }

      setActions(next.length > 0 ? next : EMPTY_FALLBACK);
      fetchedAt.current = Date.now();
    } catch {
      // Leave whatever is already loaded. An empty list means the hold falls
      // through to a normal tap, which is the honest outcome here.
    } finally {
      inFlight.current = false;
    }
  }, [currentUserId]);

  return (
    <NavHoldMenu actions={actions} label="Recent chats" onArm={load}>
      {children}
    </NavHoldMenu>
  );
}
