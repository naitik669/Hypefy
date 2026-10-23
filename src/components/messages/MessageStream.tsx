"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * One realtime channel for the three things the shell listens to, instead of
 * three.
 *
 * BottomNav and InAppNotifier live in the app layout, so they are mounted on
 * every page; MessagesInbox joins them on /messages. All three opened their
 * own channel with an UNFILTERED `messages` INSERT subscription. A filter is
 * what lets Realtime discard a change cheaply, and without one every insert
 * anywhere in the app is matched against every one of those subscriptions,
 * and RLS is evaluated per subscription per subscriber. Three copies of the
 * same question, asked of every message every other user sends.
 *
 * They cannot simply be filtered: "messages in conversations I am a member
 * of" is a join, not a column match, which is why the subscriptions are
 * unfiltered in the first place. RLS still decides what is delivered — this
 * is about how many times that decision is made, not about what reaches the
 * client.
 *
 * So the shell asks once and hands the rows out. Every handler keeps exactly
 * the body it had; only the delivery is shared. The per-conversation
 * subscription in RealChatView is NOT part of this: it is properly filtered
 * by conversation_id, which is the cheap case, and it is scoped to one open
 * thread rather than to the session.
 *
 * `conversation_members` is in here too, and only works at all because 0155
 * finally published it.
 */

type Row = Record<string, unknown>;
/** A realtime row, and which kind of change produced it. */
type Handler = (row: Row, event: "INSERT" | "UPDATE" | "DELETE") => void;
type Register = (handler: Handler) => () => void;

type Streams = {
  /** Any message inserted that RLS lets this user see. */
  onMessage: Register;
  /** Reactions, all events — the inbox counts them, the notifier only adds. */
  onReaction: Register;
  /** This user's own conversation_members rows: read, mute, lock, archive. */
  onMembership: Register;
};

const StreamContext = createContext<Streams | null>(null);

/** A set of handlers, and the register function that maintains it. */
function useHandlerSet(): [React.RefObject<Set<Handler>>, Register] {
  const handlers = useRef<Set<Handler>>(new Set());
  const register = useCallback<Register>((handler) => {
    handlers.current.add(handler);
    return () => {
      handlers.current.delete(handler);
    };
  }, []);
  return [handlers, register];
}

export function MessageStreamProvider({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const [messageHandlers, onMessage] = useHandlerSet();
  const [reactionHandlers, onReaction] = useHandlerSet();
  const [membershipHandlers, onMembership] = useHandlerSet();

  useEffect(() => {
    const supabase = createClient();
    // A handler that throws must not stop the ones registered after it.
    const fan = (set: React.RefObject<Set<Handler>>) =>
      (row: Row, event: "INSERT" | "UPDATE" | "DELETE") => {
        for (const handler of [...set.current]) {
          try {
            handler(row, event);
          } catch {
            /* one listener's problem is not the others' */
          }
        }
      };

    const toMessages = fan(messageHandlers);
    const toReactions = fan(reactionHandlers);
    const toMembership = fan(membershipHandlers);

    const channel = supabase
      .channel(`app-stream:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (p) => toMessages((p.new ?? p.old) as Row, "INSERT"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_reactions" },
        (p) => toReactions(p.new as Row, p.eventType as "INSERT" | "UPDATE" | "DELETE"),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${userId}`,
        },
        (p) => toMembership(p.new as Row, "UPDATE"),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, messageHandlers, reactionHandlers, membershipHandlers]);

  // The three register functions are stable, so this object is made once and
  // consumers never re-register because the provider re-rendered.
  const value = useMemo<Streams>(
    () => ({ onMessage, onReaction, onMembership }),
    [onMessage, onReaction, onMembership],
  );

  return <StreamContext.Provider value={value}>{children}</StreamContext.Provider>;
}

/**
 * Register for one of the streams.
 *
 * The handler is held in a ref and the registration happens once, so a
 * caller can pass a fresh closure on every render — which all three of them
 * do — without re-registering or going stale.
 *
 * Outside the provider this is a no-op rather than a throw. The shell is
 * mounted only for a signed-in user, and these components also render on
 * public pages where there is nothing to listen for.
 */
function useStream(pick: keyof Streams, handler: Handler): void {
  const streams = useContext(StreamContext);
  const latest = useRef(handler);
  // In an effect, not during render. Effects run in declaration order, so
  // this one has already refreshed the ref by the time the registration
  // below runs, and at mount useRef has it anyway.
  useEffect(() => {
    latest.current = handler;
  });

  useEffect(() => {
    if (!streams) return;
    return streams[pick]((row, event) => latest.current(row, event));
  }, [streams, pick]);
}

export function useMessageInsert(handler: Handler): void {
  useStream("onMessage", handler);
}
export function useReactionChange(handler: Handler): void {
  useStream("onReaction", handler);
}
export function useMembershipUpdate(handler: Handler): void {
  useStream("onMembership", handler);
}
